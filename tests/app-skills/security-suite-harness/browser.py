"""Real demo and merged Busabase browser acceptance for the security suite."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests/app-skills/harness"))
from runtime import free_port, managed_process

VIEWS = {
    "kelly-appsec": ("overview", "projects", "endpoints", "rules", "matrix", "findings", "runs"),
    "kelly-compliance": ("overview", "resources", "controls", "evidence", "issues", "assessments"),
}
VIEWPORTS = ((1280, 820), (1280, 720), (390, 844), (360, 740))


def command(skill: str, arguments: list[str], env: dict[str, str]) -> str:
    result = subprocess.run(arguments, cwd=REPO_ROOT / "skills" / skill, env={**os.environ, **env}, capture_output=True, text=True, timeout=180)
    assert result.returncode == 0, f"Test command failed: {arguments[:3]}\n{result.stdout}\n{result.stderr}"
    return result.stdout


def bounds(app) -> None:
    dimensions = app.evaluate("""() => ({width:document.documentElement.scrollWidth, viewport:innerWidth,
      height:document.documentElement.scrollHeight, viewportHeight:innerHeight})""")
    assert dimensions["width"] <= dimensions["viewport"] + 1, dimensions
    assert dimensions["height"] <= dimensions["viewportHeight"] + 1, dimensions
    assert not re.search(r"\b(?:rec|bse|bsf|nod|cmt|crq)[a-z0-9]{10,}\b", app.locator("body").inner_text()), "Unresolved persistence id reached visible UI"


def controls_in_bounds(app) -> None:
    # Every enabled, visible primary control needs a reachable phone hit target.
    controls = app.locator("#content button:visible, #content select:visible")
    for index in range(controls.count()):
        control = controls.nth(index)
        control.scroll_into_view_if_needed()
        box = control.bounding_box()
        assert box and box["x"] >= -1 and box["x"] + box["width"] <= app.evaluate("innerWidth") + 1, box


def navigate(app, view: str) -> None:
    top = app.locator(".mobile-topbar")
    if top.is_visible() and not app.locator("body.sidebar-open").count():
        app.get_by_role("button", name="打开导航", exact=True).click()
    app.locator(f'[data-nav="{view}"]').click()
    expect(app.locator(f'[data-nav="{view}"]')).to_have_class("active")
    if top.is_visible():
        expect(app.locator("body.sidebar-open")).to_have_count(0)


def demo_acceptance(skill: str, origin: str) -> dict:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for width, height in VIEWPORTS:
            context = browser.new_context(viewport={"width": width, "height": height}, locale="zh-CN")
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            page.goto(f"{origin}/?demo=1#/overview")
            page.wait_for_load_state("networkidle")
            expect(page.locator("#demoBanner")).to_be_visible()
            expect(page.locator("#content")).not_to_be_empty()
            for view in VIEWS[skill]:
                navigate(page, view)
                expect(page.locator("#content")).not_to_be_empty()
                bounds(page)
                controls_in_bounds(page)
            deep_link = page.url
            page.reload()
            page.wait_for_load_state("networkidle")
            assert page.url == deep_link
            expect(page.locator(f'[data-nav="{VIEWS[skill][-1]}"]')).to_have_class("active")
            bounds(page)
            page.locator(".mobile-topbar a" if width < 700 else ".settings-link").click()
            expect(page.locator("#actionDialog")).to_be_visible()
            for tab in ("guide", "style"):
                page.locator(f'#actionDialog [data-tab="{tab}"]').click()
                bounds(page)
            expect(page.locator('#actionDialog input[name="editorialFamily"]')).to_have_count(7)
            page.locator('#actionDialog label:has(input[name="editorialFamily"][value="ink-paper"])').click()
            expect(page.locator("html")).to_have_attribute("data-theme", "ink-paper")
            page.keyboard.press("Escape")
            expect(page.locator("#actionDialog")).not_to_be_visible()
            assert not errors, errors
            context.close()
        browser.close()
    return {"skill": skill, "provider": "synthetic demo", "viewports": len(VIEWPORTS), "views": list(VIEWS[skill]), "errors": 0}


def wait_native(page, timeout: float = 150):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for frame in page.frames:
            try:
                label = frame.locator("#providerLabel")
                if label.count() and label.inner_text().startswith("Busabase"):
                    frame.wait_for_function("document.readyState === 'complete'")
                    return frame
            except Exception:
                pass
        page.wait_for_timeout(250)
    raise AssertionError("Native merged AirApp did not connect to the actual Busabase session")


def native_acceptance(skill: str, origin: str, env: dict[str, str]) -> dict:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        page = context.new_page()
        errors: list[tuple[float, str]] = []
        page.on("pageerror", lambda error: errors.append((time.monotonic(), str(error))))
        page.on("console", lambda message: errors.append((time.monotonic(), message.text)) if message.type == "error" else None)
        page.goto(f"{origin}/dashboard/local/airapp/{skill}-app", wait_until="domcontentloaded")
        app = wait_native(page)
        expect(app.locator("#demoBanner")).not_to_be_visible()
        runtime = app.evaluate("""async () => {const r=await fetch('__airapp/runtime');return {status:r.status,body:await r.json()};}""")
        assert runtime["status"] == 200 and runtime["body"]["runtime"] == "browser" and runtime["body"]["hosted"] is True, runtime
        assets = app.evaluate("""async () => Promise.all(['js/app.js','js/config.js','styles.css','vendor/busabase-sdk.js'].map(async file => {const r=await fetch(file);return {file,status:r.status,type:r.headers.get('content-type'),length:(await r.text()).length};}))""")
        for asset in assets:
            assert asset["status"] == 200 and asset["length"] > 0, asset
            assert ("text/css" if asset["file"].endswith(".css") else "javascript") in asset["type"], asset
        settled = time.monotonic()
        for view in VIEWS[skill]:
            navigate(app, view)
            expect(app.locator("#content")).not_to_be_empty()
            bounds(app)
        written = native_write(skill, app, env)
        assert not [text for at, text in errors if at > settled], errors
        page.reload()
        app = wait_native(page)
        expect(app.locator("#demoBanner")).not_to_be_visible()
        expect(app.locator("#projectSelect" if skill == "kelly-appsec" else "#programSelect")).to_have_value(written["id"])
        runtime_after_reload = app.evaluate("""async () => {const r=await fetch('__airapp/runtime');return {status:r.status,body:await r.json()};}""")
        assert runtime_after_reload["status"] == 200 and runtime_after_reload["body"]["runtime"] == "browser" and runtime_after_reload["body"]["hosted"] is True, runtime_after_reload
        # Nodepod rebuilds a temporary virtual iframe on each platform navigation.
        # The final session frame must be clean after that bounded bootstrap.
        settled = time.monotonic()
        screenshots = Path(tempfile.gettempdir()) / "kelly-security-suite-acceptance"
        screenshots.mkdir(exist_ok=True)
        app.locator("html").screenshot(path=str(screenshots / f"{skill}-native-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(500)
        for view in VIEWS[skill]:
            navigate(app, view)
            bounds(app)
            controls_in_bounds(app)
        app.locator("html").screenshot(path=str(screenshots / f"{skill}-native-phone.png"))
        assert not [text for at, text in errors if at > settled], errors
        context.close()
        browser.close()
    return {"skill": skill, "provider": "real merged OSS AirApp", "runtime": runtime["body"], "errorsAfterBootstrap": 0}


def native_write(skill: str, app, env: dict[str, str]) -> dict:
    case = uuid.uuid4().hex[:10]
    if skill == "kelly-appsec":
        navigate(app, "projects")
        app.locator('[data-action="project"]').first.click()
        expect(app.locator("#projectForm")).to_be_visible()
        fields = {"title": f"Synthetic native AppSec {case}", "owner": "Isolated OSS reviewer", "repository-reference": "fixture:native-browser", "source-revision": f"fixture-{case}", "environment": "isolated-lab", "origin": "http://127.0.0.1:1", "scope-note": f"fixture-scope-{case}"}
        for name, value in fields.items():
            app.locator(f'#projectForm [name="{name}"]').fill(value)
        app.locator('#projectForm button[type="submit"]').click()
        expect(app.locator("#actionDialog")).not_to_be_visible()
        records = read_records(skill, env, "projects", "title", fields["title"])
        assert len(records) == 1, records
        record = records[0]
        for name, value in fields.items():
            assert record["fields"][name] == value, (name, record)
        assert record["fields"]["onboarding-state"] == "complete"
        assert record["fields"]["onboarding-version"] == 1
        document = {"schemaVersion": 1, "sourceRevision": fields["source-revision"], "endpoints": [{"key": "native-public", "method": "GET", "path": "/synthetic-public", "flow": "Synthetic native acceptance", "location": "fixture:native-browser"}], "rules": [{"key": "native-public", "endpointKey": "native-public", "identity": "anonymous", "expectation": "allow", "expectedStatuses": [200], "assertions": [{"path": "id", "equals": "synthetic-public"}], "objectId": "synthetic-public", "policyNote": "Synthetic public route allows anonymous access", "confirmed": True}]}
        navigate(app, "endpoints")
        app.locator('[data-action="import"]').first.click()
        app.locator('#importForm textarea[name="document"]').fill(json.dumps(document))
        app.locator('#importForm button[type="submit"]').click()
        expect(app.locator("#actionDialog")).not_to_be_visible()
        rules = read_records(skill, env, "rules", "project-reference", record["id"])
        assert len(rules) == 1 and rules[0]["fields"]["project"] == record["id"], rules
        assert rules[0]["fields"]["source-revision"] == fields["source-revision"]
        navigate(app, "runs")
        app.locator('[data-action="request"]').first.click()
        expect(app.locator("#requestForm")).to_be_visible()
        app.locator('#requestForm [name="scope-reference"]').fill(fields["scope-note"])
        app.locator('#requestForm input[name="rules"]').first.check()
        app.locator('#requestForm button[type="submit"]').click()
        expect(app.locator("#actionDialog")).not_to_be_visible()
        runs = read_records(skill, env, "runs", "project-reference", record["id"])
        assert len(runs) == 1 and runs[0]["fields"]["status"] == "requested", runs
        assert runs[0]["fields"]["project"] == record["id"]
        assert runs[0]["fields"]["source-revision"] == fields["source-revision"]
    else:
        navigate(app, "overview")
        app.locator('[data-action="new-program"]').first.click()
        expect(app.locator("#programForm")).to_be_visible()
        fields = {"title": f"Synthetic native Compliance {case}", "owner": "Isolated OSS reviewer", "service-description": "Synthetic local acceptance only", "accounts": "111111111111", "regions": "us-east-1", "scope-reference": f"fixture-scope-{case}"}
        for name, value in fields.items():
            app.locator(f'#programForm [name="{name}"]').fill(value)
        app.locator('#programForm [name="assessment-type"]').select_option("period")
        app.locator('#programForm [name="period-start"]').fill("2026-10-01T00:00:00Z")
        app.locator('#programForm [name="period-end"]').fill("2026-10-25T23:59:59Z")
        app.locator('#programForm [name="scope-version"]').fill("1")
        app.locator('#programForm [name="framework-version"]').fill("kelly-soc2-readiness@1")
        app.locator('#programForm button[type="submit"]').click()
        expect(app.locator("#actionDialog")).not_to_be_visible()
        records = read_records(skill, env, "programs", "title", fields["title"])
        assert len(records) == 1, records
        record = records[0]
        for name, value in fields.items():
            assert record["fields"][name] == value, (name, record)
        assert record["fields"]["onboarding-state"] == "complete"
        assert record["fields"]["scope-version"] == 1
        assert record["fields"]["framework-version"] == "kelly-soc2-readiness@1"
        navigate(app, "overview")
        app.locator('[data-action="initialize"]').first.click()
        navigate(app, "controls")
        expect(app.locator(".record-list .record-item")).to_have_count(8)
        controls = read_records(skill, env, "controls", "program-reference", record["id"])
        assert len(controls) == 8 and all(control["fields"]["program"] == record["id"] for control in controls)
    return record


def read_records(skill: str, env: dict[str, str], resource: str, field: str, value: str) -> list[dict]:
    script = """import {connectStore} from './lib/store.mjs';
      const [resource,field,value]=process.argv.slice(1); const store=await connectStore();
      const page=await store.page(resource,{valueFilters:[{fieldSlug:field,operator:'eq',value}]});
      console.log(JSON.stringify(page));"""
    page = json.loads(command(skill, ["node", "--input-type=module", "--eval", script, resource, field, value], env))
    assert not page.get("nextCursor"), "Isolated browser fixture exceeded its one-page bound"
    return page["records"]


def main(skill: str, native: bool = False) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    args = parser.parse_args()
    app_root = REPO_ROOT / "skills" / skill / "content" / f"{skill}-app"
    if args.base_url:
        assert urlsplit(args.base_url).hostname in ("127.0.0.1", "localhost", "::1"), "Acceptance fixtures require a loopback target"
        print(json.dumps(native_acceptance(skill, args.base_url.rstrip("/"), {}) if native else demo_acceptance(skill, args.base_url.rstrip("/"))))
        return
    with tempfile.TemporaryDirectory(prefix=f"{skill}-browser-") as directory:
        work = Path(directory)
        port = free_port()
        origin = f"http://127.0.0.1:{port}"
        env = {"BUSABASE_BASE_URL": origin if native else "", "BUSABASE_SPACE_ID": "local", "BUSABASE_API_KEY": "", "BUSABASE_CONFIG": str(work / "empty-config"), "PORT": str(port)}
        (work / "empty-config").write_text("")
        if native:
            process = ["npx", "--yes", "busabase@0.99.1", "server", "--host", "127.0.0.1", "--port", str(port), "--data", str(work / "data")]
            with managed_process(process, work, env, f"{origin}/api/health", timeout=180):
                command(skill, ["node", "scripts/setup.mjs", "--apply"], env)
                print(json.dumps(native_acceptance(skill, origin, env)))
        else:
            with managed_process(["node", "server.js"], app_root, env, f"{origin}/health"):
                print(json.dumps(demo_acceptance(skill, origin)))
