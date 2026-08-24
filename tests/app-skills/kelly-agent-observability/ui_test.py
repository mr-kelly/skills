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

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-agent-observability"
APP_ROOT = SKILL_ROOT / "content" / "kelly-agent-observability-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-agent-observability"
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

    # Demo mode regenerates the same fixed mock fleet in the browser
    # (generateFleetData({now: 2026-07-10T20:00:00Z, seed: 7, tracesPerAgent: 16}),
    # never reads or writes Busabase). Counts verified against
    # app/app/js/fleet-model.js with a throwaway `node -e` probe before writing
    # these assertions: 8 agents, 3 degraded, 2 critical, 128 total traces
    # (8 * 16), booking-assistant has 16 traces, and the first broken trace is
    # expense-approval-trace-0002 (3 steps, breaks at policy_lookup).
    page.goto(f"{base_url}/?demo=1&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#summary-degraded-count").inner_text() == "3"
    assert page.locator("#count-agents").inner_text() == "8"
    assert page.locator("#count-handoffs").inner_text() == "0"
    assert page.locator("#page-subtitle").inner_text().startswith("Last seeded")
    assert page.locator(".agent-card").count() == 8
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=agents&lang=en#/agents")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 8

    page.goto(f"{base_url}/?demo=1&lang=en#/agents/booking-assistant")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "Booking Assistant"
    assert page.locator(".detail-side .table-wrap tbody tr").count() == 0
    assert page.locator(".detail-main .table-wrap tbody tr").count() == 16

    page.goto(f"{base_url}/?demo=trace&lang=en#/traces/expense-approval-trace-0002")
    page.wait_for_load_state("networkidle")
    assert page.locator("#page-title").inner_text() == "expense-approval-trace-0002"
    assert page.locator(".step-item").count() == 3
    assert page.locator(".step-break").count() == 1
    # .chain-break-flag is CSS text-transform: uppercase, so compare
    # case-insensitively against the rendered text rather than the raw DOM text.
    assert "chain broke here" in page.locator(".chain-break-flag").inner_text().lower()

    page.goto(f"{base_url}/?demo=1&lang=zh#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#summary-degraded-count").inner_text() == "3"

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


def run_generator(busabase_url: str) -> None:
    # The real ingestion path for agents/traces is the trusted skill-root
    # script, never a manual raw-fixture POST — mirrors how a real operator
    # would refresh the Busabase-backed snapshot. --traces-per-agent 5 keeps
    # the run fast (8 * 5 = 40 traces) while staying well under the traces
    # Base's 100-record readLimit.
    result = subprocess.run(
        [
            "node",
            "scripts/generate_fleet_data.mjs",
            "--apply",
            "--seed",
            "7",
            "--traces-per-agent",
            "5",
            "--now",
            "2026-07-10T20:00:00.000Z",
        ],
        cwd=SKILL_ROOT,
        env={**os.environ, "BUSABASE_BASE_URL": busabase_url},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, f"generator failed:\nstdout={result.stdout}\nstderr={result.stderr}"
    assert "Wrote 8 agents and 40 traces" in result.stdout, result.stdout


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-agent-observability-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-agent-observability-home-") as app_home:
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
                    # Bases exist but the trusted generator has not run yet.
                    assert page.locator("#content .empty").count() == 1
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                agents_base = find_resource(nodes, "agents")
                traces_base = find_resource(nodes, "traces")
                handoffs_base = find_resource(nodes, "handoffs")
                settings_base = find_resource(nodes, "settings")
                assert agents_base and agents_base.get("baseId"), nodes
                assert traces_base and traces_base.get("baseId"), nodes
                assert handoffs_base and handoffs_base.get("baseId"), nodes
                assert settings_base and settings_base.get("baseId"), nodes
                assert sorted(resource_keys(nodes)) == sorted(
                    ["app-root", "agents", "traces", "handoffs", "settings"]
                ), nodes

                run_generator(busabase_url)

                agent_records = read_json(f"{busabase_url}/api/v1/records?baseId={agents_base['baseId']}")
                agent_items = agent_records if isinstance(agent_records, list) else agent_records.get("records", [])
                assert len(agent_items) == 8, agent_items
                trace_records = read_json(f"{busabase_url}/api/v1/records?baseId={traces_base['baseId']}")
                trace_items = trace_records if isinstance(trace_records, list) else trace_records.get("records", [])
                assert len(trace_items) == 40, trace_items

                # A fresh app process must read the trusted script's snapshot,
                # render it, and let the one human action (a handoff note)
                # write straight to the handoffs Base as a brand-new row.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/agents/booking-assistant")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    assert page.locator("#page-title").inner_text() == "Booking Assistant"
                    page.locator("#handoffNote").fill("Fixture check: matches the trusted generator's seed snapshot.")
                    page.locator('button[data-status="needs_investigation"]').click()
                    page.locator("[data-handoff-message]").get_by_text("Recorded").wait_for(
                        state="visible", timeout=15_000
                    )
                    assert page.locator("#count-handoffs").inner_text() == "1"
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                handoff_records = read_json(f"{busabase_url}/api/v1/records?baseId={handoffs_base['baseId']}")
                handoff_items = (
                    handoff_records if isinstance(handoff_records, list) else handoff_records.get("records", [])
                )
                assert len(handoff_items) == 1, handoff_items
                fields = (handoff_items[0]["headCommit"].get("payload") or handoff_items[0]["headCommit"]["fields"])
                assert fields["target-type"] == "agent"
                assert fields["target-id"] == "booking-assistant"
                assert fields["status"] == "needs_investigation"
                assert "matches the trusted generator" in fields["note"]

                # Agent/trace rows are untouched by the AirApp — re-running the
                # generator must not have been triggered by the handoff write.
                agent_records_after = read_json(f"{busabase_url}/api/v1/records?baseId={agents_base['baseId']}")
                agent_items_after = (
                    agent_records_after
                    if isinstance(agent_records_after, list)
                    else agent_records_after.get("records", [])
                )
                assert len(agent_items_after) == 8, agent_items_after


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-agent-observability-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning, trusted-script seed, and handoff write against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
