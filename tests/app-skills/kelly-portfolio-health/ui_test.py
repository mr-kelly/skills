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

APP_ROOT = REPO_ROOT / "skills" / "kelly-portfolio-health" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-portfolio-health"
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


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)
    page.goto(f"{base_url}/?demo=1#/overview")
    page.wait_for_load_state("networkidle")
    # The demo book is the mulberry32(20260601) generator ported verbatim
    # from the retired app/server/dataset.ts: 52 contracts, 8 categories, 10
    # cities, 5 contracts with a non-"ok" repayment-lag severity, 11 on the
    # revenue-decline watchlist — confirmed with a throwaway node probe of
    # demo-provider.js before writing these assertions.
    assert page.locator(".metric").count() == 4
    assert page.locator(".alloc-legend-row").count() == 8
    assert page.locator(".insight-row").count() == 5
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/contracts")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 52
    assert "52 contracts" in page.locator("#page-subtitle").inner_text()

    page.goto(f"{base_url}/?demo=1#/concentration")
    page.wait_for_load_state("networkidle")
    assert page.locator(".overview-panel.wide").count() == 2
    assert page.locator(".table-wrap tbody tr").count() == 16  # 8 categories + 8 cities

    page.goto(f"{base_url}/?demo=1#/watchlist")
    page.wait_for_load_state("networkidle")
    assert page.locator(".watchlist-card").count() == 11
    assert "11 contracts" in page.locator("#page-subtitle").inner_text()
    assert page.locator("[data-action='toggle-flag']").count() == 11

    page.goto(f"{base_url}/?demo=1#/settings")
    page.wait_for_load_state("networkidle")
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

    with tempfile.TemporaryDirectory(prefix="kelly-portfolio-health-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-portfolio-health-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/contracts")
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="Initialize the Busabase workspace").is_visible()
                    page.locator("[data-provision]").click()
                    try:
                        # Zero contracts exist yet, so Contracts renders its
                        # empty state (no `.table-wrap` until records exist)
                        # — the absence of the setup gate is what signals
                        # lazy provisioning succeeded.
                        page.wait_for_selector("[data-provision]", state="detached", timeout=15_000)
                        page.locator("#page-subtitle").get_by_text("0 contracts").wait_for(timeout=15_000)
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
                    assert page.locator(".table-wrap").count() == 0
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                contracts_base = find_resource(nodes, "contracts")
                settings_base = find_resource(nodes, "settings")
                assert contracts_base and settings_base, nodes

                monthly_revenue = [10000, 10000, 10000, 10000, 10000, 7000]
                contract_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{contracts_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "contract-id": "rbf-fixture",
                            "business-name": "Fixture Partner 001",
                            "category": "Retail",
                            "city": "Riverton",
                            "origination-date": "2025-03-01",
                            "months-since-origination": 12,
                            "expected-term-months": 24,
                            "funding-amount": 100000,
                            "cap-multiple": 1.2,
                            "cap-amount": 120000,
                            "cumulative-repayment": 30000,
                            "monthly-revenue": json.dumps(monthly_revenue),
                            "status": "active",
                            "currency": "USD",
                            "flagged": "false",
                            "note": "",
                            "decision-updated-at": "",
                        },
                        "message": "Seed fixture contract",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [contract_cr["id"]]})

                # A fresh app process must discover the existing resources and
                # records, and a direct flag write (no separate approval
                # step) must write straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/contracts/rbf-fixture")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    # #page-title lives in the desktop .topbar, which is
                    # hidden (not removed) at this mobile viewport width, so
                    # check text_content() rather than a visibility-gated
                    # role query.
                    assert page.locator("#page-title").text_content() == "Fixture Partner 001"
                    page.locator("[data-action='toggle-flag'][data-id='rbf-fixture']").click()
                    page.wait_for_timeout(500)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={contracts_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("contract-id") == "rbf-fixture"
                )
                assert fixture["headCommit"]["fields"]["flagged"] == "true", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "contracts", "settings"]), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 3, nodes
            contracts_base = find_resource(nodes, "contracts")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={contracts_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("flagged") == "true" for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-portfolio-health-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning, direct flag-decision write, and persistence against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
