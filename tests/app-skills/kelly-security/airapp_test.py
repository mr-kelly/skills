"""Merged AirApp acceptance in Busabase's real browser engine, not a standalone server."""

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
from contextlib import nullcontext
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import Frame, Page, expect, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
SKILL_ROOT = REPO_ROOT / "skills" / "kelly-security"
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))
from runtime import free_port, managed_process

BUSABASE_VERSION = "0.99.1"
APP_ROUTE = "/dashboard/local/airapp/kelly-security-app"
SDK_READ = """
import { connectStore } from './lib/store.mjs';
const [resource, field, value] = process.argv.slice(1);
if (!['hosts', 'runs', 'checks', 'settings', 'findings'].includes(resource)) throw new Error('Unknown test resource');
const store = await connectStore();
const page = await store.page(resource, field ? {valueFilters: [{fieldSlug: field, operator:'eq', value}]} : {});
console.log(JSON.stringify({records: page.records.map(row => ({id:row.id, fields:row.fields})), nextCursor:page.nextCursor}));
"""


def run(command: list[str], env: dict[str, str], timeout: float = 180) -> str:
    result = subprocess.run(command, cwd=SKILL_ROOT, env={**os.environ, **env}, capture_output=True, text=True, timeout=timeout)
    assert result.returncode == 0, f"{' '.join(command[:3])} failed:\n{result.stdout}\n{result.stderr}"
    return result.stdout


def read_records(env: dict[str, str], resource: str, field: str = "", value: str = "") -> list[dict]:
    result = json.loads(run(["node", "--input-type=module", "--eval", SDK_READ, resource, field, value], env))
    assert not result["nextCursor"], "This isolated fixture must remain within its declared one-page read budget"
    return result["records"]


def safe_url(value: str) -> str:
    url = urlsplit(value)
    return f"{url.scheme}://{url.netloc}{url.path}"


def wait_app(page: Page, timeout: float = 180) -> Frame:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for frame in page.frames:
            try:
                if frame.locator("#providerLabel").count() and frame.locator("#providerLabel").inner_text().startswith("Busabase"):
                    if frame.locator("#content .empty-state h1").count() == 0:
                        frame.wait_for_function("document.readyState === 'complete'")
                        return frame
            except Exception:
                pass  # Nodepod may replace its initial iframe while the real app starts.
        page.wait_for_timeout(250)
    raise AssertionError(f"Merged AirApp did not reach live provider; frames: {[safe_url(frame.url) for frame in page.frames]}")


def dimensions(frame: Frame) -> dict:
    result = frame.evaluate("""() => ({width:document.documentElement.scrollWidth, viewport:innerWidth,
        height:document.documentElement.scrollHeight, viewportHeight:innerHeight})""")
    assert result["width"] <= result["viewport"] + 1, result
    assert result["height"] <= result["viewportHeight"] + 1, result
    return result


def navigate(app: Frame, view: str) -> None:
    if app.locator(".mobile-topbar").is_visible():
        app.get_by_role("button", name="打开导航", exact=True).click()
    app.locator(f'[data-nav="{view}"]').click()
    expect(app.locator(f'[data-nav="{view}"]')).to_have_class("active")


def screenshot(page: Page, app: Frame, target: Path, name: str) -> None:
    target.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(target / f"{name}-platform.png"))
    app.locator("html").screenshot(path=str(target / f"{name}-app.png"))


