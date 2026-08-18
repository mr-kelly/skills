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

APP_ROOT = REPO_ROOT / "skills" / "kelly-digital-human" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-digital-human"
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

    # The demo dataset (8 QA checks, 2 personas, 2 pipelines, 4 vendors, 5
    # events) is ported verbatim from the retired app/server/demo.ts via
    # digital-human-model.js. Counts verified with a throwaway Playwright
    # probe against the running app before writing these assertions:
    # count-review=2 (the 2 checks with curated status "fix" and no decision
    # yet -- voice-consent, fallback), count-fix=2, count-routes=2
    # (pipelines.length).
    page.goto(f"{base_url}/?demo=1#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-review").inner_text() == "2"
    assert page.locator("#count-fix").inner_text() == "2"
    assert page.locator("#count-routes").inner_text() == "2"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/qa")
    page.wait_for_load_state("networkidle")
    assert page.locator(".review-row").count() == 8

    page.goto(f"{base_url}/?demo=1#/studio")
    page.wait_for_load_state("networkidle")
    assert page.locator("#avatar").count() == 1

    page.goto(f"{base_url}/?demo=1#/vendors")
    page.wait_for_load_state("networkidle")
    assert page.locator(".vendors-layout table tbody tr").count() == 4

    # A decision in demo mode is a no-op (retired app/app.js's demoNotice
    # behavior, ported verbatim): the review queue never has any decisions
    # actually apply, only a notice banner appears.
    page.goto(f"{base_url}/?demo=1#/qa")
    page.wait_for_load_state("networkidle")
    page.locator(".review-row").first.click()
    page.locator('[data-action="approve"]').click()
    page.wait_for_timeout(300)
    assert page.locator(".notice-banner").count() == 1

    page.goto(f"{base_url}/?demo=1#/settings")
    page.wait_for_load_state("networkidle")

    # The demo-visuals panel (ported from the retired app/server/demo-visuals.ts)
    # renders exactly the 3 synthetic screenshot cards on a demo page.
    page.goto(f"{base_url}/?demo=1#/overview")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("#demoVisualsPanel")
    assert page.locator(".demo-visual-card").count() == 3

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

    with tempfile.TemporaryDirectory(prefix="kelly-digital-human-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-digital-human-home-") as app_home:
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
                    page.wait_for_load_state("networkidle")

                    # The curated QA checklist is not stored in Busabase (see
                    # config.js/digital-human-model.js's comments) -- it must
                    # still render straight from the app after provisioning,
                    # with every check starting undecided (needs_review or
                    # the curated "fix" status).
                    page.goto(f"{app_url}/#/qa")
                    # A hash-route navigation into an already-loaded SPA does not
                    # necessarily trigger new network activity, so `networkidle`
                    # can resolve before the render pass that populates
                    # `.review-row` actually runs -- especially on a slower CI
                    # runner. Poll the DOM directly instead of trusting network
                    # quiescence as a proxy for render completion.
                    page.wait_for_function("document.querySelectorAll('.review-row').length === 8", timeout=15_000)
                    assert page.locator(".review-row").count() == 8

                    # Direct write: approve the first review-queue item
                    # straight through the browser, no separate approval step.
                    page.locator(".review-row").first.click()
                    page.locator('[data-field="note"]').fill("Fixture reviewer note")
                    page.locator('[data-action="approve"]').click()
                    page.wait_for_selector(".notice-banner", timeout=15_000)
                    page.wait_for_load_state("networkidle")

                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                decisions_base = find_resource(nodes, "qa-decisions")
                assert decisions_base, nodes

                records = read_json(f"{busabase_url}/api/v1/records?baseId={decisions_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                assert len(record_items) == 1, record_items
                fixture_fields = (record_items[0]["headCommit"].get("payload") or record_items[0]["headCommit"]["fields"])
                assert fixture_fields["action"] == "approve", fixture_fields
                assert fixture_fields["note"] == "Fixture reviewer note", fixture_fields
                decided_check_id = fixture_fields["check-id"]

                # A fresh app process must discover the existing resources
                # and the recorded decision, and the review queue must reflect
                # it as "Approved" straight from Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)

                    page.goto(f"{app_url}/#/qa")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    approved_row = page.locator(f'[data-select="{decided_check_id}"]')
                    approved_row.wait_for(state="visible")
                    assert "Approved" in approved_row.inner_text()

                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "qa-decisions"]), nodes

        # Structure and data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 2, nodes
            decisions_base = find_resource(nodes, "qa-decisions")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={decisions_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any((record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("action") == "approve" for record in record_items)


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-digital-human-home-") as app_home:
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
                    print("PASS OSS - lazy provisioning and a direct QA decision write against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
