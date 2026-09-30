"""Real isolated Busabase + browser learning workflow; synthetic records only."""
from __future__ import annotations
import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location("homework_ui", Path(__file__).with_name("ui_test.py"))
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
OUT = Path(os.environ.get("HOMEWORK_EVIDENCE_DIR", str(ui.RESULTS_ROOT / "learning-flow")))

def rows(url, base):
    result = ui.read_json(f"{url}/api/v1/records?baseId={base['baseId']}")
    return result if isinstance(result, list) else result.get("records", [])

def fields(record):
    return record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})

def pending(url):
    result = ui.read_json(f"{url}/api/v1/change-requests")
    return [cr for cr in (result if isinstance(result, list) else result.get("changeRequests", [])) if cr.get("status") == "in_review"]

def merge(url, requests):
    ids = [r["id"] for r in requests]
    ui.post_json(f"{url}/api/v1/change-requests/reviews", {"changeRequestIds": ids, "verdict": "approved"})
    result = ui.post_json(f"{url}/api/v1/change-requests/merge", {"changeRequestIds": ids})
    assert all(r.get("ok") for r in result["results"]), result

def seed(url, base, payload):
    request = ui.post_json(f"{url}/api/v1/bases/{base['baseId']}/change-requests", {"fields": payload, "autoMerge": False, "message": "Synthetic learning-flow fixture"})
    merge(url, [request])

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bport, aport = ui.free_port(), ui.free_port()
    busabase, app = f"http://127.0.0.1:{bport}", f"http://127.0.0.1:{aport}"
    with tempfile.TemporaryDirectory() as data, tempfile.TemporaryDirectory() as home:
        command = ["npx", "-y", f"busabase@{ui.BUSABASE_VERSION}", "server", "--host", "127.0.0.1", "--port", str(bport), "--data", data]
        with ui.managed_process(command, ui.REPO_ROOT, {}, f"{busabase}/api/health", timeout=90):
            with ui.managed_process(["node", "server.js"], ui.APP_ROOT, {"BUSABASE_BASE_URL": busabase, "HOME": home, "PORT": str(aport)}, f"{app}/health"):
                with sync_playwright() as p:
                    browser = p.chromium.launch()
                    context = browser.new_context(viewport={"width": 1440, "height": 1000})
                    page = context.new_page()
                    errors = ui.attach_error_capture(page)
                    page.goto(app)
                    page.locator("[data-provision]").click()
                    page.wait_for_selector("[data-provision]", state="detached")
                    page.wait_for_timeout(700)
                    nodes = ui.read_json(f"{busabase}/api/v1/nodes?depth=2")
                    bases = {key: ui.find_resource(nodes, key) for key in ["questions", "mistakes", "papers", "reviews"]}
                    seed(busabase, bases["questions"], ui.FIXTURE_QUESTION)
                    seed(busabase, bases["mistakes"], {"mistake-id": "m-learning-fixture", "question-id": "fixture-q-001", "ref": 1, "title": "Synthetic mistake", "subject": "Math", "topic": "calculation", "status": "needs_review", "analysis": json.dumps({"root_cause": "Cause not verified", "fix_strategy": "Preserve this strategy"})})
                    diagram = {"points": {"A": [0, 0], "B": [200, 0], "C": [200, 160], "D": [0, 160], "E": [140, 0], "G": [0, 65], "H": [200, 120], "Q": [70, -30]}, "note": "Synthetic UI fixture, not geometry evidence"}
                    items = [{"prompt": "Synthetic calculation: 3 + 4", "answer": "7", "hint": "Count carefully", "explanation": "Three plus four is seven.", "diagram": diagram}, {"prompt": "Explain your thinking", "answer": "", "parent_answer": "Manual reference: describe the calculation", "explanation": "Parent checks reasoning", "diagram": diagram}]
                    seed(busabase, bases["papers"], {"paper-id": "p-learning-fixture", "ref": 1, "title": "Synthetic illustrated practice", "subject": "Math", "status": "needs_review", "question-count": 2, "linked-mistakes": json.dumps(["m-learning-fixture"]), "items": json.dumps(items), "analysis": json.dumps({"deep_notes": "Parent-only note", "attempts": []})})
                    seed(busabase, bases["reviews"], {**ui.FIXTURE_REVIEW, "review-id": "rv-learning-fixture", "target-type": "paper", "target-id": "p-learning-fixture"})
                    # Trusted ingestion itself must propose pending creates AND
                    # updates, report their IDs, and never silently merge.
                    recorder = ui.REPO_ROOT / "skills/kelly-homework-coach/scripts/record_homework.mjs"
                    def record(payload):
                        result = subprocess.run(["node", str(recorder), "--apply"], input=json.dumps(payload), text=True, capture_output=True, env={**os.environ, "BUSABASE_BASE_URL": busabase, "HOME": home})
                        assert result.returncode == 0, result.stderr
                        assert "changeRequestId" in result.stdout
                        return pending(busabase)
                    requests = record({"questions": [{"question_id": "q-recorder-fixture", "title": "Recorder fixture", "prompt_text": "2 + 2", "status": "needs_review"}]})
                    assert len(requests) == 1 and len(rows(busabase, bases["questions"])) == 1
                    merge(busabase, requests)
                    requests = record({"questions": [{"question_id": "q-recorder-fixture", "title": "Recorder updated", "prompt_text": "3 + 3", "status": "needs_review"}]})
                    assert len(requests) == 1
                    assert any(fields(row).get("title") == "Recorder fixture" for row in rows(busabase, bases["questions"]))
                    merge(busabase, requests)
                    assert any(fields(row).get("title") == "Recorder updated" for row in rows(busabase, bases["questions"]))
                    page.reload(); page.wait_for_load_state("networkidle")
                    # Story 1: enter from home, child feedback is not approval.
                    page.locator("[data-select-id='fixture-q-001']").click()
                    assert "Step one" not in page.locator(".detail-panel").inner_text()
                    assert page.locator("[data-question-explanation]").count() == 1
                    assert not page.locator("[data-question-explanation]").evaluate("element => element.open")
                    page.locator("[data-question-explanation] summary").click()
                    assert "Step one" in page.locator("[data-question-explanation]").text_content(), page.locator("[data-question-explanation]").text_content()[:400]
                    page.locator("[data-understand]").click()
                    assert not pending(busabase)
                    assert fields(rows(busabase, bases["questions"])[0])["status"] == "needs_review"
                    page.screenshot(path=OUT / "homework-child-feedback.png", full_page=True)
                    page.locator("[data-route='mistakes']").click()
                    page.locator("[data-select-id]").first.click()
                    page.locator("#mistakeCause").fill("Observed: child skipped one calculation step; cause unverified.")
                    page.locator("[data-save-mistake]").click()
                    page.wait_for_selector("[data-refresh-cause]")
                    requests = pending(busabase); assert len(requests) == 1
                    assert "Cause not verified" in fields(rows(busabase, bases["mistakes"])[0])["analysis"]
                    assert page.locator("[data-save-mistake]").is_disabled()
                    page.screenshot(path=OUT / "homework-cause-pending.png", full_page=True)
                    merge(busabase, requests)
                    page.locator("[data-refresh-cause]").click()
                    page.wait_for_function("!document.querySelector('[data-save-mistake]').disabled")
                    analysis = json.loads(fields(rows(busabase, bases["mistakes"])[0])["analysis"])
                    assert analysis["fix_strategy"] == "Preserve this strategy"
                    assert analysis["root_cause"].startswith("Observed:")
                    page.screenshot(path=OUT / "homework-cause-saved.png", full_page=True)
                    page.evaluate("navigator.clipboard.writeText = async text => { window.copiedPractice = text; }")
                    page.locator("[data-practice-request]").click()
                    page.wait_for_function("Boolean(window.copiedPractice)")
                    copied = page.evaluate("window.copiedPractice")
                    assert "fixture-q-001" in copied and bases["questions"]["baseId"] in copied
                    assert ui.FIXTURE_QUESTION["prompt-text"] in copied
                    assert len(rows(busabase, bases["papers"])) == 1 and not pending(busabase)
                    # Story 2: parent reviews, child practices, result remains pending.
                    page.locator("[data-route='papers']").click()
                    page.locator("[data-select-id]").first.click()
                    assert page.locator("[data-run-start]").count() == 0
                    assert "Parent-only note" not in page.locator(".detail-panel").inner_text()
                    page.screenshot(path=OUT / "homework-child-paper-gated.png", full_page=True)
                    page.locator("[data-route='review']").first.click()
                    page.locator("[data-select-id]").first.click()
                    assert "Manual reference" in page.locator(".detail-panel").inner_text()
                    assert page.locator(".practice-diagram").count() == 2
                    page.screenshot(path=OUT / "homework-parent-paper-review.png", full_page=True)
                    page.locator("[data-decision-action='approve']").click()
                    page.wait_for_timeout(800)
                    requests = pending(busabase); assert len(requests) == 2
                    assert fields(rows(busabase, bases["papers"])[0])["status"] == "needs_review"
                    merge(busabase, requests)
                    page.reload(); page.wait_for_load_state("networkidle")
                    page.locator("[data-route='papers']").click()
                    page.locator("[data-select-id]").first.click()
                    assert "Three plus four" not in page.locator(".detail-panel").inner_text()
                    page.locator("[data-run-start]").click()
                    page.locator("#runAnswer").fill("1"); page.locator("[data-run-submit]").click()
                    assert "Three plus four" not in page.locator(".detail-panel").inner_text()
                    page.screenshot(path=OUT / "homework-practice-first-hint.png", full_page=True)
                    page.locator("[data-run-retry]").click()
                    page.locator("#runAnswer").fill("7"); page.locator("[data-run-submit]").click()
                    assert "Three plus four" in page.locator(".detail-panel").inner_text()
                    page.locator("[data-run-next]").click()
                    page.locator("textarea#runAnswer").fill("I counted three then four more.")
                    page.locator("[data-run-submit]").click(); page.locator("[data-run-next]").click()
                    page.locator("[data-run-finish]").click()
                    page.wait_for_timeout(800)
                    requests = pending(busabase); assert len(requests) == 1
                    assert fields(rows(busabase, bases["papers"])[0])["status"] == "approved"
                    page.screenshot(path=OUT / "homework-result-pending.png", full_page=True)
                    merge(busabase, requests)
                    paper_fields = fields(rows(busabase, bases["papers"])[0])
                    attempt = json.loads(paper_fields["analysis"])["attempts"][0]
                    assert attempt["correct"] == 1
                    assert attempt["results"][0]["first_given"] == "1"
                    assert attempt["results"][0]["first_outcome"] == "wrong"
                    assert len(attempt["results"][0]["answer_history"]) == 2
                    assert fields(rows(busabase, bases["reviews"])[0])["status"] == "approved"
                    page.locator("[data-run-exit]").click()
                    page.reload(); page.wait_for_load_state("networkidle")
                    assert page.locator("[data-run-start]").count() == 0
                    ui.assert_no_horizontal_overflow(page)
                    assert not errors, errors
                    context.close(); browser.close()
    print("PASS real Busabase: child feedback, cause pending/merge/status, source handoff, paper approval gate, attempts, stale review preservation")

if __name__ == "__main__":
    main()
