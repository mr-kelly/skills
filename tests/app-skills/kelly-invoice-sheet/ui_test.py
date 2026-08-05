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

APP_ROOT = REPO_ROOT / "skills" / "kelly-invoice-sheet" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-invoice-sheet"
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

    # The fixed demo dataset (demoInvoices() in app/app/js/invoice-model.js,
    # ported verbatim from the retired scripts/generate_demo_batch.ts) counts
    # verified against a throwaway Playwright probe before writing these
    # assertions: 3 invoices total, needs_review=2 (inv-001, inv-002),
    # blocked=1 (inv-003), approved=0, done=0, changes_requested=0.
    page.goto(f"{base_url}/?demo=1#/invoices/all")
    page.wait_for_load_state("networkidle")
    assert page.locator(".brand-title").inner_text() == "Kelly Invoice Sheet"
    assert page.locator(".brand-subtitle").inner_text() == "Extract Data"
    assert page.locator(".filters .filter[data-view='all'] b").inner_text() == "3"
    assert page.locator(".filters .filter[data-view='needs_review'] b").inner_text() == "2"
    assert page.locator(".filters .filter[data-view='approved'] b").inner_text() == "0"
    assert page.locator(".filters .filter[data-view='blocked'] b").inner_text() == "1"
    assert page.locator(".human-work strong").inner_text() == "2 need review"
    assert page.locator(".invoice-grid tbody tr").count() == 3
    assert page.locator(".detail-panel").count() == 1
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/invoices/blocked")
    page.wait_for_load_state("networkidle")
    assert page.locator(".invoice-grid tbody tr").count() == 1

    page.locator("[data-toggle-upload]").click()
    assert page.locator(".extract-modal").count() == 1
    page.locator("[data-close-upload]").click()
    assert page.locator(".extract-modal").count() == 0

    page.locator("[data-open-settings]").first.click()
    page.wait_for_timeout(200)
    assert page.locator(".modal").count() == 1
    # accent-theme.js mounts its picker into the #settingsContent anchor.
    assert page.locator(".accent-settings").count() == 1
    page.locator("[data-language]").select_option("zh")
    page.wait_for_timeout(200)
    assert page.locator(".filters .filter[data-view='needs_review']").inner_text().split("\n")[0] == "待审"

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/invoices/all")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        page.locator(".mobile-sidebar-toggle").click()
        assert page.locator("body.sidebar-open").count() == 1
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


FIXTURE_INVOICE = {
    "invoice-id": "fixture-inv-001",
    "ref": "Review #1",
    "batch-id": "fixture-batch",
    "title": "Fixture invoice",
    "status": "needs_review",
    "category": "vendor_invoice",
    "source-file": "fixture.pdf",
    "source-path": "samples/fixture.pdf",
    "source-type": "pdf",
    "source-page": "1",
    "vendor-name": "Fixture Vendor",
    "vendor-tax-id": "US-00-0000000",
    "invoice-number": "FX-001",
    "invoice-date": "2026-01-01",
    "due-date": "2026-01-15",
    "currency": "USD",
    "subtotal": "100",
    "tax": "8",
    "total": "108",
    "amount-due": "108",
    "payment-terms": "Net 15",
    "bill-to": "Kelly Labs",
    "purchase-order": "PO-1",
    "iban-or-account-hint": "",
    "confidence": "0.9",
    "field-confidence": json.dumps({}),
    "risk": json.dumps([]),
    "warnings": json.dumps([]),
    "notes": "",
    "line-items": json.dumps(
        [{"line_id": "fixture-inv-001-line-1", "description": "Fixture item", "quantity": 1, "unit_price": 100, "amount": 100}]
    ),
    "proposed-action": "human_confirm",
    "reason": "Fixture reason",
    "decision-action": "",
    "decision-note": "",
    "decided-at": "",
    "created-at": "2026-01-01T00:00:00.000Z",
}


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-invoice-sheet-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-invoice-sheet-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/invoices/all")
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
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                invoices_base = find_resource(nodes, "invoices")
                assert invoices_base and invoices_base.get("baseId"), nodes

                invoice_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{invoices_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_INVOICE,
                        "message": "Seed Kelly Invoice Sheet integration fixture invoice",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [invoice_cr["id"]]},
                )

                # A fresh app process must discover the existing resources and
                # records, and a human decision must write straight to the
                # invoice's own Busabase record.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/invoices/all/fixture-inv-001")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert page.locator(".detail-title h2").inner_text() == "Fixture invoice"
                    page.locator('.detail-form textarea[name="notes"]').fill(
                        "Trusted: matches manual spot-check of the fixture."
                    )
                    page.locator("[data-action='approve']").click()
                    page.wait_for_timeout(800)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={invoices_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("invoice-id") == "fixture-inv-001"
                )
                assert fixture["headCommit"]["fields"]["decision-action"] == "approve", fixture
                assert fixture["headCommit"]["fields"]["status"] == "approved", fixture
                assert (
                    fixture["headCommit"]["fields"]["decision-note"]
                    == "Trusted: matches manual spot-check of the fixture."
                ), fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "invoices", "settings"]), nodes

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 3, nodes
            invoices_base = find_resource(nodes, "invoices")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={invoices_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("decision-action") == "approve"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-invoice-sheet-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning and decision write persist against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
