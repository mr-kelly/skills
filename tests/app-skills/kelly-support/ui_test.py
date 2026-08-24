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

APP_ROOT = REPO_ROOT / "skills" / "kelly-support" / "content" / "kelly-support-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-support"
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
    page.goto(f"{base_url}/?demo=overview#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator(".metrics").first.is_visible()
    assert_no_horizontal_overflow(page)

    # The demo dataset has 14 tickets, 8 needs_review, 3 SLA-breached, 1
    # blocked by the support-qa gate (the featured Ochoa refund).
    page.goto(f"{base_url}/?demo=tickets#/tickets")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap table tbody tr").count() == 14

    # 7 knowledge-base articles/macros.
    page.goto(f"{base_url}/?demo=knowledge#/knowledge")
    page.wait_for_load_state("networkidle")
    assert page.locator(".kb-grid .kb-card").count() == 7

    # SLA board: 10 open tickets carry a due-by (14 total minus 3 done minus
    # 1 blocked); 3 resolved tickets carry a CSAT score.
    page.goto(f"{base_url}/?demo=sla#/sla")
    page.wait_for_load_state("networkidle")
    assert page.locator(".sla-list .sla-row").count() == 10
    assert page.locator(".csat-list .csat-row").count() == 3

    # The featured refund ticket's drafted reply trips the support-qa gate to
    # BLOCK (promises a refund without approval).
    page.goto(f"{base_url}/?demo=detail&lang=en#/tickets/tk-ochoa-refund")
    page.wait_for_load_state("networkidle")
    assert page.locator(".gate-panel.block").is_visible()
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=tickets#/tickets")
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

    with tempfile.TemporaryDirectory(prefix="kelly-support-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-support-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/tickets")
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
                tickets_base = find_resource(nodes, "tickets")
                assert tickets_base and tickets_base.get("baseId"), nodes
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{tickets_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "ticket-id": "tk-fixture",
                            "channel": "email",
                            "customer-name": "Fixture Customer",
                            "subject": "Integration Fixture Ticket",
                            "body": "How do I export my notes?",
                            "category": "how_to",
                            "priority": "normal",
                            "status": "needs_review",
                            "proposed-action": "send_reply",
                            "suggested-reply": "Head to Settings, Data, Export to download a ZIP archive today.",
                            "created-at": "2026-07-06T08:00:00.000Z",
                        },
                        "message": "Seed Kelly Support integration fixture",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [record_cr["id"]]})

                # A fresh app process must discover the existing resources and
                # records, and a human verdict on the seeded ticket must write
                # straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/tickets")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    row = page.locator(".table-wrap table tbody tr", has_text="Integration Fixture Ticket")
                    assert row.is_visible()
                    row.locator("a").first.click()
                    page.wait_for_load_state("networkidle")
                    page.locator("[data-action='decide'][data-decision='approve']").click()
                    page.wait_for_timeout(500)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={tickets_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("ticket-id") == "tk-fixture"
                )
                assert (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])["status"] == "approved", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "accounts", "tickets", "messages", "knowledge-base", "sync-log", "settings"]
            ), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 7, nodes
            tickets_base = find_resource(nodes, "tickets")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={tickets_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("status") == "approved"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-support-home-") as app_home:
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
