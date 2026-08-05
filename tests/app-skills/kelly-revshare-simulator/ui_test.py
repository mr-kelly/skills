from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

APP_ROOT = REPO_ROOT / "skills" / "kelly-revshare-simulator" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-revshare-simulator"
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


def fill_scenario_form(page: Page, *, name: str, business_type: str, avg_monthly_revenue: str, principal: str) -> None:
    page.fill('input[name="name"]', name)
    page.fill('input[name="business_type"]', business_type)
    page.fill('input[name="avg_monthly_revenue"]', avg_monthly_revenue)
    page.fill('input[name="revenue_volatility_pct"]', "10")
    page.fill('input[name="principal"]', principal)
    page.fill('input[name="initial_share_rate_pct"]', "7")
    page.fill('input[name="step_down_share_rate_pct"]', "3")
    page.fill('input[name="repayment_cap_multiple"]', "1.4")
    page.fill('input[name="term_months"]', "18")


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)
    page.goto(f"{base_url}/?demo=1")
    page.wait_for_load_state("networkidle")
    # The demo batch is the four scenarios ported verbatim from the retired
    # app/server/demo.ts (also scripts/generate_batch.ts's seed set):
    # bubble tea / gym / hotpot / discount-mart.
    page.locator("#page-subtitle").get_by_text("4 scenarios").wait_for(timeout=5_000)

    page.goto(f"{base_url}/?demo=scenarios")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 4
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=detail")
    page.wait_for_load_state("networkidle")
    assert page.locator("svg.projection-chart").count() == 1
    assert page.locator("#deleteScenarioBtn").is_visible()

    page.goto(f"{base_url}/?demo=comparison")
    page.wait_for_load_state("networkidle")
    page.locator("[data-compare-id]").first.check()
    page.wait_for_timeout(150)
    assert page.locator(".table-wrap").count() == 1

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


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-revshare-simulator-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-revshare-simulator-home-") as app_home:
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
                        # Zero scenarios exist yet -- the absence of the setup
                        # gate plus the "0 scenarios" subtitle is what signals
                        # lazy provisioning succeeded (there is no
                        # `.table-wrap`/list markup to wait on in the empty
                        # overview state).
                        page.wait_for_selector("[data-provision]", state="detached", timeout=20_000)
                        page.locator("#page-subtitle").get_by_text("0 scenarios").wait_for(timeout=15_000)
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

                    # Direct create: the analyst saves a new scenario straight
                    # through the browser form -- no separate approval step.
                    page.goto(f"{app_url}/#/scenarios/new")
                    page.wait_for_load_state("networkidle")
                    fill_scenario_form(
                        page,
                        name="Fixture Bakery Chain",
                        business_type="Bakery retail chain",
                        avg_monthly_revenue="300000",
                        principal="150000",
                    )
                    page.click("#scenarioForm button[type=submit]")
                    page.wait_for_url(re.compile(r"#/scenarios/scn_"), timeout=15_000)
                    page.wait_for_load_state("networkidle")
                    assert page.locator("#page-title").inner_text() == "Fixture Bakery Chain"
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                scenarios_base = find_resource(nodes, "scenarios")
                settings_base = find_resource(nodes, "settings")
                assert scenarios_base and settings_base, nodes

                records = read_json(f"{busabase_url}/api/v1/records?baseId={scenarios_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("name") == "Fixture Bakery Chain"
                )
                fields = fixture["headCommit"]["fields"]
                assert fields["business-type"] == "Bakery retail chain", fields
                assert float(fields["principal"]) == 150000, fields
                assert fields.get("decision-action", "") == "", fields

                # A fresh app process must discover the existing resources and
                # record, then a direct underwriting-decision write and a
                # direct delete must both land straight on Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/scenarios")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    row = page.locator(".table-wrap tbody tr", has_text="Fixture Bakery Chain")
                    assert row.is_visible()
                    row.get_by_role("link").click()
                    page.wait_for_load_state("networkidle")

                    # Direct decision write, straight onto the scenario's own
                    # record -- no separate decisions/handoff-log bucket.
                    page.locator('#decisionForm input[value="approve_underwriting"]').check()
                    page.fill('#decisionForm textarea[name="note"]', "Looks good, approving.")
                    page.click("#decisionForm button[type=submit]")
                    page.wait_for_timeout(500)
                    assert page.locator('#decisionForm input[value="approve_underwriting"]').is_checked()
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={scenarios_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("name") == "Fixture Bakery Chain"
                )
                fields = fixture["headCommit"]["fields"]
                assert fields["decision-action"] == "approve_underwriting", fields
                assert fields["decision-note"] == "Looks good, approving.", fields

                # Direct delete.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/scenarios")
                    page.wait_for_load_state("networkidle")
                    page.locator(".table-wrap tbody tr", has_text="Fixture Bakery Chain").get_by_role("link").click()
                    page.wait_for_load_state("networkidle")
                    page.once("dialog", lambda dialog: dialog.accept())
                    page.click("#deleteScenarioBtn")
                    page.wait_for_url(re.compile(r"#/scenarios$"), timeout=15_000)
                    page.wait_for_load_state("networkidle")
                    # The delete itself (a submit + review + merge burst of
                    # Busabase writes) can outrun the immediate re-fetch that
                    # follows it under a CPU-shared sandbox, transiently
                    # showing a stale row with a "Failed to fetch" banner even
                    # though the server-side delete already landed -- so poll
                    # with an explicit refresh before treating this as a
                    # failure, the same tolerance other skills' OSS tests give
                    # provisioning under load.
                    row = page.locator(".table-wrap tbody tr", has_text="Fixture Bakery Chain")
                    if row.count():
                        page.click("#refresh")
                        page.wait_for_load_state("networkidle")
                        page.wait_for_timeout(500)
                    assert row.count() == 0, page.locator("#content").inner_text()
                    assert_no_horizontal_overflow(page)
                    context.close()

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "scenarios", "settings"]), nodes
            records = read_json(f"{busabase_url}/api/v1/records?baseId={scenarios_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert not any(
                r.get("headCommit", {}).get("fields", {}).get("name") == "Fixture Bakery Chain" for r in record_items
            ), record_items

        # Structure must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 3, nodes


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-revshare-simulator-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(
            ["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"
        ):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print(
                        "PASS OSS - lazy provisioning, direct scenario create/decide/delete writes, "
                        "and persistence against temporary Busabase"
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
