from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process


APP_ROOT = REPO_ROOT / "skills" / "kelly-invest-stock" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-invest-stock"
BUSABASE_VERSION = "0.11.0"


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


def unexpected_errors(errors: list[str]) -> list[str]:
    # resource-provisioning.js's waitForMaterializedResources() polls
    # nodes.get() by id while a just-submitted ChangeRequest merges; Chromium
    # logs each transient 404 during that window as a console "error" even
    # though the app already retries and recovers (see the passing unit
    # test "waits for merged resources to become visible"). That's expected
    # network-level noise from a documented retry loop, not an app bug.
    return [e for e in errors if "Failed to load resource: the server responded with a status of 404" not in e]


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)
    page.goto(f"{base_url}/?demo=1#/strategies")
    page.wait_for_load_state("networkidle")
    assert page.get_by_role("heading", name="策略", exact=True).is_visible()
    assert page.get_by_text("DEMO", exact=True).is_visible()
    assert page.locator("[data-select-id]").count() >= 4
    assert_no_horizontal_overflow(page)

    first_row = page.locator("[data-select-id]").first
    first_row.click()
    assert "/strategy-" in page.url
    assert page.locator(".detail-panel").is_visible()

    page.get_by_role("button", name="帮助与设置", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible")
    assert dialog.get_by_text("帮助与设置", exact=True).is_visible()
    dialog.get_by_role("button", name="资源", exact=True).click()
    page.get_by_role("heading", name="Busabase 资源").wait_for(state="visible")
    page.keyboard.press("Escape")
    page.locator("#helpModal").wait_for(state="detached")
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/strategies")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        page.get_by_role("button", name="打开侧栏").click()
        assert page.locator("body.sidebar-open").count() == 1
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 5, "y": 5})
        assert page.locator("body.sidebar-open").count() == 0

        page.locator("[data-select-id]").first.click()
        assert page.locator("body.mobile-detail-open").count() == 1
        assert page.locator(".detail-panel").is_visible()
        page.locator("[data-back-to-list]").click()
        assert page.locator("body.mobile-detail-open").count() == 0
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
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-invest-stock-busabase-") as data_dir:
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
            busabase_command,
            REPO_ROOT,
            {},
            f"{busabase_url}/api/health",
            timeout=90,
        ) as (_, busabase_logs):
            with tempfile.TemporaryDirectory(prefix="kelly-invest-stock-home-") as app_home:
                app_env = {
                    "BUSABASE_BASE_URL": busabase_url,
                    "HOME": app_home,
                    "PORT": str(app_port),
                }
                with managed_process(
                    ["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"
                ) as (_, app_logs):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/strategies")
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="初始化 Busabase 工作区").is_visible()
                    page.get_by_role("button", name="初始化工作区").click()
                    try:
                        page.get_by_role("heading", name="策略", exact=True).wait_for(timeout=10_000)
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
                    assert page.get_by_text("Busabase 当前数据", exact=True).is_visible()
                    assert page.locator("[data-select-id]").count() == 0
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="策略", exact=True).is_visible()
                    assert not unexpected_errors(errors), errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                strategy_base = find_resource(nodes, "strategies")
                assert strategy_base and strategy_base.get("baseId"), nodes
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{strategy_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "name": "测试策略",
                            "key": "integration-fixture",
                            "status": "验证中",
                        },
                        "message": "Seed Kelly Invest Stock integration fixture",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [record_cr["id"]]},
                )

                # A fresh app process must discover the existing resources without another setup action.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/strategies")
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="策略", exact=True).is_visible()
                    assert page.get_by_role("button", name="初始化工作区").count() == 0
                    assert page.locator("[data-select-id]", has_text="测试策略").is_visible()
                    assert_no_horizontal_overflow(page)
                    assert not unexpected_errors(errors), errors
                    context.close()

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "strategies", "candidates", "ledger-accounts", "ledger-positions"]
            ), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # The local PGlite data must survive a complete Busabase process restart.
        with managed_process(
            busabase_command,
            REPO_ROOT,
            {},
            f"{busabase_url}/api/health",
            timeout=90,
        ):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 5, nodes
            strategy_base = find_resource(nodes, "strategies")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={strategy_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("name") == "测试策略"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-invest-stock-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(
            ["node", "server.js"],
            APP_ROOT,
            {"HOME": app_home, "PORT": str(port)},
            f"{base_url}/health",
        ):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning and persistence against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
