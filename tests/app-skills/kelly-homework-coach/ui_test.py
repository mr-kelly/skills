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

APP_ROOT = REPO_ROOT / "skills" / "kelly-homework-coach" / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-homework-coach"
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

    # The fixed demo dataset (demoSnapshot() in app/app/js/homework-model.js,
    # ported verbatim from the retired app/server/demo.ts) counts verified
    # against a throwaway Node probe before writing these assertions:
    # 3 questions, 3 mistakes, 2 papers, 4 review items. Review status counts
    # are needs_review=2, changes_requested=1, approved=1, blocked=0, so the
    # sidebar's "needs a kind decision" tile (needs_review + changes_requested)
    # reads 3, "ready for agent" (approved) reads 1, blocked reads 0.
    page.goto(f"{base_url}/?demo=student&lang=en#/student")
    page.wait_for_load_state("networkidle")
    assert page.locator(".brand-title").inner_text() == "Homework Coach"
    assert page.locator(".brand-subtitle").inner_text() == "Student desk + review queue"
    assert page.locator(".nav button[data-route='student'] small").inner_text() == "3"
    assert page.locator(".nav button[data-route='mistakes'] small").inner_text() == "3"
    assert page.locator(".nav button[data-route='papers'] small").inner_text() == "2"
    assert page.locator(".nav button[data-route='review'] small").inner_text() == "4"
    attention = page.locator(".attention-metric b")
    assert attention.nth(0).inner_text() == "3"
    assert attention.nth(1).inner_text() == "1"
    assert attention.nth(2).inner_text() == "2"
    assert attention.nth(3).inner_text() == "0"
    assert page.locator(".metric-grid .metric").count() == 4
    assert page.locator(".row-list .row").count() == 3
    assert page.locator(".photo-box [data-local-photo]").count() == 1
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=mistakes&lang=en#/mistakes")
    page.wait_for_load_state("networkidle")
    assert page.locator(".row-list .row").count() == 3

    page.goto(f"{base_url}/?demo=papers&lang=en#/papers")
    page.wait_for_load_state("networkidle")
    assert page.locator(".row-list .row").count() == 2

    page.goto(f"{base_url}/?demo=review&lang=en#/review")
    page.wait_for_load_state("networkidle")
    assert page.locator(".row-list .row").count() == 4
    assert page.locator("[data-decision-action='approve']").count() == 1

    page.goto(f"{base_url}/?demo=student&lang=zh#/student")
    page.wait_for_load_state("networkidle")
    assert page.locator(".brand-title").inner_text() == "作業小教練"

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=student&lang=en#/student")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        page.locator("[data-open-sidebar]").click()
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


FIXTURE_QUESTION = {
    "question-id": "fixture-q-001",
    "ref": "1",
    "title": "Fixture question title",
    "subject": "Math",
    "grade": "Grade 4",
    "topic": "Fixture topic",
    "source": "text",
    "status": "needs_review",
    "difficulty": "medium",
    "photo-label": "",
    "prompt-text": "What is 2+2?",
    "student-answer": "5",
    "correct-answer": "4",
    "outcome": "wrong",
    "confidence": "0.9",
    "created-at": "2026-01-01T00:00:00.000Z",
    "tags": json.dumps(["fixture"]),
    "explanation": json.dumps(
        {"kid_summary": "Fixture explanation", "steps": ["Step one"], "key_concept": "k", "self_check": "s", "next_hint": "n"}
    ),
    "mistake-id": "",
}
FIXTURE_REVIEW = {
    "review-id": "fixture-review-001",
    "ref": "1",
    "target-type": "question",
    "target-id": "fixture-q-001",
    "title": "Fixture review title",
    "status": "needs_review",
    "summary": "Fixture summary",
    "risk": json.dumps(["child-facing"]),
    "proposed-action": "mark_understood",
    "reason": "Fixture reason",
    "suggestions": json.dumps(["Fixture suggestion"]),
    "suggested-note": "Fixture suggested note",
    "decision-action": "",
    "decision-comment": "",
    "decided-at": "",
    "execution-status": "",
    "execution-detail": "",
    "executed-at": "",
}


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-homework-coach-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-homework-coach-home-") as app_home:
                app_env = {"BUSABASE_BASE_URL": busabase_url, "HOME": app_home, "PORT": str(app_port)}
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (
                    _,
                    app_logs,
                ):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/student")
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
                questions_base = find_resource(nodes, "questions")
                reviews_base = find_resource(nodes, "reviews")
                assert questions_base and questions_base.get("baseId"), nodes
                assert reviews_base and reviews_base.get("baseId"), nodes

                question_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{questions_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_QUESTION,
                        "message": "Seed Kelly Homework Coach integration fixture question",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                review_cr = post_json(
                    f"{busabase_url}/api/v1/bases/{reviews_base['baseId']}/change-requests",
                    {
                        "fields": FIXTURE_REVIEW,
                        "message": "Seed Kelly Homework Coach integration fixture review",
                        "submittedBy": "kelly-skills-test",
                    },
                )
                post_json(
                    f"{busabase_url}/api/v1/change-requests/merge",
                    {"changeRequestIds": [question_cr["id"], review_cr["id"]]},
                )

                # A fresh app process must discover the existing resources and records,
                # and a human decision must write straight to Busabase (both the
                # review's own row and, via submitReview()'s target sync, the linked
                # question's status).
                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 390, "height": 844})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/review/fixture-review-001")
                    page.wait_for_load_state("networkidle")
                    assert page.locator("[data-provision]").count() == 0
                    # The detail panel also shows the linked question's own
                    # summary lower down ("Target" section), which repeats
                    # the .question-title class — scope to the first match
                    # (the review's own hero-answer) to avoid a strict-mode
                    # violation on the duplicate selector.
                    assert page.locator(".question-title").first.inner_text() == "Fixture review title"
                    page.locator("#reviewNote").fill("Trusted: matches manual spot-check of the fixture.")
                    page.locator("[data-decision-action='approve']").click()
                    page.wait_for_timeout(800)
                    assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close()

                records = read_json(f"{busabase_url}/api/v1/records?baseId={reviews_base['baseId']}")
                record_items = records if isinstance(records, list) else records.get("records", [])
                fixture = next(
                    r
                    for r in record_items
                    if r.get("headCommit", {}).get("fields", {}).get("review-id") == "fixture-review-001"
                )
                assert fixture["headCommit"]["fields"]["decision-action"] == "approve", fixture
                assert fixture["headCommit"]["fields"]["status"] == "approved", fixture
                assert (
                    fixture["headCommit"]["fields"]["decision-comment"]
                    == "Trusted: matches manual spot-check of the fixture."
                ), fixture

                question_records = read_json(f"{busabase_url}/api/v1/records?baseId={questions_base['baseId']}")
                question_items = question_records if isinstance(question_records, list) else question_records.get("records", [])
                question_fixture = next(
                    r
                    for r in question_items
                    if r.get("headCommit", {}).get("fields", {}).get("question-id") == "fixture-q-001"
                )
                assert question_fixture["headCommit"]["fields"]["status"] == "approved", question_fixture

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(
                ["app-root", "questions", "mistakes", "papers", "reviews", "settings"]
            ), nodes

        # Data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 6, nodes
            reviews_base = find_resource(nodes, "reviews")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={reviews_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                record.get("headCommit", {}).get("fields", {}).get("decision-action") == "approve"
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-homework-coach-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI at desktop and phone viewports")
                    test_busabase_provisioning(browser)
                    print("PASS OSS - lazy provisioning, decision write with target sync, and persistence against temporary Busabase")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
