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


APP_ROOT = REPO_ROOT / "skills" / "kelly-invest-stock" / "content" / "kelly-invest-stock-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-invest-stock"
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
    assert page.locator(".strategy-table-row").count() == 10
    assert page.get_by_role("columnheader", name="策略简述", exact=True).is_visible()
    assert page.get_by_role("columnheader", name="账本 NAV", exact=True).is_visible()
    assert page.get_by_role("columnheader", name="晋级阶段", exact=True).is_visible()
    assert page.get_by_role("columnheader", name="账本持仓", exact=True).is_visible()
    # Holding names render joined in one cell ("贵州茅台 · 招商银行 · 中国神华"),
    # not as an isolated exact-text node, so match as a substring.
    assert page.get_by_text("贵州茅台").first.is_visible()
    assert "¥" in page.locator(".strategy-table").inner_text()
    assert page.locator(".filters", has_text="虚拟账本").count() == 0
    assert page.get_by_role("button", name="打开回归", exact=True).is_visible()
    assert page.locator(".content").count() == 0
    assert_no_horizontal_overflow(page)

    page.locator("#appSidebar").evaluate("element => { element.dataset.routeIdentity = 'stable-sidebar'; }")
    page.locator(".workspace-head").evaluate("element => { element.dataset.routeIdentity = 'stable-header'; }")
    page.get_by_role("button", name="打开L1 基础观察", exact=True).click()
    page.get_by_role("heading", name="L1 基础观察", exact=True).wait_for()
    assert page.locator("#appSidebar").get_attribute("data-route-identity") == "stable-sidebar"
    assert page.locator(".workspace-head").get_attribute("data-route-identity") == "stable-header"
    page.get_by_role("button", name="打开策略", exact=True).click()
    page.get_by_role("heading", name="策略", exact=True).wait_for()

    first_row = page.locator('.strategy-table-row[data-select-id="strategy-munger"] .strategy-col')
    first_row.click()
    assert "/strategy-" in page.url and page.url.endswith("/portfolio")
    # The hash-route change re-renders asynchronously; is_visible() doesn't
    # auto-retry like click()/wait_for() do, so wait for the panel to attach
    # before asserting on it.
    page.locator(".strategy-detail-view").wait_for()
    assert page.locator(".strategy-detail-view").is_visible()
    assert page.get_by_role("tab", name="组合持仓 3", exact=True).get_attribute("aria-selected") == "true"
    assert page.get_by_role("heading", name="组合持仓", exact=True).is_visible()
    assert page.locator(".portfolio-table .portfolio-position-row").count() == 3
    assert page.get_by_role("columnheader", name="虚拟市值", exact=True).is_visible()
    assert page.get_by_text("现金", exact=True).is_visible()
    assert page.get_by_text("美的集团", exact=True).is_visible()
    assert page.get_by_text("000333", exact=False).is_visible()
    page.get_by_role("tab", name="策略逻辑", exact=True).click()
    assert page.url.endswith("/logic")
    heading = page.get_by_role("heading", name="策略阶段", exact=True)
    heading.wait_for(state="visible")
    assert heading.is_visible()
    page.get_by_role("tab", name="回测表现 1", exact=True).click()
    assert page.url.endswith("/backtest")
    heading = page.get_by_role("heading", name="历史回测", exact=True)
    heading.wait_for(state="visible")
    assert heading.is_visible()
    assert page.get_by_text("2024-08-05 → 2026-08-05", exact=True).is_visible()
    page.locator('.stage-control button[data-stage-value="L1"]').click()
    page.get_by_role("dialog", name="人工审批策略阶段").wait_for()
    page.get_by_label("人工理由").fill("研究证据已复核，本次降级用于验证人工审批记录。")
    page.get_by_role("checkbox").check()
    page.get_by_role("button", name="确认并提交", exact=True).click()
    stage_badge = page.locator(".detail-heading .stage-badge", has_text="L1")
    stage_badge.wait_for(state="visible")
    assert stage_badge.is_visible()
    page.get_by_role("tab", name="研究与审批 2", exact=True).click()
    demo_note = page.get_by_text("Demo 不持久化", exact=True)
    demo_note.wait_for(state="visible")
    assert demo_note.is_visible()
    assert page.get_by_text("研究证据已复核，本次降级用于验证人工审批记录。", exact=True).is_visible()

    page.get_by_role("button", name="打开回归", exact=True).click()
    heading = page.get_by_role("heading", name="回归", exact=True)
    heading.wait_for(state="visible")
    assert heading.is_visible()
    assert page.get_by_text("策略回测（回归测试）", exact=True).is_visible()
    assert page.get_by_role("columnheader", name="报告日期", exact=True).is_visible()
    assert page.get_by_role("columnheader", name="回测区间", exact=True).is_visible()
    assert page.locator(".backtest-table tbody tr").count() == 10
    assert page.get_by_text("后视偏差", exact=True).is_visible()
    assert page.get_by_text("剔除后总盘", exact=True).is_visible()

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

        page.locator('.strategy-table-row[data-select-id="strategy-munger"] .strategy-col').click()
        assert page.locator("body.mobile-detail-open").count() == 1
        detail_view = page.locator(".strategy-detail-view")
        detail_view.wait_for(state="visible")
        assert detail_view.is_visible()
        assert page.get_by_role("tab", name="组合持仓 3", exact=True).get_attribute("aria-selected") == "true"
        assert page.locator(".portfolio-table .portfolio-position-row").count() == 3
        page.get_by_role("tab", name="策略逻辑", exact=True).click()
        heading = page.get_by_role("heading", name="策略阶段", exact=True)
        heading.wait_for(state="visible")
        assert heading.is_visible()
        page.get_by_role("tab", name="组合持仓 3", exact=True).click()
        page.locator("[data-back-to-list]").click()
        assert page.locator("body.mobile-detail-open").count() == 0
        assert page.locator(".strategy-table").is_visible()
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


