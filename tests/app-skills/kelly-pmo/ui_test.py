from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))
from runtime import free_port, managed_process

APP_ROOT = REPO_ROOT / "skills" / "kelly-pmo" / "content" / "kelly-pmo-app"
SKILL_ROOT = REPO_ROOT / "skills" / "kelly-pmo"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-pmo"
BUSABASE_VERSION = "0.16.2"


def assert_no_overflow(page: Page) -> None:
    size = page.evaluate("() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })")
    assert size["content"] <= size["viewport"] + 1, size


def capture_errors(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    return errors


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = capture_errors(page)
    page.goto(f"{base_url}/?demo=overview&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator(".metric").count() == 4
    assert page.locator("#countDecisions").inner_text() == "3"
    assert page.locator("#countRisk").inner_text() == "3"
    assert_no_overflow(page)

    page.goto(f"{base_url}/?demo=projects&lang=en#/projects")
    page.wait_for_load_state("networkidle")
    assert page.locator(".project-row").count() == 6
    page.locator(".project-row").nth(1).click()
    assert "Unified data platform" in page.locator(".detail-heading").inner_text()
    page.go_back()
    page.wait_for_load_state("networkidle")

    page.goto(f"{base_url}/?demo=milestones&lang=en#/milestones")
    page.wait_for_load_state("networkidle")
    assert page.locator("tbody tr").count() == 8
    page.locator("[data-milestone]").first.click()

    page.goto(f"{base_url}/?demo=decisions&lang=en#/decisions")
    page.wait_for_load_state("networkidle")
    page.locator('[data-decision-note="dec-identity"]').fill("Proceed with checkpoints")
    page.locator('[data-decision="dec-identity"][data-action="approve"]').click()
    assert "approved" in page.locator(".decision-card").first.inner_text().lower()

    page.goto(f"{base_url}/?demo=workspace&lang=zh#/workspace/projects")
    page.wait_for_load_state("networkidle")
    assert page.locator(".workspace-table-row").count() == 12
    assert page.locator(".native-view.available").count() == 5
    assert "项目计划" in page.locator(".resource-detail").inner_text()

    page.goto(f"{base_url}/?demo=overview&lang=zh#/settings")
    page.wait_for_load_state("networkidle")
    assert page.locator("#settingsModal").is_visible()
    assert "数字化交付项目组合" in page.locator("#settingsBody").inner_text()
    page.locator("#settingsClose").click()
    page.wait_for_timeout(100)
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = capture_errors(page)
        page.goto(f"{base_url}/?demo=projects&lang=en#/projects")
        page.wait_for_load_state("networkidle")
        assert_no_overflow(page)
        page.locator("#mobileSidebarToggle").click()
        assert page.locator("body.sidebar-open").count() == 1
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 4, "y": 4})
        assert page.locator("body.sidebar-open").count() == 0
        page.locator(".project-row").first.click()
        page.wait_for_selector("body.mobile-detail-open")
        assert page.locator("body.mobile-detail-open").count() == 1
        assert page.locator(".back-to-list").is_visible()
        page.locator(".back-to-list").click()
        page.wait_for_selector("body.mobile-detail-open", state="detached")
        assert page.locator("body.mobile-detail-open").count() == 0
        page.goto(f"{base_url}/?demo=overview&lang=en#/settings")
        assert page.locator("#settingsModal").is_visible()
        assert_no_overflow(page)
        page.goto(f"{base_url}/?demo=workspace&lang=en#/workspace/testing")
        assert page.locator(".workspace-table-row").count() == 12
        assert page.locator("body.mobile-detail-open").count() == 1
        assert page.locator(".back-to-list").is_visible()
        assert_no_overflow(page)
        assert not errors, errors
        mobile.close()


def read_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as response:
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


