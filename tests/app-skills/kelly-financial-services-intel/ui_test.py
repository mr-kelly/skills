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

APP_ROOT = REPO_ROOT / "skills" / "kelly-financial-services-intel" / "content" / "kelly-financial-services-intel-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-financial-services-intel"
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

    # The demo dataset (3 signals, 3 actions, 3 drafts, 3 sources, every
    # item status "needs_review") is ported verbatim from the retired
    # app/server/demo.ts's makeDemoBatch() — counts verified with a
    # throwaway `node -e` probe against demoProvider.getState() before
    # writing these assertions: 3+3+3 = 9 total needs_review, 0 approved,
    # 0 blocked.
    page.goto(f"{base_url}/?demo=overview&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-needs-review").inner_text() == "9"
    assert page.locator("#count-approved").inner_text() == "0"
    assert page.locator("#count-blocked").inner_text() == "0"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=signals&lang=en#/signals")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 3

    page.goto(f"{base_url}/?demo=actions&lang=en#/actions")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 3

    page.goto(f"{base_url}/?demo=drafts&lang=en#/drafts")
    page.wait_for_load_state("networkidle")
    assert page.locator(".item-list .item-row").count() == 3

    page.goto(f"{base_url}/?demo=overview&lang=en#/sources")
    page.wait_for_load_state("networkidle")
    assert page.locator(".source-row").count() == 3

    page.goto(f"{base_url}/?demo=detail&lang=en#/signals/signal-1")
    page.wait_for_load_state("networkidle")
    assert "A market event needs a clear client explanation" in page.locator("#page-title").inner_text()
    assert page.locator("[data-decision-actions] button[data-action='approve']").is_visible()

    page.goto(f"{base_url}/?demo=overview&lang=en#/settings")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Help & Settings"

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=overview&lang=en#/overview")
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

    with tempfile.TemporaryDirectory(prefix="kelly-financial-services-intel-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-financial-services-intel-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/signals")
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
                signals_base = find_resource(nodes, "signals")
                assert signals_base and signals_base.get("baseId"), nodes
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{signals_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "signal-id": "fixture-signal",
                            "ref": 1,
                            "title": "Fixture market event",
                            "summary": "Integration fixture signal summary.",
                            "why-it-matters": "Integration fixture signal.",
                            "buyer-intent": "High: creates a concrete sales trigger.",
                            "confidence": 0.8,
                            "detected-at": "2026-01-01T00:00:00.000Z",
                            "status": "needs_review",
                            "risk": json.dumps([]),
                            "source-name": "Fixture source",
                            "source-url": "https://example.com/fixture",
                            "suggested-action-id": "",
                            "decision-verdict": "",
                            "decision-comment": "",
                            "decided-at": "",
                        },
                        "message": "Seed Kelly Financial Services Intel integration fixture signal",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [record_cr["id"]]})

                # A fresh app process must discover the existing resources and records,
                # and a human decision verdict must write straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/signals/fixture-signal")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    page.locator("[data-decision-actions] button[data-action='approve']").click()
                    page.wait_for_selector("[data-decision-feedback].positive", timeout=15_000)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={signals_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("signal-id") == "fixture-signal"
                )
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["status"] == "approved", fixture
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["decision-verdict"] == "approve", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                [
                    "app-root",
                    "signals",
                    "actions",
                    "drafts",
                    "sources",
                    "settings",
                ]
            ), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 6, nodes
            signals_base = find_resource(nodes, "signals")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={signals_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("status") == "approved"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-financial-services-intel-home-") as app_home:
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
