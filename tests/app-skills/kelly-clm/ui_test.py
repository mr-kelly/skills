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

APP_ROOT = REPO_ROOT / "skills" / "kelly-clm" / "content" / "kelly-clm-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-clm"
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


def fill_contract_form(page: Page, *, name: str, counterparty: str, notice_deadline: str = "") -> None:
    page.fill('input[name="name"]', name)
    page.fill('input[name="counterparty"]', counterparty)
    page.fill('input[name="type"]', "MSA")
    page.select_option('select[name="stage"]', "negotiation")
    page.fill('input[name="owner"]', "Fixture Owner")
    page.fill('input[name="business_owner"]', "Fixture Business Owner")
    page.fill('input[name="value"]', "USD 10k")
    page.fill('input[name="start_date"]', "2026-08-01")
    page.fill('input[name="end_date"]', "2027-08-01")
    if notice_deadline:
        page.fill('input[name="renewal_date"]', "2027-08-01")
        page.fill('input[name="notice_deadline"]', notice_deadline)
    page.fill('textarea[name="next_action"]', "Fixture next action")
    page.select_option('select[name="risk"]', "high")


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)

    # The demo dataset (4 contracts, 4 obligations, 2 approvals) is ported
    # verbatim from the retired app/server/demo.ts. Counts verified with a
    # throwaway `node -e` probe against demo-provider.js's getState() before
    # writing these assertions: renewalWatchCount=2, atRiskObligationsCount=1,
    # approvalsNeedingReviewCount=2, metrics.renewals_90d=0 (none of the
    # retired demo dataset's 2027/2028 dates fall within the 90-day window of
    # the demo's fixed NOW=2026-07-07).
    page.goto(f"{base_url}/?demo=1#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-approvals").inner_text() == "2"
    assert page.locator("#count-renewals").inner_text() == "2"
    assert page.locator("#count-risk").inner_text() == "1"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/contracts")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 4

    page.goto(f"{base_url}/?demo=1#/obligations")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 4
    assert page.locator("[data-obligation-action]").count() == 4

    page.goto(f"{base_url}/?demo=1#/renewals")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 2

    page.goto(f"{base_url}/?demo=1#/approvals")
    page.wait_for_load_state("networkidle")
    assert page.locator(".card-grid .card").count() == 2

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

    with tempfile.TemporaryDirectory(prefix="kelly-clm-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-clm-home-") as app_home:
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
                    # createAirAppConnectGate()'s onProvision handler calls onRetry()
                    # without awaiting it, so the app's own async data load can still
                    # be in flight. Navigating before it settles aborts that fetch as
                    # a spurious "Failed to fetch" console error this test would
                    # otherwise catch.
                    page.wait_for_load_state("networkidle")

                    # Direct create: the operator saves a new contract
                    # straight through the browser form -- no separate
                    # approval step.
                    page.goto(f"{app_url}/#/contracts/new")
                    page.wait_for_load_state("networkidle")
                    fill_contract_form(
                        page,
                        name="Fixture Bakery MSA",
                        counterparty="Fixture Bakery Co",
                        notice_deadline="2026-07-20",
                    )
                    page.click("#contractForm button[type=submit]")
                    page.wait_for_url(re.compile(r"#/contracts/ct-"), timeout=15_000)
                    page.wait_for_load_state("networkidle")
                    assert page.locator("#title").inner_text() == "Fixture Bakery MSA"
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                contracts_base = find_resource(nodes, "contracts")
                obligations_base = find_resource(nodes, "obligations")
                approvals_base = find_resource(nodes, "approvals")
                assert contracts_base and obligations_base and approvals_base, nodes

                records = read_json(f"{busabase_url}/api/v1/records?baseId={contracts_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("name") == "Fixture Bakery MSA"
                )
                fixture_fields = (fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"])
                assert fixture_fields["counterparty"] == "Fixture Bakery Co", fixture_fields
                assert fixture_fields["stage"] == "negotiation", fixture_fields
                assert fixture_fields.get("notice-acknowledged-at", "") == "", fixture_fields
                fixture_contract_id = fixture_fields["contract-id"]

                # Obligations/approvals enter Busabase only through an
                # external process (an agent workflow or the operator
                # editing Busabase directly) -- the browser only ever
                # decides on them (mark done / acknowledge / approve), it
                # never creates them (see SKILL.md's Boundary and
                # busabase-provider.js's comments). Seed one fixture row in
                # each Base directly via the Busabase HTTP API, mirroring
                # kelly-ai-newsroom's ui_test.py precedent for the same
                # decision-only shape.
                obligation_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{obligations_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "obligation-id": "fixture-obligation",
                            "contract-id": fixture_contract_id,
                            "title": "Fixture obligation",
                            "owner": "Fixture Owner",
                            "due-date": "2026-08-01",
                            "status": "open",
                            "evidence": "Fixture evidence",
                            "created-at": "2026-07-01T00:00:00.000Z",
                            "updated-at": "2026-07-01T00:00:00.000Z",
                        },
                        "message": "Seed Kelly CLM integration fixture obligation",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [obligation_cr["id"]]})

                approval_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{approvals_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "approval-id": "fixture-approval",
                            "contract-id": fixture_contract_id,
                            "title": "Fixture approval",
                            "summary": "Fixture approval summary",
                            "status": "needs_review",
                            "decision-note": "",
                            "decided-at": "",
                            "created-at": "2026-07-01T00:00:00.000Z",
                            "updated-at": "2026-07-01T00:00:00.000Z",
                        },
                        "message": "Seed Kelly CLM integration fixture approval",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [approval_cr["id"]]})

                # A fresh app process must discover the existing resources
                # and records, then direct mark-done, acknowledge-renewal,
                # and approval-decision writes must all land straight on
                # Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)

                    page.goto(f"{app_url}/#/obligations")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    page.locator('[data-obligation-action="done"][data-id="fixture-obligation"]').click()
                    page.wait_for_selector(
                        '[data-obligation-action="reopen"][data-id="fixture-obligation"]', timeout=15_000
                    )

                    page.goto(f"{app_url}/#/renewals")
                    page.wait_for_load_state("networkidle")
                    page.locator(f'[data-acknowledge-id="{fixture_contract_id}"]').click()
                    page.wait_for_timeout(500)

                    page.goto(f"{app_url}/#/approvals")
                    page.wait_for_load_state("networkidle")
                    page.locator('[data-action="approve"][data-id="fixture-approval"]').click()
                    page.wait_for_timeout(500)

                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={obligations_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture_obligation = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("obligation-id") == "fixture-obligation"
                )
                assert (fixture_obligation["headCommit"].get("payload") or fixture_obligation["headCommit"]["fields"])["status"] == "done", fixture_obligation

                records = read_json(f"{busabase_url}/api/v1/records?baseId={contracts_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture_contract = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("contract-id") == fixture_contract_id
                )
                assert (fixture_contract["headCommit"].get("payload") or fixture_contract["headCommit"]["fields"])["notice-acknowledged-at"] != "", fixture_contract

                records = read_json(f"{busabase_url}/api/v1/records?baseId={approvals_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture_approval = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("approval-id") == "fixture-approval"
                )
                assert (fixture_approval["headCommit"].get("payload") or fixture_approval["headCommit"]["fields"])["status"] == "approved", fixture_approval

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "contracts", "obligations", "approvals"]), nodes

        # Structure and data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 4, nodes
            obligations_base = find_resource(nodes, "obligations")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={obligations_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("status") == "done" for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-clm-home-") as app_home:
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
                        "PASS OSS - lazy provisioning, direct contract create write, and direct "
                        "mark-done/acknowledge/decision writes against temporary Busabase"
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
