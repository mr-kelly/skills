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

APP_ROOT = REPO_ROOT / "skills" / "kelly-legal-contracts" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-legal-contracts"
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

    # The demo dataset (4 contracts, 5 issues, 45 checks [10+9+9+8+9 rules
    # across nda/msa/dpa/sow issues], every issue folded into review_items)
    # is ported verbatim (same ids, same copy) from the retired
    # app/server/demo.ts — counts verified against
    # app/app/js/providers/demo-provider.js with a throwaway Node probe
    # before writing these assertions: count-review=3 (needs_review),
    # count-failed=5, count-export=1 (approved).
    page.goto(f"{base_url}/?demo=overview&lang=en#/overview")
    page.wait_for_load_state("networkidle")
    assert page.locator("#count-review").inner_text() == "3"
    assert page.locator("#count-failed").inner_text() == "5"
    assert page.locator("#count-export").inner_text() == "1"
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=contracts&lang=en#/contracts")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 4
    assert "4" in page.locator("#page-subtitle").inner_text()

    page.goto(f"{base_url}/?demo=issues&lang=en#/issues")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 5

    page.goto(f"{base_url}/?demo=checks&lang=en#/checks")
    page.wait_for_load_state("networkidle")
    assert page.locator(".table-wrap tbody tr").count() == 45

    page.goto(f"{base_url}/?demo=claims&lang=en#/claims")
    page.wait_for_load_state("networkidle")
    assert page.locator("table").count() == 2

    page.goto(f"{base_url}/?demo=review&lang=en#/review")
    page.wait_for_load_state("networkidle")
    assert page.locator(".queue-card").count() == 5
    assert "3" in page.locator("#page-subtitle").inner_text()

    page.goto(f"{base_url}/?demo=detail&lang=en")
    page.wait_for_load_state("networkidle")
    assert "Issue #2" in page.locator("#page-title").inner_text()

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

    with tempfile.TemporaryDirectory(prefix="kelly-legal-contracts-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-legal-contracts-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/review")
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
                issues_base = find_resource(nodes, "issues")
                settings_base = find_resource(nodes, "settings")
                assert issues_base and issues_base.get("baseId"), nodes
                assert settings_base and settings_base.get("baseId"), nodes

                issue_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{issues_base['baseId']}/change-requests",
                    {
                        "fields": {
                            "issue-id": "fixture-issue",
                            "ref": 1,
                            "contract-id": "ct-fixture",
                            "platform": "nda",
                            "locale": "US",
                            "status": "needs_review",
                            "compliance-score": 80,
                            "keyword-strategy": "Fixture rationale",
                            "title": "Fixture residuals issue",
                            "bullets": json.dumps(["Fixture risk note"]),
                            "description": "Fixture fallback language",
                            "compliance-summary": "Fixture summary",
                            "suggestions": json.dumps([]),
                            "created-at": "2026-01-01T00:00:00.000Z",
                            "updated-at": "2026-01-01T00:00:00.000Z",
                        },
                        "message": "Seed Kelly Legal Contracts integration fixture issue",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(f"{busabase_url}/api/v1/change-requests/merge", {"changeRequestIds": [issue_cr["id"]]})

                # A fresh app process must discover the existing resources and records,
                # and a human verdict must write straight to Busabase.
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/review")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    page.locator("[data-action='approve']").click()
                    page.wait_for_timeout(500)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={issues_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("issue-id") == "fixture-issue"
                )
                assert fixture["headCommit"]["fields"]["status"] == "approved", fixture
                assert fixture["headCommit"]["fields"]["decision-action"] == "approve", fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "contracts", "issues", "checks", "claims", "claim_rules", "settings"]
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
            issues_base = find_resource(nodes, "issues")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={issues_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("status") == "approved" for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-legal-contracts-home-") as app_home:
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
