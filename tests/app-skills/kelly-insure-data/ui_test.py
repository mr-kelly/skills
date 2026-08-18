from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-insure-data"
APP_ROOT = SKILL_ROOT / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-insure-data"
BUSABASE_VERSION = "0.16.2"

# Kelly Insure Data does not lazily provision its own Busabase resources —
# unlike every other converted skill, the Drive node and the four Bases are
# an existing production insurance dataset an operator provisions with the
# trusted scripts/restore_busabase_snapshot.mjs, not something the AirApp
# creates on first run (see app/app/js/config.js's header comment). So this
# OSS integration test seeds a fixture workspace with that same trusted
# script instead of clicking a "[data-provision]" button, then boots the
# AirApp against it and asserts the UI renders the seeded records with zero
# setup interaction.
#
# Drive-node OSS *read* coverage: the fixture below also creates the Drive
# node and a single seeded file (see FIXTURE_MANIFEST) — the restore script
# was verified live to create the folder/Drive/Bases/records correctly
# against a real `busabase@0.11.0` server while building this skill. So this
# test does exercise the Drive end-to-end, unlike the fallback the task
# description pre-authorized for skills where that could not be confirmed.


def fixture_manifest() -> dict:
    def info_fields():
        return [
            {"slug": "title", "name": "Title", "type": "text", "required": True, "options": {}},
            {"slug": "content", "name": "Content", "type": "longtext", "required": False, "options": {}},
            {"slug": "source_url", "name": "Source URL", "type": "text", "required": False, "options": {}},
            {"slug": "published_at", "name": "Published at", "type": "text", "required": False, "options": {}},
            {"slug": "carrier", "name": "Carrier", "type": "text", "required": False, "options": {}},
            {"slug": "status", "name": "Status", "type": "text", "required": False, "options": {}},
        ]

    return {
        "schema_version": "1",
        "generated_at": "2026-08-04T00:00:00.000Z",
        "source": "busabase",
        "folder": {
            "id": "",
            "slug": "hk-insurance-company-folders",
            "name": "港险资料库",
            "description": "",
        },
        "drive": {
            "node_id": "",
            "slug": "hk-insurance-drive",
            "name": "港险资料库 Drive",
            "description": "港险资料库文件盘",
            "metadata": {"owner": "Kelly"},
            "files": [],
        },
        "bases": {
            "featured": {
                "id": "",
                "node_id": "",
                "slug": "featured-information",
                "name": "资讯精选",
                "description": "",
                "fields": info_fields(),
                "records": [
                    {
                        "id": "",
                        "fields": {
                            "title": "Integration Fixture Featured Item",
                            "content": "Fixture content",
                            "carrier": "Example Life",
                            "status": "active",
                        },
                    }
                ],
            },
            "notices": {
                "id": "",
                "node_id": "",
                "slug": "insurance-news",
                "name": "保司通知",
                "description": "",
                "fields": info_fields(),
                "records": [
                    {
                        "id": "",
                        "fields": {
                            "title": "Integration Fixture Notice",
                            "content": "Fixture content",
                            "carrier": "Example Life",
                            "status": "active",
                        },
                    }
                ],
            },
            "qa": {
                "id": "",
                "node_id": "",
                "slug": "insurance-qa",
                "name": "问答",
                "description": "",
                "fields": [
                    {"slug": "question", "name": "Question", "type": "text", "required": True, "options": {}},
                    {"slug": "answer", "name": "Answer", "type": "longtext", "required": False, "options": {}},
                    {"slug": "carrier", "name": "Carrier", "type": "text", "required": False, "options": {}},
                    {"slug": "source_path", "name": "Source path", "type": "text", "required": False, "options": {}},
                    {"slug": "status", "name": "Status", "type": "text", "required": False, "options": {}},
                ],
                "records": [
                    {
                        "id": "",
                        "fields": {
                            "question": "Integration Fixture Question?",
                            "answer": "Integration Fixture Answer.",
                            "carrier": "Example Life",
                            "status": "active",
                        },
                    }
                ],
            },
            "feedback": {
                "id": "",
                "node_id": "",
                "slug": "user-feedback",
                "name": "用户反馈",
                "description": "",
                "fields": [
                    {"slug": "title", "name": "Title", "type": "text", "required": True, "options": {}},
                    {"slug": "content", "name": "Content", "type": "longtext", "required": False, "options": {}},
                    {"slug": "source", "name": "Source", "type": "text", "required": False, "options": {}},
                    {"slug": "status", "name": "Status", "type": "text", "required": False, "options": {}},
                    {"slug": "created_at", "name": "Created at", "type": "text", "required": False, "options": {}},
                ],
                "records": [
                    {
                        "id": "",
                        "fields": {
                            "title": "Integration Fixture Feedback",
                            "content": "Fixture content",
                            "source": "test",
                            "status": "new",
                            "created_at": "2026-08-04T00:00:00.000Z",
                        },
                    }
                ],
            },
        },
    }


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

    page.goto(f"{base_url}/?demo=1#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-files").inner_text() == "4"
    assert page.locator("#count-qa").inner_text() == "4"
    assert page.locator("#count-news").inner_text() == "3"
    assert page.locator("#count-feedback").inner_text() == "2"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/qa")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 4
    page.locator(".item-list .item-row").first.click()
    page.wait_for_timeout(150)
    assert page.locator(".detail-panel h2").is_visible()

    page.goto(f"{base_url}/?demo=1#/news")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 3

    page.goto(f"{base_url}/?demo=1#/feedback")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 2

    page.goto(f"{base_url}/?demo=1#/settings")
    page.wait_for_load_state("networkidle")
    assert page.get_by_text("hk-insurance-drive").is_visible()
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/overview")
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


