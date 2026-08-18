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

APP_ROOT = REPO_ROOT / "skills" / "kelly-deal-scorer" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-deal-scorer"
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

    # The fixed 8-candidate mock queue (CANDIDATE_SEEDS in
    # app/app/js/scorer-model.js) counts verified against a throwaway Node
    # probe before writing these assertions: metrics.needs_review=6,
    # approved=1, blocked=1; distribution.high_confidence=6, needs_review=2,
    # low_confidence=0. cand-001 (Maple & Thyme Kitchen) composite=80.3,
    # cand-004 (Ember & Oak BBQ) composite=53.5.
    page.goto(f"{base_url}/?demo=1&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#review-count").inner_text() == "6"
    assert page.locator("#count-high").inner_text() == "6"
    assert page.locator("#count-blocked").inner_text() == "1"
    assert page.locator(".candidate-row").count() == 8
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1&lang=en#/candidates")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-subtitle").inner_text() == "8 candidates"
    assert page.locator(".candidate-row").count() == 8

    page.goto(f"{base_url}/?demo=1&lang=en#/candidates?status=blocked")
    page.wait_for_load_state("networkidle")
    assert page.locator(".candidate-row").count() == 1

    page.goto(f"{base_url}/?demo=1&lang=en#/candidates/cand-001")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Maple & Thyme Kitchen"
    assert page.locator(".revenue-bar").count() == 12
    assert page.locator(".factor-row").count() == 6  # 1 header row + 5 rubric factors
    assert "80.3" in page.locator(".metric strong").first.inner_text()
    assert "Approved" in page.locator(".decision-recorded").inner_text()

    page.goto(f"{base_url}/?demo=1&lang=en#/candidates/cand-004")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Ember & Oak BBQ"
    assert page.locator(".flag-badge").count() == 2
    assert "Rejected" in page.locator(".decision-recorded").inner_text()

    page.goto(f"{base_url}/?demo=1&lang=en#/settings")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Help & Settings"

    page.goto(f"{base_url}/?demo=1&lang=zh#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-high").inner_text() == "6"

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1&lang=en#/overview")
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


FIXTURE_CANDIDATE_1 = {
    "candidate-id": "fixture-001",
    "business-name": "Fixture Bakery",
    "category": "F&B",
    "city": "Test City",
    "requested-principal": 50000,
    "monthly-revenue": json.dumps([30000, 31000, 32000, 33000, 34000, 35000]),
    "red-flags": "[]",
    "status": "needs_review",
    "decision-action": "",
    "decision-comment": "",
    "decided-at": "",
}
FIXTURE_CANDIDATE_2 = {
    "candidate-id": "fixture-002",
    "business-name": "Fixture Gym",
    "category": "Fitness",
    "city": "Test City 2",
    "requested-principal": 20000,
    "monthly-revenue": json.dumps([10000, 10500, 11000, 10800, 11200, 11500]),
    "red-flags": json.dumps(["high_seasonal_swing"]),
    "status": "needs_review",
    "decision-action": "",
    "decision-comment": "",
    "decided-at": "",
}


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-deal-scorer-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-deal-scorer-home-") as app_home:
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
                candidates_base = find_resource(nodes, "candidates")
                settings_base = find_resource(nodes, "settings")
                assert candidates_base and candidates_base.get("baseId"), nodes
                assert settings_base and settings_base.get("baseId"), nodes

                cand1_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{candidates_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_CANDIDATE_1,
                        "message": "Seed Kelly Deal Scorer integration fixture candidate 1",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                cand2_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{candidates_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_CANDIDATE_2,
                        "message": "Seed Kelly Deal Scorer integration fixture candidate 2",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [cand1_cr["id"], cand2_cr["id"]]},
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
                    page.goto(f"{app_url}/#/candidates/fixture-001")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert "Fixture Bakery" in page.locator("#page-title").inner_text()
                    page.locator("[data-decision-note]").fill("Trusted: matches manual spot-check of the fixture.")
                    page.locator("[data-decision-action='approve_term_sheet']").click()
                    page.wait_for_timeout(500)
                    assert "Approved" in page.locator(".decision-recorded").inner_text()
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={candidates_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("candidate-id") == "fixture-001"
                )
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["status"] == "approved", fixture
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["decision-action"] == "approve_term_sheet", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "candidates", "settings"]), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 3, nodes
            candidates_base = find_resource(nodes, "candidates")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={candidates_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("status") == "approved"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-deal-scorer-home-") as app_home:
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