def native_acceptance(origin: str, env: dict[str, str], artifacts: Path) -> dict:
    case = uuid.uuid4().hex[:10]
    host_name = f"Isolated OSS AirApp · {case}"
    alias = f"airapp-lab-{case}"
    scope = f"isolated-oss-airapp-{case}"
    events: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="zh-CN", timezone_id="UTC", color_scheme="dark")
        page = context.new_page()
        page.on("console", lambda message: events.append({"at": time.monotonic(), "kind": "console", "text": re.sub(r"([?&][^=\s]+)=([^\s&]+)", r"\1=[REDACTED]", message.text)}) if message.type == "error" else None)
        page.on("pageerror", lambda error: events.append({"at": time.monotonic(), "kind": "pageerror", "text": str(error)}))
        requests: list[dict] = []
        responses: list[dict] = []

        def request_seen(request) -> None:
            try:
                frame_url = request.frame.url
            except Exception:
                frame_url = "service-worker"
            requests.append({"at": time.monotonic(), "url": safe_url(request.url), "frame": safe_url(frame_url) if frame_url != "service-worker" else frame_url})

        def response_seen(response) -> None:
            responses.append({"at": time.monotonic(), "url": safe_url(response.url), "status": response.status})

        page.on("request", request_seen)
        page.on("response", response_seen)
        try:
            page.goto(f"{origin}{APP_ROUTE}", wait_until="domcontentloaded")
            app = wait_app(page)
            expect(app.locator("#demoBanner")).not_to_be_visible()
            expect(app.locator("#providerLabel")).to_have_text("Busabase · 本机 Agent 执行")
            runtime = app.evaluate("""async () => {const r = await fetch('__airapp/runtime'); return {status:r.status, type:r.headers.get('content-type'), body:await r.json()};}""")
            assert runtime["status"] == 200 and "application/json" in runtime["type"], runtime
            assert runtime["body"]["hosted"] is True and runtime["body"]["runtime"] == "browser", runtime
            assets = app.evaluate("""async () => Promise.all(['base-ui.css','styles/editorial.css','styles.css','js/app.js','js/config.js','vendor/busabase-sdk.js'].map(async file => {const r=await fetch(file);return {file,status:r.status,type:r.headers.get('content-type'),length:(await r.text()).length};}))""")
            for asset in assets:
                assert asset["status"] == 200 and asset["length"] > 0, asset
                assert ("text/css" if asset["file"].endswith(".css") else "javascript") in asset["type"], asset
            page.wait_for_timeout(1000)
            settled = time.monotonic()
            bootstrap = [event for event in events if event["at"] < settled]
            screenshot(page, app, artifacts, "isolated-oss-native-initial-desktop")

            # These are synthetic test values, saved by the actual merged app's ambient session.
            app.locator(".settings-link").click()
            expect(app.locator("#settingsForm")).to_be_visible()
            app.locator('#settingsForm [name="operator"]').fill("Isolated OSS acceptance operator")
            app.locator('#settingsForm [name="scope-note"]').fill(scope)
            app.locator('#settingsForm [name="evidence-policy"]').fill("Synthetic acceptance only. Raw evidence stays local; no SSH execution or credential upload.")
            app.locator('#settingsForm button[type="submit"]').click()
            expect(app.locator("#actionDialog")).not_to_be_visible()
            settings = read_records(env, "settings")
            assert len(settings) == 1
            assert settings[0]["fields"]["onboarding-state"] == "complete"
            assert settings[0]["fields"]["scope-note"] == scope

            app.get_by_role("button", name="添加服务器", exact=True).click()
            app.locator('#hostForm [name="title"]').fill(host_name)
            app.locator('#hostForm [name="ssh-alias"]').fill(alias)
            app.locator('#hostForm [name="role"]').fill("Synthetic alias; never connected")
            app.locator('#hostForm [name="scope-note"]').fill(scope)
            app.locator('#hostForm button[type="submit"]').click()
            expect(app.locator("#actionDialog")).not_to_be_visible()
            hosts = read_records(env, "hosts", "title", host_name)
            assert len(hosts) == 1 and hosts[0]["fields"]["ssh-alias"] == alias

            app.get_by_role("button", name="＋ 发起检查", exact=True).click()
            expect(app.locator("#requestForm")).to_be_visible()
            app.locator(f'#requestForm input[name="hosts"][value="{hosts[0]["id"]}"]').check()
            app.locator('#requestForm [name="since"]').fill("2026-10-25T00:00")
            app.locator('#requestForm [name="until"]').fill("2026-10-26T00:00")
            app.locator('#requestForm [name="scope-reference"]').fill(scope)
            app.locator('#requestForm button[type="submit"]').click()
            expect(app.locator("#actionDialog")).not_to_be_visible()
            tasks = read_records(env, "runs", "title", f"{host_name} · 入侵核查")
            assert len(tasks) == 1
            task = tasks[0]
            assert task["fields"]["status"] == "requested"
            assert task["fields"]["host"] == hosts[0]["id"]
            assert task["fields"]["scope-reference"] == scope
            assert task["fields"]["window-start"] == "2026-10-25T00:00:00.000Z"
            assert task["fields"]["window-end"] == "2026-10-26T00:00:00.000Z"
            assert read_records(env, "checks", "run-reference", task["id"]) == []
            navigate(app, "runs")
            row = app.locator(".record-table tbody tr").filter(has_text=host_name)
            expect(row).to_contain_text("等待本机 Agent")
            row.locator("td a").first.click()
            expect(app.locator(".check-row")).to_have_count(12)
            app.locator(".check-row").nth(3).click()
            expect(app.locator(".detail-panel h2")).to_have_text("SSH 登录与认证")
            expect(app.locator(".detail-panel")).to_contain_text("等待本机 Agent")
            deep_hash = app.evaluate("location.hash")
            assert "item=ssh-authentication" in deep_hash
            app.evaluate("location.reload()")
            app = wait_app(page)
            expect(app.locator(".detail-panel h2")).to_have_text("SSH 登录与认证")
            assert app.evaluate("location.hash") == deep_hash
            assert read_records(env, "runs", "title", f"{host_name} · 入侵核查")[0]["fields"]["status"] == "requested"
            page.wait_for_timeout(8500)  # The real polling loop must not turn a request into SSH execution.
            assert read_records(env, "checks", "run-reference", task["id"]) == []
            assert read_records(env, "runs", "title", f"{host_name} · 入侵核查")[0]["fields"]["status"] == "requested"
            desktop = dimensions(app)
            screenshot(page, app, artifacts, "isolated-oss-native-task-desktop")

            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(400)
            phone = dimensions(app)
            if phone["viewport"] <= 720:
                expect(app.locator(".mobile-topbar")).to_be_visible()
                expect(app.locator(".detail-panel.detail-visible")).to_be_visible()
                app.locator(".back-to-list").click()
                expect(app.locator(".list-panel")).to_be_visible()
                app.get_by_role("button", name="打开导航", exact=True).click()
                expect(app.locator("body.sidebar-open")).to_have_count(1)
                app.locator('[data-nav="hosts"]').click()
                expect(app.locator("body.sidebar-open")).to_have_count(0)
                dimensions(app)
            screenshot(page, app, artifacts, "isolated-oss-native-phone")

            auth = [request for request in requests if urlsplit(request["url"]).path in ("/auth/status", "/auth/start")]
            assert auth == [], f"A hosted AirApp must not use the standalone OAuth gate: {auth}"
            bad_api = [response for response in responses if response["at"] > settled and urlsplit(response["url"]).path.startswith("/api/v1/") and response["status"] >= 400]
            assert bad_api == [], bad_api
            final_errors = [event for event in events if event["at"] > settled]
            assert final_errors == [], final_errors
            result = {"runtime": runtime["body"], "assets": assets, "desktop": desktop, "phone": phone,
                      "taskState": "requested", "checks": 0, "bootstrapErrors": bootstrap,
                      "postSettleErrors": final_errors, "appAuthRequests": auth, "badApiResponses": bad_api}
            artifacts.mkdir(parents=True, exist_ok=True)
            (artifacts / "native-airapp-acceptance.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            return result
        except Exception:
            artifacts.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(artifacts / "native-airapp-failure.png"), full_page=True)
            raise
        finally:
            context.close()
            browser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Explicit disposable loopback Busabase to reuse; default starts its own temporary server")
    parser.add_argument("--artifacts", type=Path, default=Path(tempfile.mkdtemp(prefix="kelly-security-native-airapp-")))
    options = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="kelly-security-airapp-data-") as directory:
        work = Path(directory)
        config = work / "empty-config"
        config.write_text("", encoding="utf-8")
        if options.base_url:
            url = urlsplit(options.base_url)
            assert url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")
            assert not url.username and not url.password and url.path in ("", "/") and not url.query and not url.fragment
            origin = options.base_url.rstrip("/")
            manager = nullcontext()
        else:
            port = free_port()
            origin = f"http://127.0.0.1:{port}"
            command = ["npx", "--yes", f"busabase@{BUSABASE_VERSION}", "server", "--host", "127.0.0.1", "--port", str(port), "--data", str(work / "data")]
            manager = managed_process(command, work, {"BUSABASE_CONFIG": str(config), "BUSABASE_API_KEY": "", "BUSABASE_SPACE_ID": "local"}, f"{origin}/api/health", timeout=180)
        env = {"BUSABASE_BASE_URL": origin, "BUSABASE_SPACE_ID": "local", "BUSABASE_API_KEY": "", "BUSABASE_CONFIG": str(config)}
        with manager:
            run(["node", "scripts/check.mjs"], env)
            run(["node", "scripts/setup.mjs", "--apply"], env)
            result = native_acceptance(origin, env, options.artifacts)
            print(f"PASS native merged AirApp — hosted={result['runtime']['hosted']} runtime={result['runtime']['runtime']}; real settings/host/task saved; task stayed requested with zero checks")
            print(f"PASS assets/MIME, refresh/deep link, desktop {result['desktop']['viewport']}px and actual phone frame {result['phone']['viewport']}px overflow; no app OAuth/API errors after bootstrap")
            print(f"Platform bootstrap console events: {len(result['bootstrapErrors'])}; captured separately from final app errors.")
            print(f"Artifacts: {options.artifacts}")


if __name__ == "__main__":
    main()
