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

APP_ROOT = REPO_ROOT / "skills" / "kelly-behavior-predict" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-behavior-predict"
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

    # The fixed 100-session mock sample (5 segments, scaled 0.4x from the
    # retired lib/segments.ts's 60/55/45/50/40 so the Busabase `sessions`
    # Base's records.list limit=100 cap is never exceeded) is regenerated
    # in-browser by the demo provider via the same generateAllSessions() the
    # trusted seed script uses. Counts verified against
    # app/app/js/behavior-model.js with a throwaway Playwright probe before
    # writing these assertions: 100 total sessions, 5 segments, overall
    # backtest accuracy 83%, price_sensitive_browser has 24 sessions.
    page.goto(f"{base_url}/?demo=1&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-subtitle").inner_text() == "100 sessions · 5 segments"
    assert page.locator("#accuracy-figure").inner_text() == "83"
    assert page.locator("#summary-accuracy").inner_text() == "83.0%"
    assert page.locator("#count-needs-decision").inner_text() == "5"
    assert page.locator("#count-segments").inner_text() == "5"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=segments&lang=en#/segments")
    page.wait_for_load_state("networkidle")
    assert page.locator(".segment-card").count() == 5
    assert "5" in page.locator("#page-subtitle").inner_text()

    page.goto(f"{base_url}/?demo=detail&lang=en#/segments/price_sensitive_browser")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Price-sensitive browser"
    assert page.locator("#page-subtitle").inner_text() == "24 sessions"
    assert page.locator(".table-wrap tbody tr").count() == 12
    assert page.locator(".trigger-row").count() == 5
    assert page.locator("#markTrusted").count() == 1
    assert page.locator("#markRecalibrate").count() == 1

    page.goto(f"{base_url}/?demo=backtest&lang=en#/backtest")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-subtitle").inner_text() == "100 sessions"
    assert page.locator(".panel.wide").count() == 6  # overall + 5 segments

    page.goto(f"{base_url}/?demo=1&lang=zh#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#accuracy-figure").inner_text() == "83"

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
    with urllib.request.urlopen(url, timeout=10) as response:
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


FIXTURE_SESSION_1 = {
    "session-id": "price_sensitive_browser-fixture-1",
    "segment-id": "price_sensitive_browser",
    "session-length": 6.4,
    "cart-abandon-count": 0,
    "price-check-count": 2,
    "days-since-last-visit": 1,
    "coupon-clicks": 1,
    "reached-stage": "browse",
    "actual-action": "recommend_similar_items",
}
FIXTURE_SESSION_2 = {
    "session-id": "price_sensitive_browser-fixture-2",
    "segment-id": "price_sensitive_browser",
    "session-length": 9.1,
    "cart-abandon-count": 4,
    "price-check-count": 8,
    "days-since-last-visit": 2,
    "coupon-clicks": 3,
    "reached-stage": "compare",
    "actual-action": "send_discount_offer",
}
FIXTURE_SEGMENT = {
    "segment-id": "price_sensitive_browser",
    "decision-status": "",
    "decision-note": "",
    "decided-at": "",
}


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-behavior-predict-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-behavior-predict-home-") as app_home:
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
                sessions_base = find_resource(nodes, "sessions")
                segments_base = find_resource(nodes, "segments")
                settings_base = find_resource(nodes, "settings")
                assert sessions_base and sessions_base.get("baseId"), nodes
                assert segments_base and segments_base.get("baseId"), nodes
                assert settings_base and settings_base.get("baseId"), nodes

                session1_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{sessions_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_SESSION_1,
                        "message": "Seed Kelly Behavior Predict integration fixture session 1",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                session2_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{sessions_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_SESSION_2,
                        "message": "Seed Kelly Behavior Predict integration fixture session 2",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                segment_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{segments_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_SEGMENT,
                        "message": "Seed Kelly Behavior Predict integration fixture segment",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [session1_cr["id"], session2_cr["id"], segment_cr["id"]]},
                )

                # A fresh app process must discover the existing resources and records,
                # and a human trust verdict must write straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/segments/price_sensitive_browser")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert "Price-sensitive browser" in page.locator("#page-title").inner_text()
                    assert page.locator("#page-subtitle").inner_text() == "2 sessions"
                    page.locator("#decisionNote").fill("Trusted: matches manual spot-check of the two fixture sessions.")
                    page.locator("#markTrusted").click()
                    page.wait_for_timeout(500)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={segments_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("segment-id") == "price_sensitive_browser"
                )
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["decision-status"] == "trusted", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "sessions", "segments", "settings"]), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 4, nodes
            segments_base = find_resource(nodes, "segments")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={segments_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("decision-status") == "trusted"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-behavior-predict-home-") as app_home:
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
