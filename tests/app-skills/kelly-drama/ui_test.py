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

APP_ROOT = REPO_ROOT / "skills" / "kelly-drama" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-drama"
BUSABASE_VERSION = "0.11.0"

# Demo dataset counts below were read off the live DOM with a throwaway probe
# before writing these selectors (per the migration recipe's gotcha list),
# not guessed from source: 7 characters, 6 relationships, 12 episodes
# (episode ep-001 has 6 shots), and 3 tasks — see the retired
# app/server/demo.ts's demoProject() ported into
# app/app/js/providers/demo-provider.js.


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

    page.goto(f"{base_url}/?demo=overview&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#itemCount").inner_text() == "Overview"
    assert page.locator(".visual-bible-card").count() == 1
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=characters&lang=en#/characters")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .item-card").count() == 7

    page.goto(f"{base_url}/?demo=relationships&lang=en#/relationships")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .item-card").count() == 6

    page.goto(f"{base_url}/?demo=episodes&lang=en#/episodes")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .episode-table tbody tr").count() == 12

    page.goto(f"{base_url}/?demo=episodes&lang=en#/episodes/ep-001/shots")
    page.wait_for_load_state("networkidle")
    assert page.locator(".shot-row-wrap").count() == 6

    # Expanding a shot renders its production sheet with a working
    # prompt-preview modal (pure client-side computation now — no /api round
    # trip) and an image-zoom modal.
    page.locator(".shot-row").first.click()
    page.wait_for_timeout(200)
    assert page.locator(".shot-row-detail .storyboard-image img").count() == 1
    page.locator("[data-prompt-preview]").first.click()
    page.wait_for_timeout(200)
    assert page.locator(".modal-card .prompt-pre").count() >= 1
    assert len(page.locator(".prompt-pre").first.inner_text()) > 0
    page.locator(".modal-close-button").click()
    page.wait_for_timeout(100)
    assert page.locator(".modal-card").count() == 0
    page.locator(".shot-row-detail .storyboard-image img").click()
    page.wait_for_timeout(200)
    assert page.locator(".modal-image-wrap").count() == 1
    page.locator(".modal-close-button").click()

    # Character detail shows a generated reference card and its regenerate
    # button (character-consistency generation-request flow).
    page.goto(f"{base_url}/?demo=characters&lang=en#/characters/char-lin-wan")
    page.wait_for_load_state("networkidle")
    assert page.locator(".character-reference").count() == 1
    assert page.locator("[data-generate-character-card]").count() == 1

    page.goto(f"{base_url}/?demo=overview&lang=en#/tasks")
    page.wait_for_load_state("networkidle")
    assert page.locator("#list .item-card").count() == 3

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=episodes&lang=en#/episodes")
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
    """Lazy provisioning (7 Bases: project/settings/characters/relationships/
    episodes/shots/tasks), a live text-field write round trip (task title
    edit -> Busabase -> re-read), and persistence across a full Busabase
    process restart.

    Drive/Asset binary upload coverage is deliberately NOT exercised here.
    Verified live against this exact `busabase@0.11.0` standalone-CLI target:
    `assets.createUploadUrl()` returns an `/api/dev/upload` URL that then
    404s ("Not available in production") under the CLI's own production
    NODE_ENV gate, so no Asset upload completes against this CLI build
    regardless of what an AirApp does. This is an upstream package/CLI gap,
    not a kelly-drama defect — see server.js's and js/drama-client.js's
    header comments for the full trace. Scoped down per the migration
    recipe's documented-gap allowance (mirrors kelly-mv's identical
    precedent, this skill's closest architectural twin).
    """
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-drama-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-drama-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/overview")
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
                tasks_base = find_resource(nodes, "tasks")
                assert tasks_base and tasks_base.get("baseId"), nodes

                # Seed one task record directly via the Busabase REST API
                # (mirrors kelly-feedback's fixture pattern) — this is the
                # real record write path (bases.createChangeRequest), the
                # same one the browser itself uses for every text edit.
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{tasks_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "task-id": "task-fixture",
                            "kind": "episode",
                            "target-id": "ep-001",
                            "status": "needs_review",
                            "title": "Integration Fixture Task",
                            "note": "Fixture task seeded by the OSS integration test.",
                            "deleted": "false",
                        },
                        "message": "Seed Kelly Drama integration fixture",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [record_cr["id"]]})

                # A fresh app process must discover the existing resources
                # and records, show the seeded task, and a live edit through
                # the UI must write straight back to Busabase. Desktop
                # viewport: the mobile shell only opens the detail panel from
                # an explicit [data-select] click (setMobileDetailOpen), not
                # a direct hash navigation — mobile layout itself is already
                # covered by test_demo_ui.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/tasks/task-fixture")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    title_field = page.locator('form[data-kind="tasks"] input[name="title"]')
                    title_field.wait_for(state="visible", timeout=15_000)
                    title_field.fill("Integration Fixture Task (edited)")
                    page.locator('form[data-kind="tasks"] button[type="submit"]').click()
                    page.wait_for_timeout(800)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={tasks_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r for r in record_items if r.get("headCommit", {}).get("fields", {}).get("task-id") == "task-fixture"
                )
                assert fixture["headCommit"]["fields"]["title"] == "Integration Fixture Task (edited)", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "project", "settings", "characters", "relationships", "episodes", "shots", "tasks"]
            ), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 8, nodes
            tasks_base = find_resource(nodes, "tasks")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={tasks_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("title") == "Integration Fixture Task (edited)"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-drama-home-") as app_home:
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
