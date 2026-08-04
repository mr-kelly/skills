from __future__ import annotations

import json
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

APP_ROOT = REPO_ROOT / "skills" / "kelly-mv" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-mv"
BUSABASE_VERSION = "0.11.0"

# Demo dataset counts below were read off the live DOM with a throwaway probe
# before writing these selectors (per the migration recipe's gotcha list),
# not guessed from source: 5 cast members (2 approved, 1 needs_review, 2
# draft), 12 storyboard shots, and a concept checklist that reads "2/4" ready
# (song + concept are ready; cast has 2 members missing reference cards, and
# no shot has a video yet) — see app/server/demo.ts's demoProject() ported
# into app/app/js/providers/demo-provider.js.


def assert_no_horizontal_overflow(page: Page) -> None:
    dimensions = page.evaluate(
        """() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        })"""
    )
    assert dimensions["content"] <= dimensions["viewport"] + 1, dimensions


def attach_error_capture(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    return errors


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)

    page.goto(f"{base_url}/?demo=overview&lang=en#/concept")
    page.wait_for_load_state("networkidle")
    assert page.locator("#itemCount").inner_text() == "2/4"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=cast&lang=en#/cast")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .item-card").count() == 5

    page.goto(f"{base_url}/?demo=storyboard&lang=en#/storyboard")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .shot-row").count() == 12

    # Selecting a shot renders its detail sheet with the prompt-preview modal
    # available (pure client-side computation now — no /api round trip).
    page.goto(f"{base_url}/?demo=storyboard&lang=en#/storyboard/shot-demo-01")
    page.wait_for_load_state("networkidle")
    assert page.locator(".storyboard-image").count() == 1
    page.locator("#shotPromptPreview").click()
    page.wait_for_timeout(200)
    assert page.locator(".modal .prompt-pre").count() >= 1
    assert len(page.locator(".prompt-pre").first.inner_text()) > 0
    page.locator("#promptClose").click()

    # Cast detail shows a generated reference card for a demo character.
    page.goto(f"{base_url}/?demo=cast&lang=en#/cast/char-demo-dreamer")
    page.wait_for_load_state("networkidle")
    assert page.locator(".character-reference").count() == 1

    # Song view: the demo song has a synthetic silent-WAV data URL, playable
    # without any network fetch.
    page.goto(f"{base_url}/?demo=song&lang=en#/song")
    page.wait_for_load_state("networkidle")
    assert page.locator("audio").count() == 1

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=storyboard&lang=en#/storyboard")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        page.locator("#mobileSidebarToggle").click()
        assert page.locator("body.sidebar-open").count() == 1
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 5, "y": 5})
        assert page.locator("body.sidebar-open").count() == 0

        assert_no_horizontal_overflow(page)
        assert not errors, errors
        mobile.close()


def read_json(url: str):
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.load(response)


def post_json(url: str, payload: dict):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def resource_keys(nodes) -> list[str]:
    keys: list[str] = []
    for node in nodes:
        key = (node.get("metadata") or {}).get("resourceKey")
        if key:
            keys.append(key)
        keys.extend(resource_keys(node.get("children") or []))
    return keys


def find_resource(nodes, resource_key: str):
    for node in nodes:
        if (node.get("metadata") or {}).get("resourceKey") == resource_key:
            return node
        found = find_resource(node.get("children") or [], resource_key)
        if found:
            return found
    return None


def test_busabase_provisioning(browser) -> None:
    """Lazy provisioning (4 Bases: project/settings/cast/shots), a live
    text-field write round trip (shot title edit -> Busabase -> re-read), and
    persistence across a full Busabase process restart.

    Drive/Asset binary upload coverage is deliberately NOT exercised here.
    Verified live against this exact `busabase@0.11.0` standalone-CLI target:
    `assets.createUploadUrl()` returns an `/api/dev/upload` URL that then
    404s ("Not available in production") under the CLI's own production
    NODE_ENV gate, so no Asset upload completes against this CLI build
    regardless of what an AirApp does. This is an upstream package/CLI gap,
    not a kelly-mv defect — see server.js's and js/mv-client.js's header
    comments for the full trace. Scoped down per the migration recipe's
    documented-gap allowance (mirrors kelly-insure-data's precedent for its
    one unverifiable Drive write path).
    """
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-mv-busabase-") as data_dir:
        busabase_command = [
            "npx",
            "-y",
            f"busabase@{BUSABASE_VERSION}",
            "server",
            "--host",
            "127.0.0.1",
            "--port",
            str(busabase_port),
            "--data",
            data_dir,
        ]
        with managed_process(
            busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90
        ) as (_, busabase_logs):
            with tempfile.TemporaryDirectory(prefix="kelly-mv-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/concept")
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="Initialize the Busabase workspace").is_visible()
                    page.locator("[data-provision]").click()
                    try:
                        page.wait_for_selector("[data-provision]", state="detached", timeout=30_000)
                    except Exception:
                        nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                        change_requests = read_json(f"{busabase_url}/api/v1/change-requests")
                        raise AssertionError(
                            "Lazy provisioning did not become ready.\n"
                            f"Page: {page.locator('body').inner_text()}\n"
                            f"Nodes: {json.dumps(nodes, ensure_ascii=False)}\n"
                            f"Change requests: {json.dumps(change_requests, ensure_ascii=False)}\n"
                            f"App logs: {''.join(app_logs[-100:])}\n"
                            f"Busabase logs: {''.join(busabase_logs[-100:])}"
                        )
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                shots_base = find_resource(nodes, "shots")
                assert shots_base and shots_base.get("baseId"), nodes

                # Seed one shot record directly via the Busabase REST API
                # (mirrors kelly-feedback's fixture pattern) — this is the
                # real record write path (bases.createChangeRequest), the
                # same one the browser itself uses for every text edit.
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{shots_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "shot-id": "shot-fixture",
                            "position": 1,
                            "title": "Integration Fixture Shot",
                            "status": "draft",
                            "description": "Fixture shot seeded by the OSS integration test.",
                            "duration-seconds": 8,
                            "characters-json": "[]",
                            "image-candidates-json": "[]",
                            "video-candidates-json": "[]",
                            "deleted": "false",
                        },
                        "message": "Seed Kelly MV integration fixture",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [record_cr["id"]]})

                # A fresh app process must discover the existing resources and
                # records, show the seeded shot, and a live edit through the
                # UI must write straight back to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/storyboard/shot-fixture")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    title_field = page.locator("[data-field=title]")
                    title_field.fill("Integration Fixture Shot (edited)")
                    page.locator("#shotSave").click()
                    page.wait_for_timeout(800)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={shots_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r for r in record_items if r.get("headCommit", {}).get("fields", {}).get("shot-id") == "shot-fixture"
                )
                assert fixture["headCommit"]["fields"]["title"] == "Integration Fixture Shot (edited)", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "project", "settings", "cast", "shots"]), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 5, nodes
            shots_base = find_resource(nodes, "shots")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={shots_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("title") == "Integration Fixture Shot (edited)"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-mv-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print(
                        "PASS OSS - lazy provisioning, live text-field write, and persistence against temporary "
                        "Busabase (Drive/Asset binary upload round trip not exercised — see test docstring)"
                    )
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
