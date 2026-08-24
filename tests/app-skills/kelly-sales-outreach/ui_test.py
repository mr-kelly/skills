from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-sales-outreach"
APP_ROOT = SKILL_ROOT / "content" / "kelly-sales-outreach-app"
BUSABASE_VERSION = "0.16.2"


def launch_chromium(playwright):
    configured = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "").strip()
    candidates = sorted(
        Path("/opt/bunny-agent/pw-browsers").glob("chromium-*/chrome-linux64/chrome"),
        reverse=True,
    )
    executable = configured or (str(candidates[0]) if candidates else "")
    options = {"headless": True}
    if executable:
        options["executable_path"] = executable
    return playwright.chromium.launch(**options)


def assert_no_horizontal_overflow(page: Page) -> None:
    sizes = page.evaluate(
        """() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })"""
    )
    assert sizes["content"] <= sizes["viewport"] + 1, sizes


def attach_error_capture(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    return errors


def unexpected_errors(errors: list[str]) -> list[str]:
    return [error for error in errors if "status of 404" not in error]


def nav(page: Page, view: str):
    return page.locator(f'.filters button[data-view="{view}"]')


def rows(page: Page):
    return page.locator(".work-list [data-select-id]")


def page_title(page: Page, text: str):
    return page.locator(".workspace-head h1", has_text=text)


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


def find_resource(nodes, key: str):
    for node in nodes:
        if (node.get("metadata") or {}).get("resourceKey") == key:
            return node
        found = find_resource(node.get("children") or [], key)
        if found:
            return found
    return None


def records_of(busabase_url: str, base_id: str) -> list[dict]:
    payload = read_json(f"{busabase_url}/api/v1/records?baseId={base_id}&limit=100")
    items = payload if isinstance(payload, list) else payload.get("records", [])
    return [(item.get("headCommit") or {}).get("payload") or (item.get("headCommit") or {}).get("fields") or item.get("fields") or {} for item in items]


def run_script(args: list[str], busabase_url: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [shutil.which("node") or "node", *args],
        cwd=SKILL_ROOT,
        env={
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(Path.home()),
            "BUSABASE_BASE_URL": busabase_url,
            "BUSABASE_API_KEY": "local",
            "BUSABASE_SPACE_ID": "local",
        },
        capture_output=True,
        text=True,
        timeout=120,
    )


FINDINGS = {
    "companies": [
        {
            "key": "miaogou",
            "name": "秒购电商",
            "website": "https://miaogou.example.com",
            "sourceUrl": "https://miaogou.example.com/jobs/service-ops",
            "industry": "综合电商",
            "region": "上海",
            "companySize": "1000-5000 人",
            "matchScore": 94,
            "matchReason": "客服规模大，公开招聘质检运营。",
            "painSignals": "职位说明提到抽检覆盖不足与旺季投诉压力。",
            "evidenceType": "first-party",
            "evidenceDate": "2026-08-12",
            "emailSubject": "客服全量质检：先做一份机会清单",
            "emailBody": "您好，看到贵司正在扩充客服质检团队……",
        },
        {
            "key": "yunhe",
            "name": "云禾生活",
            "website": "https://yunhe.example.com",
            "sourceUrl": "https://yunhe.example.com/about",
            "industry": "新消费",
            "region": "广州",
            "companySize": "200-500 人",
            "matchScore": 72,
            "matchReason": "客服规模可能符合，但需要补联系人。",
            "painSignals": "已确认多渠道售后，暂未找到明确采购信号。",
            "evidenceType": "market-signal",
            "evidenceDate": "2026-08-10",
            "emailSubject": "多渠道售后的统一质检",
            "emailBody": "您好，看到贵司同时运营多个售后渠道……",
        },
    ],
    "leads": [
        {
            "companyKey": "miaogou",
            "email": "service-ops@miaogou.example.com",
            "contactName": "客服运营团队",
            "role": "客服运营",
            "sourceUrl": "https://miaogou.example.com/contact",
            "confidence": "high",
        }
    ],
}


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)
    page.goto(f"{base_url}/?demo=1#/to-send")
    page.wait_for_load_state("networkidle")

    assert page_title(page, "待审核").is_visible()
    assert page.locator(".snapshot-badge", has_text="DEMO").is_visible()
    assert rows(page).count() == 3
    assert page.locator(".human-work-primary", has_text="待你审核首触达").is_visible()
    assert_no_horizontal_overflow(page)

    detail = page.locator(".detail-panel")
    assert detail.locator("h2", has_text="秒购电商").is_visible()
    assert "客服" in detail.locator("[data-subject]").input_value()
    assert detail.locator("[data-lead] option").count() == 1
    assert detail.locator("[data-approve]").is_enabled()
    assert detail.get_by_role("heading", name="业务信号").is_visible()

    page.locator('[data-select-id="company-yunhe"]').click()
    detail.locator("h2", has_text="云禾生活").wait_for()
    assert detail.locator("[data-approve]").is_disabled()
    assert detail.locator('.command-chip[data-copy-command="/kelly-sales-outreach research"]').is_visible()

    nav(page, "profile").click()
    page_title(page, "产品与 ICP").wait_for()
    assert page.locator('[data-profile="offerName"]').input_value() == "澄明 AI 客服质检"
    assert page.locator('[data-profile="idealCustomer"]').input_value()

    page.locator("[data-open-help]").first.click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible")
    dialog.get_by_role("heading", name="回到对话框能做什么").wait_for(state="visible")
    assert dialog.locator(".command-list .command-chip").count() == 4
    dialog.get_by_role("button", name="资源", exact=True).click()
    dialog.get_by_role("heading", name="Busabase 资源").wait_for(state="visible")
    page.keyboard.press("Escape")
    page.locator("#helpModal").wait_for(state="detached")

    nav(page, "to-send").click()
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page_title(page, "待审核").is_visible()
    assert not unexpected_errors(errors), errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/to-send")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)
        page.locator("[data-mobile-sidebar]").click()
        assert page.locator("body.sidebar-open").count() == 1
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 5, "y": 5})
        assert page.locator("body.sidebar-open").count() == 0
        rows(page).first.click()
        assert page.locator("body.mobile-detail-open").count() == 1
        assert page.locator(".detail-panel [data-approve]").is_visible()
        assert_no_horizontal_overflow(page)
        page.locator("[data-back-to-list]").click()
        assert page.locator("body.mobile-detail-open").count() == 0
        assert not unexpected_errors(errors), errors
        mobile.close()


