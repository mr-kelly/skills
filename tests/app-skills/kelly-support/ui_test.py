from __future__ import annotations

import json
import os
import subprocess
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

    # 8 knowledge-base articles/macros — the eighth is the phone-script guide
    # the QA training flow reads from, which is why it carries `training-source`.
    page.goto(f"{base_url}/?demo=knowledge#/knowledge")
    page.wait_for_load_state("networkidle")
    assert page.locator(".kb-grid .kb-card").count() == 8

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

    page.goto(f"{base_url}/?demo=tickets&lang=en#/tickets/tk-costa-complaint")
    page.wait_for_load_state("networkidle")
    execution = page.locator(".execution-state.bad")
    assert execution.is_visible()
    assert "Delivery failed" in execution.inner_text()
    assert "Attempt 1" in execution.inner_text()
    assert "Retry after" in execution.inner_text()
    assert page.locator(".approval-waiting").count() == 0
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
                accounts_base = find_resource(nodes, "accounts")
                messages_base = find_resource(nodes, "messages")
                account_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{accounts_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "account-id": "email-support",
                            "channel": "email",
                            "connector": "email_agent",
                            "display-name": "Fixture Support",
                            "handle": "support@example.test",
                            "status": "ok",
                        },
                        "message": "Seed Kelly Support email account",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [account_cr["id"]]})
                record_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{tickets_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "ticket-id": "tk-fixture",
                            "account-id": "email-support",
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
                message_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{messages_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "message-id": "msg-fixture-incoming",
                            "ticket-id": "tk-fixture",
                            "direction": "incoming",
                            "sender": "Fixture Customer",
                            "text": "How do I export my notes?",
                            "sent-at": "2026-07-06T08:00:00.000Z",
                            "provider-message-id": "<incoming-fixture@example.test>",
                            "provider-references": "<older-fixture@example.test>",
                        },
                        "message": "Seed Kelly Support incoming message",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [message_cr["id"]]})

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
                    assert page.locator("#notice", has_text="Confirm support policies").is_visible()
                    row = page.locator(".table-wrap table tbody tr", has_text="Integration Fixture Ticket")
                    assert row.is_visible()
                    row.locator("a").first.click()
                    page.wait_for_load_state("networkidle")
                    approve = page.locator("[data-action='decide'][data-decision='approve']")
                    assert approve.is_disabled()

                    page.goto(f"{app_url}/#/settings")
                    page.wait_for_load_state("networkidle")
                    page.locator("[data-action='save-settings']").click()
                    page.wait_for_timeout(500)

                    page.goto(f"{app_url}/#/tickets/tk-fixture")
                    page.wait_for_load_state("networkidle")
                    approve = page.locator("[data-action='decide'][data-decision='approve']")
                    assert approve.is_enabled()
                    approve.click()
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

                terminal_crs = []
                for fields in (
                    {
                        "ticket-id": "tk-close",
                        "account-id": "email-support",
                        "channel": "email",
                        "customer-name": "Close Customer",
                        "customer-email": "close@example.test",
                        "subject": "Close this ticket",
                        "body": "No reply needed.",
                        "status": "approved",
                        "proposed-action": "close",
                        "suggested-reply": "I guarantee a refund, but this draft must not be sent.",
                        "decision-action": "approve",
                        "decided-at": "2026-07-06T08:03:00.000Z",
                        "created-at": "2026-07-06T08:01:00.000Z",
                    },
                    {
                        "ticket-id": "tk-refund",
                        "account-id": "email-support",
                        "channel": "email",
                        "customer-name": "Refund Customer",
                        "customer-email": "refund@example.test",
                        "subject": "Refund approved but provider missing",
                        "body": "Please refund.",
                        "status": "approved",
                        "proposed-action": "refund",
                        "suggested-reply": "We are reviewing your approved refund request.",
                        "decision-action": "approve",
                        "decided-at": "2026-07-06T08:03:00.000Z",
                        "created-at": "2026-07-06T08:02:00.000Z",
                    },
                ):
                    terminal_crs.append(
                        post_json(
                            f"{busabase_url}/api/v1/bases/{tickets_base['baseId']}/change-requests",
                            {
                                "fields": fields,
                                "message": f"Seed {fields['ticket-id']}",
                                "submittedBy": "kelly-skills-test",
                            },
                        )["id"]
                    )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": terminal_crs})

                trusted_env = {**os.environ, "BUSABASE_BASE_URL": busabase_url}
                queued = subprocess.run(
                    ["node", "skills/kelly-support/scripts/execute_decisions.mjs", "--apply"],
                    cwd=REPO_ROOT,
                    env=trusted_env,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                assert "queued send_reply" in queued.stdout, queued.stdout
                assert "completed close" in queued.stdout, queued.stdout
                assert "blocked refund" in queued.stdout, queued.stdout

                with tempfile.TemporaryDirectory(prefix="kelly-support-connector-") as connector_dir:
                    connector_path = Path(connector_dir) / "connector.mjs"
                    connector_path.write_text(
                        """let body = '';
for await (const chunk of process.stdin) body += chunk;
const request = JSON.parse(body);
console.log(JSON.stringify({ok:true,dryRun:false,messageId:'<provider-fixture-1@example.test>',submittedMessageId:'<provider-fixture-1@example.test>',providerReceiptId:'250 2.0.0 queued as fixture-receipt-1',accepted:[request.toAddress],rejected:[],identityId:'fixture',sendAs:request.fromAddress,mailboxId:'fixture',threaded:Boolean(request.inReplyTo)}));
""",
                        encoding="utf-8",
                    )
                    worker_env = {**trusted_env, "KELLY_EMAIL_CONNECTOR_PATH": str(connector_path)}
                    finalized = subprocess.run(
                        ["node", "skills/kelly-support/scripts/process_email_queue.mjs", "--apply"],
                        cwd=REPO_ROOT,
                        env=worker_env,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    assert "tk-fixture: sent <provider-fixture-1@example.test> receipt=250 2.0.0 queued as fixture-receipt-1 threaded" in finalized.stdout, finalized.stdout
                    repeated_worker = subprocess.run(
                        ["node", "skills/kelly-support/scripts/process_email_queue.mjs", "--apply"],
                        cwd=REPO_ROOT,
                        env=worker_env,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    assert "No queued email replies" in repeated_worker.stdout, repeated_worker.stdout

                repeated = subprocess.run(
                    [
                        "node",
                        "skills/kelly-support/scripts/finalize_delivery.mjs",
                        "--ticket-id",
                        "tk-fixture",
                        "--provider-message-id",
                        "250 2.0.0 queued as fixture-receipt-1",
                        "--apply",
                    ],
                    cwd=REPO_ROOT,
                    env=trusted_env,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                assert "already finalized" in repeated.stdout, repeated.stdout

                records = read_json(f"{busabase_url}/api/v1/records?baseId={tickets_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("ticket-id") == "tk-fixture"
                )
                fixture_fields = fixture["headCommit"].get("payload") or fixture["headCommit"]["fields"]
                assert fixture_fields["status"] == "done", fixture
                assert fixture_fields["execution-status"] == "sent", fixture
                assert fixture_fields["execution-provider-message-id"] == "250 2.0.0 queued as fixture-receipt-1", fixture
                assert fixture_fields["sla-first-response-at"], fixture

                by_ticket = {
                    (row.get("headCommit", {}).get("payload") or row.get("headCommit", {}).get("fields", {})).get("ticket-id"): row
                    for row in record_items
                }
                close_fields = by_ticket["tk-close"]["headCommit"].get("payload") or by_ticket["tk-close"]["headCommit"]["fields"]
                refund_fields = by_ticket["tk-refund"]["headCommit"].get("payload") or by_ticket["tk-refund"]["headCommit"]["fields"]
                assert close_fields["status"] == "done", close_fields
                assert close_fields["execution-status"] == "completed", close_fields
                assert refund_fields["status"] == "blocked", refund_fields
                assert refund_fields["execution-status"] == "blocked", refund_fields

                messages = read_json(f"{busabase_url}/api/v1/records?baseId={messages_base['baseId']}")
                message_items = messages if isinstance(messages, list) else messages.get("records", [])
                outgoing = [
                    r
                    for r in message_items
                    if (r.get("headCommit", {}).get("payload") or r.get("headCommit", {}).get("fields", {})).get("direction") == "outgoing"
                ]
                assert len(outgoing) == 1, outgoing
                outgoing_fields = outgoing[0]["headCommit"].get("payload") or outgoing[0]["headCommit"]["fields"]
                assert outgoing_fields["provider-message-id"] == "<provider-fixture-1@example.test>", outgoing_fields

                retry_ticket_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{tickets_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "ticket-id": "tk-retry",
                            "account-id": "email-support",
                            "channel": "email",
                            "customer-name": "Retry Customer",
                            "customer-email": "retry@example.test",
                            "subject": "Retry a temporary rejection",
                            "body": "Please help.",
                            "status": "approved",
                            "proposed-action": "send_reply",
                            "suggested-reply": "This reply is approved and grounded.",
                            "decision-action": "approve",
                            "decided-at": "2026-07-06T08:06:00.000Z",
                            "created-at": "2026-07-06T08:06:00.000Z",
                        },
                        "message": "Seed retry ticket",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                retry_message_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{messages_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "message-id": "msg-retry-incoming",
                            "ticket-id": "tk-retry",
                            "direction": "incoming",
                            "sender": "Retry Customer",
                            "text": "Please help.",
                            "sent-at": "2026-07-06T08:06:00.000Z",
                            "provider-message-id": "<incoming-retry@example.test>",
                        },
                        "message": "Seed retry incoming message",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [retry_ticket_cr["id"], retry_message_cr["id"]]},
                )
                subprocess.run(
                    ["node", "skills/kelly-support/scripts/execute_decisions.mjs", "--apply"],
                    cwd=REPO_ROOT,
                    env=trusted_env,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                with tempfile.TemporaryDirectory(prefix="kelly-support-retry-") as retry_dir:
                    failure_connector = Path(retry_dir) / "failure.mjs"
                    failure_connector.write_text(
                        "console.log(JSON.stringify({ok:false,message:'temporary provider rejection',code:'EENVELOPE',responseCode:451,retryable:true,ambiguous:false})); process.exitCode=1;\n",
                        encoding="utf-8",
                    )
                    failure_env = {**trusted_env, "KELLY_EMAIL_CONNECTOR_PATH": str(failure_connector)}
                    failed = subprocess.run(
                        [
                            "node",
                            "skills/kelly-support/scripts/process_email_queue.mjs",
                            "--ticket-id",
                            "tk-retry",
                            "--retry-delay-seconds",
                            "0",
                            "--apply",
                        ],
                        cwd=REPO_ROOT,
                        env=failure_env,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    assert "failed_retryable" in failed.stdout, failed.stdout

                    records = read_json(f"{busabase_url}/api/v1/records?baseId={tickets_base['baseId']}")
                    record_items = records if isinstance(records, list) else records.get("records", [])
                    retry_row = next(
                        row
                        for row in record_items
                        if (row.get("headCommit", {}).get("payload") or {}).get("ticket-id") == "tk-retry"
                    )
                    retry_fields = retry_row["headCommit"]["payload"]
                    assert retry_fields["execution-status"] == "failed", retry_fields
                    assert retry_fields["execution-retryable"] == "true", retry_fields
                    assert retry_fields["execution-next-retry-at"], retry_fields

                    requeued = subprocess.run(
                        [
                            "node",
                            "skills/kelly-support/scripts/execute_decisions.mjs",
                            "--retry-failed",
                            "--apply",
                        ],
                        cwd=REPO_ROOT,
                        env=trusted_env,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    assert "tk-retry: queued send_reply" in requeued.stdout, requeued.stdout

                    success_connector = Path(retry_dir) / "success.mjs"
                    success_connector.write_text(
                        """let body=''; for await (const chunk of process.stdin) body+=chunk;
const request=JSON.parse(body); console.log(JSON.stringify({ok:true,dryRun:false,messageId:'<provider-retry@example.test>',submittedMessageId:'<provider-retry@example.test>',providerReceiptId:'250 2.0.0 queued as fixture-retry-receipt',accepted:[request.toAddress],rejected:[],identityId:'fixture',sendAs:request.fromAddress,mailboxId:'fixture',threaded:true}));
""",
                        encoding="utf-8",
                    )
                    success_env = {**trusted_env, "KELLY_EMAIL_CONNECTOR_PATH": str(success_connector)}
                    retried = subprocess.run(
                        [
                            "node",
                            "skills/kelly-support/scripts/process_email_queue.mjs",
                            "--ticket-id",
                            "tk-retry",
                            "--apply",
                        ],
                        cwd=REPO_ROOT,
                        env=success_env,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    assert "tk-retry: sent <provider-retry@example.test> receipt=250 2.0.0 queued as fixture-retry-receipt threaded" in retried.stdout, retried.stdout

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "accounts", "tickets", "messages", "knowledge-base", "qa-pairs", "sync-log", "settings"]
            ), nodes
            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 8, nodes
            tickets_base = find_resource(nodes, "tickets")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={tickets_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("status") == "done"
                for record in record_items
            )

def test_schema_upgrade() -> None:
    busabase_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    with tempfile.TemporaryDirectory(prefix="kelly-support-upgrade-") as data_dir:
        command = [
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
        with managed_process(command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            result = subprocess.run(
                ["node", "tests/app-skills/kelly-support/upgrade_test.mjs", busabase_url],
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            assert "PASS v2 -> v3 additive schema upgrade" in result.stdout, result.stdout


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
                    test_schema_upgrade()
                    print("PASS OSS - v2 to v3 additive schema migration")
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