def test_oss_provisioning(browser) -> None:
    busabase_port, app_port = free_port(), free_port()
    busabase_url, app_url = f"http://127.0.0.1:{busabase_port}", f"http://127.0.0.1:{app_port}"
    with tempfile.TemporaryDirectory(prefix="kelly-pmo-busabase-") as data_dir:
        command = ["npx", "-y", f"busabase@{BUSABASE_VERSION}", "server", "--host", "127.0.0.1", "--port", str(busabase_port), "--data", data_dir]
        with managed_process(command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            with tempfile.TemporaryDirectory(prefix="kelly-pmo-home-") as app_home:
                env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = capture_errors(page)
                    page.goto(f"{app_url}/#/overview")
                    page.wait_for_load_state("networkidle")
                    page.get_by_role("heading", name="Initialize the Busabase workspace").wait_for()
                    page.locator("[data-provision]").click()
                    page.wait_for_selector("[data-provision]", state="detached", timeout=30_000)
                    page.wait_for_load_state("networkidle")
                    assert not errors, errors
                    context.close()
                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                expected_resources = [
                    "app-root", "programs", "project-teams", "projects", "reports", "special-tasks",
                    "communications", "resources", "functional-groups", "glossary", "testing", "requirements",
                    "iterations", "milestones", "risks", "decisions", "settings",
                ]
                assert sorted(resource_keys(nodes)) == sorted(expected_resources), nodes

                sync_env = {**os.environ, "BUSABASE_BASE_URL": busabase_url}
                first_sync = subprocess.run(
                    ["node", "scripts/sync-native-views.mjs", "--apply"],
                    cwd=SKILL_ROOT,
                    env=sync_env,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                assert first_sync.returncode == 0, first_sync.stdout + first_sync.stderr
                assert "Materialized" in first_sync.stdout, first_sync.stdout
                second_sync = subprocess.run(
                    ["node", "scripts/sync-native-views.mjs", "--check"],
                    cwd=SKILL_ROOT,
                    env=sync_env,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                assert second_sync.returncode == 0, second_sync.stdout + second_sync.stderr
                assert "up to date" in second_sync.stdout, second_sync.stdout

                support_sync = subprocess.run(
                    ["node", "scripts/sync-support-nodes.mjs", "--apply"],
                    cwd=SKILL_ROOT,
                    env=sync_env,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                assert support_sync.returncode == 0, support_sync.stdout + support_sync.stderr
                assert "Materialized 8" in support_sync.stdout, support_sync.stdout
                support_check = subprocess.run(
                    ["node", "scripts/sync-support-nodes.mjs"],
                    cwd=SKILL_ROOT,
                    env=sync_env,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                assert support_check.returncode == 0, support_check.stdout + support_check.stderr
                assert "up to date" in support_check.stdout, support_check.stdout
                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                support_types = {
                    "playbook": "doc", "files": "drive", "import-schema": "file", "status-form": "form",
                    "dependency-map": "whiteboard", "weekly-workflow": "workflow", "wallboard": "html",
                    "operator-skill": "skill",
                }
                for key, node_type in support_types.items():
                    found = find_resource(nodes, key)
                    assert found is not None, (key, nodes)
                    assert found["type"] == node_type

                native_views = json.loads((SKILL_ROOT / "references" / "native-views.json").read_text())
                expected_view_count = sum(len(base["views"]) for base in native_views["bases"])
                actual_views = []
                for key in expected_resources[1:]:
                    resource = find_resource(nodes, key)
                    actual_views.extend(read_json(f"{busabase_url}/api/v1/bases/{resource['baseId']}/views"))
                assert len(actual_views) == expected_view_count
                assert {view["type"] for view in actual_views} == {"table", "gallery", "kanban", "calendar", "gantt"}
        with managed_process(command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 25, nodes


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-pmo-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - Kelly PMO demo UI at desktop and phone viewports")
                    test_oss_provisioning(browser)
                    print("PASS OSS - Kelly PMO lazy provisioning and restart persistence")
                except Exception:
                    for context_index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{context_index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