def test_busabase_integration(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-insure-data-busabase-") as data_dir:
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
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90) as (
            _,
            busabase_logs,
        ):
            script_env = {"BUSABASE_BASE_URL": busabase_url, "BUSABASE_SPACE_ID": "local"}
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as manifest_file:
                json.dump(fixture_manifest(), manifest_file)
                manifest_path = manifest_file.name
            try:
                result = subprocess.run(
                    ["node", "scripts/restore_busabase_snapshot.mjs", "--manifest", manifest_path, "--apply"],
                    cwd=SKILL_ROOT,
                    env={**script_env, "PATH": __import__("os").environ["PATH"]},
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
            finally:
                Path(manifest_path).unlink(missing_ok=True)
            assert result.returncode == 0, f"restore script failed:\n{result.stdout}\n{result.stderr}"
            restore_summary = json.loads(result.stdout)
            assert restore_summary["ok"] is True, restore_summary
            assert restore_summary["qa"]["restored"] == 1, restore_summary
            assert restore_summary["feedback"]["restored"] == 1, restore_summary

            with tempfile.TemporaryDirectory(prefix="kelly-insure-data-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "BUSABASE_SPACE_ID": "local", "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (_, app_logs):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    try:
                        page.goto(f"{app_url}/#/overview")
                        page.wait_for_load_state("networkidle")
                        # No AirApp in this batch ever shows a provisioning button for
                        # Kelly Insure Data; a seeded, pre-existing workspace renders
                        # immediately with no setup interaction.
                        assert page.locator("[data-provision]").count() == 0
                        assert page.locator("#count-files").inner_text() == "1"
                        assert page.locator("#count-qa").inner_text() == "1"
                        assert page.locator("#count-news").inner_text() == "2"
                        assert page.locator("#count-feedback").inner_text() == "1"

                        page.goto(f"{app_url}/#/qa")
                        page.wait_for_load_state("networkidle")
                        assert page.locator(".detail-panel h2").inner_text() == "Integration Fixture Question?"

                        page.goto(f"{app_url}/#/news")
                        page.wait_for_load_state("networkidle")
                        assert page.locator(".item-list .item-row").count() == 2

                        page.goto(f"{app_url}/#/feedback")
                        page.wait_for_load_state("networkidle")
                        assert page.locator(".detail-panel h2").inner_text() == "Integration Fixture Feedback"

                        page.goto(f"{app_url}/#/files")
                        page.wait_for_load_state("networkidle")
                        assert page.locator(".detail-panel h2").inner_text() == "README.md"

                        assert_no_horizontal_overflow(page)
                        assert not errors, errors
                    except Exception:
                        raise AssertionError(
                            f"OSS Busabase integration assertion failed.\n"
                            f"App logs: {''.join(app_logs[-100:])}\n"
                            f"Busabase logs: {''.join(busabase_logs[-100:])}"
                        )
                    context.close()


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-insure-data-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_integration(browser)
                    print("PASS OSS - trusted restore script + read-only rendering against a real Busabase server")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
