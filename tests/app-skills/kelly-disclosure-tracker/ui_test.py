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

APP_ROOT = REPO_ROOT / "skills" / "kelly-disclosure-tracker" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-disclosure-tracker"
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

    # The fixed 9-vehicle / 54-item mock portfolio (buildSeedData() in
    # app/app/js/tracker-model.js) counts verified against a throwaway Node
    # probe before writing these assertions: items_needs_review=27,
    # items_changes_requested=4, items_done=21, items_blocked=2;
    # vehicles_ready=0, vehicles_blocked=2, vehicles_in_progress=7. The two
    # flagged (blocked) items are veh-05-listing_filing and
    # veh-07-listing_filing, both reconciliation mismatches.
    page.goto(f"{base_url}/?demo=1&lang=en#/vehicles")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-needs-review").inner_text() == "27"
    assert page.locator("#count-blocked").inner_text() == "2"
    assert page.locator("#count-ready").inner_text() == "0"
    assert page.locator(".vehicle-card").count() == 9
    assert page.locator("#page-subtitle").inner_text() == "9 vehicles"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1&lang=en#/flagged")
    page.wait_for_load_state("networkidle")
    assert page.locator(".flagged-card").count() == 2

    page.goto(f"{base_url}/?demo=1&lang=en#/vehicles/veh-05")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "SPV Epsilon 09"
    assert page.locator(".checklist-row").count() == 6
    assert page.locator(".reconciliation-banner").count() == 1

    page.goto(f"{base_url}/?demo=1&lang=en#/vehicles/veh-05/veh-05-listing_filing")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-detail-side h2").inner_text() == "Listing venue filing"
    assert page.locator(".decision-actions button").count() == 3

    page.goto(f"{base_url}/?demo=1&lang=en#/settings")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Help & Settings"

    page.goto(f"{base_url}/?demo=1&lang=zh#/vehicles")
    page.wait_for_load_state("networkidle")
    assert page.locator(".vehicle-card strong").first.inner_text() == "SPV 阿尔法 12"

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1&lang=en#/vehicles")
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
    request = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
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


FIXTURE_VEHICLE = {
    "vehicle-id": "fixture-veh-01",
    "name": "Fixture Vehicle One",
    "vehicle-type": "spv",
    "origination-entity": "Fixture Origination Entity",
    "fund-manager-entity": "Fixture Fund Manager",
    "listing-venue": "Fixture Exchange",
    "base-currency": "USD",
    "target-close-date": "2026-12-31",
}
FIXTURE_ITEM_1 = {
    "item-id": "fixture-item-001",
    "vehicle-id": "fixture-veh-01",
    "role": "origination",
    "item-key": "asset_pool_schedule",
    "title": "Asset pool schedule",
    "summary": "Fixture summary",
    "body": "Fixture body",
    "category": "origination",
    "proposed-action": "collect_document",
    "reason": "Fixture reason",
    "reconciliation": "",
    "decision-action": "",
    "decision-comment": "",
    "decided-at": "",
    "override-reconciliation": "",
    "execution-status": "",
    "execution-detail": "",
    "executed-at": "",
}
FIXTURE_ITEM_2 = {
    "item-id": "fixture-item-002",
    "vehicle-id": "fixture-veh-01",
    "role": "fund_manager",
    "item-key": "aum_statement",
    "title": "AUM statement",
    "summary": "Fixture summary 2",
    "body": "Fixture body 2",
    "category": "fund_manager",
    "proposed-action": "reconcile_figures",
    "reason": "Fixture reason 2",
    "reconciliation": "",
    "decision-action": "",
    "decision-comment": "",
    "decided-at": "",
    "override-reconciliation": "",
    "execution-status": "",
    "execution-detail": "",
    "executed-at": "",
}


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-disclosure-tracker-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-disclosure-tracker-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/vehicles")
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
                    # The provision button being detached only means the gate closed;
                    # createAirAppConnectGate()'s onProvision handler calls onRetry() without
                    # awaiting it, so the app's own background data load (already in flight)
                    # can still be running. Give it a real chance to finish before abandoning
                    # the page (reduces how often reload collides with it), then discard
                    # whatever this pre-reload page logged regardless -- a collision aborts
                    # the fetch as a real but harmless net::ERR_ABORTED (the reload's own
                    # fresh load re-fetches everything from scratch), and only the reloaded
                    # page's own errors are what this assertion cares about.
                    page.wait_for_timeout(500)
                    errors.clear()
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                vehicles_base = find_resource(nodes, "vehicles")
                items_base = find_resource(nodes, "items")
                settings_base = find_resource(nodes, "settings")
                assert vehicles_base and vehicles_base.get("baseId"), nodes
                assert items_base and items_base.get("baseId"), nodes
                assert settings_base and settings_base.get("baseId"), nodes

                vehicle_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{vehicles_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_VEHICLE,
                        "message": "Seed Kelly Disclosure Tracker integration fixture vehicle",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                item1_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{items_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_ITEM_1,
                        "message": "Seed Kelly Disclosure Tracker integration fixture item 1",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                item2_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{items_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_ITEM_2,
                        "message": "Seed Kelly Disclosure Tracker integration fixture item 2",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [vehicle_cr["id"], item1_cr["id"], item2_cr["id"]]},
                )

                # A fresh app process must discover the existing resources and records,
                # and a human decision must write straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/vehicles/fixture-veh-01/fixture-item-001")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert "Fixture Vehicle One" in page.locator("#page-title").inner_text()
                    assert page.locator(".item-detail-side h2").inner_text() == "Asset pool schedule"
                    page.locator("#reviewNote").fill("Trusted: matches manual spot-check of the fixture.")
                    page.locator("[data-action='verified']").click()
                    page.locator("#saveDecisionButton").click()
                    page.wait_for_timeout(500)
                    assert page.locator(".checklist-note").count() >= 1
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={items_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("item-id") == "fixture-item-001"
                )
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["decision-action"] == "verified", fixture
                assert (
                    (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["decision-comment"]
                    == "Trusted: matches manual spot-check of the fixture."
                ), fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "vehicles", "items", "settings"]), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 4, nodes
            items_base = find_resource(nodes, "items")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={items_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("decision-action") == "verified"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-disclosure-tracker-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning, decision write, and persistence against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