def create_and_merge_record(busabase_url: str, base_id: str, fields: dict, message: str) -> None:
    change_request = post_json(
        f"{busabase_url}/api/v1/bases/{base_id}/change-requests",
        {
            "fields": fields,
            "message": message,
            "submittedBy": "kelly-skills-test",
        },
    )
    post_json(
        f"{busabase_url}/api/v1/change-requests/merge",
        {"changeRequestIds": [change_request["id"]]},
    )


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
                    assert page.get_by_role("heading", name="Initialize the Busabase workspace").is_visible()
                    page.locator("[data-provision]").click()
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
                    # createAirAppConnectGate()'s onProvision handler calls onRetry()
                    # without awaiting it, so the app's own async data load can still
                    # be in flight. Give it a real chance to finish before reloading,
                    # and discard whatever it logged either way, so a collision this
                    # test doesn't care about isn't mistaken for a page regression.
                    page.wait_for_timeout(500)
                    errors.clear()
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="策略", exact=True).is_visible()
                    assert not unexpected_errors(errors), errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                strategy_base = find_resource(nodes, "strategies")
                account_base = find_resource(nodes, "ledger-accounts")
                review_base = find_resource(nodes, "strategy-reviews")
                assert strategy_base and strategy_base.get("baseId"), nodes
                assert account_base and account_base.get("baseId"), nodes
                assert review_base and review_base.get("baseId"), nodes
                create_and_merge_record(
                    busabase_url,
                    strategy_base["baseId"],
                    {
                        "name": "测试策略",
                        "key": "integration-fixture",
                        "family": "质量价值",
                        "status": "L1",
                        "thesis": "持有资本回报率稳定的优质企业。",
                        "selection-rule": "现金流和资本回报率持续领先。",
                        "invalidation-rule": "资本回报率连续两个季度下滑。",
                        "rebalance": "季度复核",
                        "benchmark": "沪深300",
                        "confidence": 70,
                        "next-review-at": "2026-09-01",
                    },
                    "Seed complete strategy fixture",
                )
                create_and_merge_record(
                    busabase_url,
                    account_base["baseId"],
                    {
                        "name": "测试策略虚拟账本",
                        "strategy-key": "integration-fixture",
                        "nominal-capital": 100000,
                        "nav": 100000,
                        "cash": 100000,
                        "benchmark-return": 0,
                        "max-drawdown": 0,
                        "updated-at": "2026-08-05 15:00 CST",
                        "baseline-date": "2026-08-01",
                    },
                    "Seed complete ledger fixture",
                )
                create_and_merge_record(
                    busabase_url,
                    review_base["baseId"],
                    {
                        "name": "测试策略研究复查",
                        "strategy-key": "integration-fixture",
                        "review-date": "2026-08-05 15:00 CST",
                        "review-type": "research",
                        "source-note": "公司公告与定期报告。",
                        "source-as-of": "2026-06-30",
                        "supporting-evidence": "现金流与资本回报率符合入选规则。",
                        "counter-evidence": "估值仍高于历史中枢。",
                        "data-freshness": "已核对",
                    },
                    "Seed research evidence fixture",
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
                    assert page.locator("[data-provision]").count() == 0
                    assert page.locator("[data-select-id]", has_text="测试策略").is_visible()
                    page.locator("[data-select-id]", has_text="测试策略").click()
                    page.locator('.stage-control button[data-stage-value="L2"]').click()
                    page.get_by_role("dialog", name="人工审批策略阶段").wait_for()
                    assert page.get_by_text("已满足", exact=True).count() == 4
                    page.get_by_label("人工理由").fill("研究证据与虚拟账本已复核，同意进入进阶观察阶段。")
                    page.get_by_role("checkbox").check()
                    page.get_by_role("button", name="确认并提交", exact=True).click()
                    page.locator(".detail-heading .stage-badge", has_text="L2").wait_for()
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    page.locator(".detail-heading .stage-badge", has_text="L2").wait_for()
                    page.get_by_role("tab", name="研究与审批 2", exact=True).click()
                    evidence_note = page.get_by_text("研究证据与虚拟账本已复核，同意进入进阶观察阶段。", exact=True)
                    evidence_note.wait_for(state="visible")
                    assert evidence_note.is_visible()
                    assert_no_horizontal_overflow(page)
                    assert not unexpected_errors(errors), errors
                    context.close()

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "strategies", "ledger-accounts", "ledger-positions", "strategy-backtests"]
                + ["strategy-reviews"]
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
            assert len(resource_keys(nodes)) == 6, nodes
            strategy_base = find_resource(nodes, "strategies")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={strategy_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("name") == "测试策略"
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
