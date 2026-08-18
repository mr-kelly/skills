from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-email"
APP_ROOT = SKILL_ROOT / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-email"
BUSABASE_VERSION = "0.16.2"


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
    page.goto(f"{base_url}/?demo=1#/inbox")
    page.wait_for_load_state("networkidle")
    assert page.locator(".message-row").count() >= 1
    assert_no_horizontal_overflow(page)

    page.locator(".message-row").first.click()
    page.wait_for_timeout(150)
    assert page.get_by_role("button", name="Approve").first.is_visible()
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/inbox")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        page.locator("#mobileSidebarToggle").click()
        page.wait_for_timeout(150)
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 5, "y": 5})
        page.wait_for_timeout(150)

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


def find_base(nodes, resource_key: str):
    for node in nodes:
        if (node.get("metadata") or {}).get("resourceKey") == resource_key:
            return node
        found = find_base(node.get("children") or [], resource_key)
        if found:
            return found
    return None


def run_init_schema(busabase_url: str) -> None:
    # kelly-email provisions its Folder/Bases/Drive through this trusted CLI
    # script (see scripts/init_busabase_schema.ts), not a browser button —
    # the running AirApp only ever reads and reports readiness.
    result = subprocess.run(
        ["node", "scripts/init_busabase_schema.ts", "--apply"],
        cwd=SKILL_ROOT,
        env={**__import__("os").environ, "BUSABASE_BASE_URL": busabase_url},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, f"init_busabase_schema.ts --apply failed:\n{result.stdout}\n{result.stderr}"


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-email-busabase-") as data_dir:
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
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            run_init_schema(busabase_url)

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            reviews_base = find_base(nodes, "reviews")
            assert reviews_base and reviews_base.get("baseId"), nodes

            record_cr = post_json(
                f"{busabase_url}/api/v1/bases/{reviews_base['baseId']}/change-requests",
                {
                    "fields": {
                        "record-id": "email-item-review-fixture",
                        "item-id": "review-fixture",
                        "batch-id": "kelly-skills-test-fixture",
                        "subject": "Integration Fixture Email",
                        "status": "needs_review",
                        "kind": "review_item",
                        "sender": "fixture@example.test",
                        "summary": "Seeded for the OSS integration test.",
                    },
                    "message": "Seed Kelly Email integration fixture",
                    "submittedBy": "kelly-skills-test",
                },
            )
            post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [record_cr["id"]]})

            app_port = free_port()
            app_url = f"http://127.0.0.1:{app_port}"
            with tempfile.TemporaryDirectory(prefix="kelly-email-home-") as app_home:
                app_env = {
                    "BUSABASE_BASE_URL": busabase_url,
                    "BUSABASE_SPACE_ID": "local",
                    "HOME": app_home,
                    "PORT": str(app_port),
                }
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/auth/status"):
                    # Runtime readiness (Folder/Bases/Drive exist) and product onboarding
                    # (an account configuration record) are deliberately separate gates —
                    # see SKILL.md. Resources are ready; onboarding is not, since no account
                    # config record was seeded, so the app must show the onboarding card
                    # rather than the seeded review record.
                    state = read_json(f"{app_url}/api/state")
                    assert state["provider_status"]["ok"] is True, state
                    assert state["provider_status"]["connection"] == {
                        "folder_exists": True,
                        "base_exists": True,
                        "contacts_base_exists": True,
                        "settings_base_exists": True,
                        "drive_exists": True,
                    }, state
                    assert state["setup"]["state"] == "needs_config", state

                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/inbox")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("#listCount").inner_text() == "Setup required"
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            reviews_base = find_base(nodes, "reviews")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={reviews_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("subject") == "Integration Fixture Email"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-email-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(
            ["node", "server.js"],
            APP_ROOT,
            {"HOME": app_home, "PORT": str(port)},
            f"{base_url}/auth/status",
        ):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - schema init, seeded record read, and persistence against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