def test_busabase_round_trip(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-sales-outreach-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-sales-outreach-home-") as app_home:
                app_env = {
                    "BUSABASE_BASE_URL": busabase_url,
                    "BUSABASE_SPACE_ID": "local",
                    "HOME": app_home,
                    "PORT": str(app_port),
                }
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)

                    setup_dry = run_script(["scripts/setup.mjs"], busabase_url)
                    assert setup_dry.returncode == 0, setup_dry.stderr
                    for slug in (
                        "kelly-sales-outreach-profile",
                        "kelly-sales-outreach-companies",
                        "kelly-sales-outreach-leads",
                    ):
                        assert slug in setup_dry.stdout, setup_dry.stdout
                    assert resource_keys(read_json(f"{busabase_url}/api/v1/nodes?depth=2")) == []

                    page.goto(f"{app_url}/#/to-send")
                    page.get_by_role("heading", name="Initialize the Busabase workspace").wait_for()
                    page.locator("[data-provision]").click()
                    page.get_by_role("heading", name="先告诉我你卖什么").wait_for(timeout=30_000)
                    page.locator('[data-onboarding="sellerName"]').fill("Kelly")
                    page.locator('[data-onboarding="offerName"]').fill("AI 客服质检")
                    page.locator('[data-onboarding="offerSummary"]').fill("全量分析客服会话并给出可验证的改进项。")
                    page.locator('[data-onboarding="fromEmail"]').fill("kelly@example.com")
                    page.get_by_role("button", name="保存并进入拓客台").click()
                    page_title(page, "待审核").wait_for(timeout=30_000)

                    nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                    assert sorted(resource_keys(nodes)) == ["app-root", "companies", "leads", "profile"]
                    profile_base = find_resource(nodes, "profile")["baseId"]
                    companies_base = find_resource(nodes, "companies")["baseId"]
                    leads_base = find_resource(nodes, "leads")["baseId"]
                    profile = records_of(busabase_url, profile_base)
                    assert len(profile) == 1
                    assert profile[0]["offer-name"] == "AI 客服质检"
                    assert profile[0]["onboarding-version"] == 1
                    assert not unexpected_errors(errors), errors
                    context.close()

                findings_path = Path(data_dir) / "findings.json"
                findings_path.write_text(json.dumps(FINDINGS), encoding="utf-8")
                dry = run_script(["scripts/import_leads.mjs", str(findings_path)], busabase_url)
                assert dry.returncode == 0, dry.stderr
                assert records_of(busabase_url, companies_base) == []
                applied = run_script(["scripts/import_leads.mjs", str(findings_path), "--apply"], busabase_url)
                assert applied.returncode == 0, applied.stderr
                assert len(records_of(busabase_url, companies_base)) == 2
                assert len(records_of(busabase_url, leads_base)) == 1
                again = run_script(["scripts/import_leads.mjs", str(findings_path), "--apply"], busabase_url)
                assert again.returncode == 0
                assert len(records_of(busabase_url, companies_base)) == 2

                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    page.goto(f"{app_url}/#/to-send")
                    page.wait_for_load_state("networkidle")
                    assert rows(page).count() == 2
                    assert page.locator(".row-warn", has_text="未找到邮箱").is_visible()
                    rows(page).first.click()
                    page.locator(".detail-panel h2", has_text="秒购电商").wait_for()
                    page.locator(".detail-panel [data-approve]").click()
                    page.locator(".toast").wait_for(state="visible")
                    approved = [row for row in records_of(busabase_url, companies_base) if row["key"] == "miaogou"][0]
                    assert approved["status"] == "queued"
                    assert approved["sent-to"] == "service-ops@miaogou.example.com"
                    context.close()

                send_dry = run_script(["scripts/send_emails.mjs"], busabase_url)
                assert send_dry.returncode == 0, send_dry.stderr
                assert "待发出 1 封" in send_dry.stdout
                assert "销售资料 无附件" in send_dry.stdout


def main() -> None:
    app_port = free_port()
    app_url = f"http://127.0.0.1:{app_port}"
    with managed_process(
        ["node", "server.js"], APP_ROOT, {"PORT": str(app_port)}, f"{app_url}/health"
    ):
        with sync_playwright() as playwright:
            browser = launch_chromium(playwright)
            test_demo_ui(browser, app_url)
            test_busabase_round_trip(browser)
            browser.close()
    print("PASS kelly-sales-outreach Demo, responsive, and OSS Busabase acceptance")


if __name__ == "__main__":
    main()
