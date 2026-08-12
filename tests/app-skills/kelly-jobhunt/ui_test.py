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


SKILL_ROOT = REPO_ROOT / "skills" / "kelly-jobhunt"
APP_ROOT = SKILL_ROOT / "app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-jobhunt"
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


def unexpected_errors(errors: list[str]) -> list[str]:
    # resource-provisioning re-reads a just-submitted node tree while the
    # ChangeRequest merges; Chromium logs each transient 404 in that window as a
    # console error even though the app retries and recovers.
    return [e for e in errors if "Failed to load resource: the server responded with a status of 404" not in e]


# Several labels ("待发送", "已发送", "全部") appear in the sidebar, the page
# heading, and row badges at once, so every locator here is scoped by a data
# attribute or a container rather than by bare text.
def nav(page: Page, view: str):
    return page.locator(f'.filters button[data-view="{view}"]')


def rows(page: Page):
    return page.locator(".work-list [data-select-id]")


def page_title(page: Page, name: str):
    # The view name renders in the workspace <h1>, in the mobile top bar, and
    # sometimes again as the detail <h2>. Scope to the page heading.
    return page.locator(".workspace-head h1", has_text=name)


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1280, "height": 820})
    page = desktop.new_page()
    errors = attach_error_capture(page)
    page.goto(f"{base_url}/?demo=1#/to-send")
    page.wait_for_load_state("networkidle")

    assert page_title(page, "待发送").is_visible()
    assert page.locator(".snapshot-badge", has_text="DEMO").is_visible()
    assert rows(page).count() == 6
    assert page.locator(".human-work-primary", has_text="待你确认发送").is_visible()
    assert_no_horizontal_overflow(page)

    # The first row is selected by default and opens the compose pane.
    detail = page.locator(".detail-panel")
    assert detail.locator("h2", has_text="蓝汐科技").is_visible()
    assert detail.locator("[data-subject]").input_value().startswith("应聘")
    assert "陈默" in detail.locator("[data-body]").input_value()
    assert detail.locator("[data-lead] option").count() == 3
    assert detail.locator("[data-approve]").is_enabled()
    assert detail.locator(".attachment-line strong").inner_text().endswith(".pdf")

    # One company, one email: extra addresses stay visible as a pool.
    assert detail.locator(".lead-table .lead-row").count() == 3

    # A company with no published address cannot be approved.
    page.locator('[data-select-id="company-maimang"]').click()
    detail.locator("[data-approve]").wait_for(state="visible")
    assert detail.locator("[data-approve]").is_disabled()
    assert detail.locator("[data-lead]").is_disabled()
    assert page.locator(".detail-note.warn").is_visible()
    assert detail.locator('.command-chip[data-copy-command="/kelly-jobhunt research"]').is_visible()

    # An already-approved company is read-only, not editable.
    nav(page, "sent").click()
    page_title(page, "已发送").wait_for()
    page.locator('[data-select-id="company-chaoxi"]').click()
    detail.locator("h2", has_text="潮汐云").wait_for()
    assert detail.locator("[data-subject]").count() == 0
    assert detail.locator("[data-approve]").count() == 0
    assert detail.locator(".status-pill", has_text="排队中").is_visible()
    # Approved is not sent: the row says what actually sends it.
    assert detail.locator('.command-chip[data-copy-command="node scripts/send_emails.mjs"]').is_visible()

    nav(page, "profile").click()
    page_title(page, "我的资料").wait_for()
    assert page.locator('[data-profile="targetRole"]').input_value() == "B 端产品经理"
    assert page.locator(".status-pill", has_text="已就绪").is_visible()
    # Every screen names the command that maintains it.
    assert page.locator('.command-chip[data-copy-command="/kelly-jobhunt profile"]').is_visible()

    page.locator("[data-open-help]").first.click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible")
    # Help opens on the command list: the desk's whole job is telling you what to
    # run next, so that is what a confused operator should land on.
    assert dialog.get_by_role("heading", name="回到对话框能做什么").is_visible()
    assert dialog.locator(".command-list .command-chip").count() == 5
    dialog.get_by_role("button", name="资源", exact=True).click()
    page.get_by_role("heading", name="Busabase 资源").wait_for(state="visible")
    page.keyboard.press("Escape")
    page.locator("#helpModal").wait_for(state="detached")

    # Refresh and browser history restore the same view.
    nav(page, "to-send").click()
    page_title(page, "待发送").wait_for()
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page_title(page, "待发送").is_visible()
    page.go_back()
    page_title(page, "我的资料").wait_for()

    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        mobile = browser.new_context(viewport={"width": width, "height": height})
        page = mobile.new_page()
        errors = attach_error_capture(page)
        page.goto(f"{base_url}/?demo=1#/to-send")
        page.wait_for_load_state("networkidle")
        assert_no_horizontal_overflow(page)

        # The sidebar is a drawer here, so the next command is repeated in the
        # shell itself — otherwise a phone operator never sees it.
        assert page.locator(".mobile-next-step .command-chip").is_visible()

        page.locator("[data-mobile-sidebar]").click()
        assert page.locator("body.sidebar-open").count() == 1
        assert page.locator("#sidebarScrim").is_visible()
        page.locator("#sidebarScrim").click(position={"x": width - 5, "y": 5})
        assert page.locator("body.sidebar-open").count() == 0

        rows(page).first.click()
        assert page.locator("body.mobile-detail-open").count() == 1
        detail = page.locator(".detail-panel")
        detail.locator("[data-body]").wait_for(state="visible")
        # The one action the operator came for stays reachable without scrolling.
        assert detail.locator("[data-approve]").is_visible()
        assert_no_horizontal_overflow(page)

        page.locator("[data-back-to-list]").click()
        assert page.locator("body.mobile-detail-open").count() == 0
        assert page.locator(".work-list").is_visible()
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


def records_of(busabase_url: str, base_id: str) -> list[dict]:
    payload = read_json(f"{busabase_url}/api/v1/records?baseId={base_id}&limit=100")
    items = payload if isinstance(payload, list) else payload.get("records", [])
    return [(item.get("headCommit") or {}).get("fields") or item.get("fields") or {} for item in items]


def run_script(args: list[str], busabase_url: str) -> subprocess.CompletedProcess:
    # Resolve node from the caller's PATH: a bare "node" on a hand-written PATH
    # can land on a much older system build than the one the repo runs on.
    node = shutil.which("node") or "node"
    return subprocess.run(
        [node, *args],
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
            "key": "lanxi-tech",
            "name": "蓝汐科技",
            "website": "lanxi-tech.example.com",
            "sourceUrl": "https://lanxi-tech.example.com/careers",
            "industry": "企业协作 SaaS",
            "matchScore": 92,
            "matchReason": "招聘页写明有审批流经验优先。",
            "evidenceType": "official-site",
            "evidenceDate": "2026-08-11",
            "emailSubject": "应聘 B 端产品经理 — 陈默",
            "emailBody": "您好，\n\n我是陈默……",
        },
        {
            "key": "maimang-retail",
            "name": "麦芒零售",
            "website": "maimang-retail.example.com",
            "sourceUrl": "https://example-jobs.com/maimang",
            "industry": "零售数字化",
            "matchScore": 66,
            "matchReason": "官网与招聘页均未公开任何邮箱。",
            "evidenceType": "aggregator",
            "evidenceDate": "2026-06-20",
            "emailSubject": "应聘产品经理 — 陈默",
            "emailBody": "您好，\n\n我是陈默……",
        },
    ],
    "leads": [
        {
            "companyKey": "lanxi-tech",
            "email": "hr@lanxi-tech.example.com",
            "role": "HR 邮箱",
            "sourceUrl": "https://lanxi-tech.example.com/careers",
            "confidence": "high",
        },
        {
            "companyKey": "lanxi-tech",
            "email": "jobs@lanxi-tech.example.com",
            "role": "招聘通用",
            "sourceUrl": "https://lanxi-tech.example.com/contact",
            "confidence": "medium",
        },
    ],
}


def test_busabase_round_trip(browser) -> None:
    for stale in (SKILL_ROOT / "resume").glob("*"):
        if stale.name != ".gitkeep":
            stale.unlink()
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-jobhunt-busabase-") as data_dir:
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
            with tempfile.TemporaryDirectory(prefix="kelly-jobhunt-home-") as app_home:
                app_env = {
                    "BUSABASE_BASE_URL": busabase_url,
                    "BUSABASE_SPACE_ID": "local",
                    "HOME": app_home,
                    "PORT": str(app_port),
                }
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health") as (_, app_logs):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)

                    # Nothing exists yet, and the setup script says exactly that
                    # rather than creating anything on a dry run.
                    setup_dry = run_script(["scripts/setup.mjs"], busabase_url)
                    assert setup_dry.returncode == 0, setup_dry.stderr
                    for slug in ("jobhunt-profile-v1", "jobhunt-companies-v1", "jobhunt-leads-v1"):
                        assert slug in setup_dry.stdout, setup_dry.stdout
                    assert "缺失" in setup_dry.stdout, setup_dry.stdout
                    assert resource_keys(read_json(f"{busabase_url}/api/v1/nodes?depth=2")) == [], "a dry run must not write"

                    page.goto(f"{app_url}/#/to-send")
                    page.wait_for_load_state("networkidle")
                    assert page.get_by_role("heading", name="初始化 Busabase 工作区").is_visible()
                    # A deployed AirApp uses its ambient session; the local OAuth
                    # gate must not appear when BUSABASE_BASE_URL is set.
                    assert page.get_by_role("heading", name="连接 Busabase").count() == 0

                    page.get_by_role("button", name="初始化工作区").click()
                    try:
                        page.locator("[data-provision]").wait_for(state="detached", timeout=30_000)
                        page_title(page, "待发送").wait_for(timeout=30_000)
                    except Exception:
                        nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                        raise AssertionError(
                            "Lazy provisioning did not become ready.\n"
                            f"Page: {page.locator('body').inner_text()}\n"
                            f"Nodes: {json.dumps(nodes, ensure_ascii=False)}\n"
                            f"App logs: {''.join(app_logs[-100:])}\n"
                            f"Busabase logs: {''.join(busabase_logs[-100:])}"
                        )
                    assert rows(page).count() == 0

                    nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
                    assert sorted(resource_keys(nodes)) == ["app-root", "companies", "leads", "profile"], nodes

                    # Re-running setup over a workspace the app just built must
                    # adopt it, not build a second one beside it.
                    nodes_before = json.dumps(nodes, sort_keys=True)
                    setup_again = run_script(["scripts/setup.mjs", "--apply"], busabase_url)
                    assert setup_again.returncode == 0, setup_again.stderr
                    assert "已经就绪" in setup_again.stdout, setup_again.stdout
                    assert "缺失" not in setup_again.stdout, setup_again.stdout
                    after = json.dumps(read_json(f"{busabase_url}/api/v1/nodes?depth=2"), sort_keys=True)
                    assert after == nodes_before, setup_again.stdout
                    profile_base = find_resource(nodes, "profile")["baseId"]
                    companies_base = find_resource(nodes, "companies")["baseId"]
                    leads_base = find_resource(nodes, "leads")["baseId"]

                    # Create the profile through the app (bases.createChangeRequest).
                    nav(page, "profile").click()
                    page_title(page, "我的资料").wait_for()
                    for key, value in (
                        ("name", "陈默"),
                        ("targetRole", "B 端产品经理"),
                        ("locations", "杭州"),
                        ("highlights", "五年 B 端产品经验。"),
                        ("jobBoards", "BOSS 直聘、公司官网招聘页"),
                        ("resumeFile", "chenmo.pdf"),
                        ("fromEmail", "chenmo@example.com"),
                    ):
                        page.locator(f'[data-profile="{key}"]').fill(value)
                    page.locator("[data-save-profile]").click()
                    page.locator(".toast").wait_for(state="visible")

                    profile_rows = records_of(busabase_url, profile_base)
                    assert len(profile_rows) == 1, profile_rows
                    assert profile_rows[0]["target-role"] == "B 端产品经理", profile_rows
                    assert profile_rows[0]["from-email"] == "chenmo@example.com", profile_rows
                    assert profile_rows[0]["job-boards"] == "BOSS 直聘、公司官网招聘页", profile_rows

                    # Editing again must update the same row (records.changeRequest).
                    page.reload()
                    page.wait_for_load_state("networkidle")
                    page.locator('[data-profile="locations"]').fill("杭州 / 上海")
                    page.locator("[data-save-profile]").click()
                    page.locator(".toast").wait_for(state="visible")
                    profile_rows = records_of(busabase_url, profile_base)
                    assert len(profile_rows) == 1, profile_rows
                    assert profile_rows[0]["locations"] == "杭州 / 上海", profile_rows

                    context.close()

                # The agent-side import is a trusted script, never a browser action.
                findings_path = Path(data_dir) / "findings.json"
                findings_path.write_text(json.dumps(FINDINGS), encoding="utf-8")

                dry = run_script(["scripts/import_leads.mjs", str(findings_path)], busabase_url)
                assert dry.returncode == 0, dry.stderr
                assert records_of(busabase_url, companies_base) == [], "a dry run must not write"

                applied = run_script(["scripts/import_leads.mjs", str(findings_path), "--apply"], busabase_url)
                assert applied.returncode == 0, applied.stderr
                assert len(records_of(busabase_url, companies_base)) == 2, applied.stdout
                assert len(records_of(busabase_url, leads_base)) == 2, applied.stdout

                # Re-running a widened search must not duplicate or reset anything.
                again = run_script(["scripts/import_leads.mjs", str(findings_path), "--apply"], busabase_url)
                assert again.returncode == 0, again.stderr
                assert len(records_of(busabase_url, companies_base)) == 2, again.stdout

                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                app_env["PORT"] = str(app_port)
                with managed_process(["node", "server.js"], APP_ROOT, app_env, f"{app_url}/health"):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/to-send")
                    page.wait_for_load_state("networkidle")

                    # A fresh process discovers the existing resources with no setup action.
                    assert page.get_by_role("button", name="初始化工作区").count() == 0
                    assert rows(page).count() == 2
                    assert page.locator('[data-select-id] .lead-count', has_text="2 个邮箱").is_visible()
                    assert page.locator(".row-warn", has_text="未找到邮箱").is_visible()

                    page.locator(".work-list [data-select-id]").first.click()
                    detail = page.locator(".detail-panel")
                    detail.locator("[data-approve]").wait_for(state="visible")
                    assert detail.locator("[data-lead] option").count() == 2
                    detail.locator("[data-approve]").click()
                    page.locator(".toast").wait_for(state="visible")

                    approved = [row for row in records_of(busabase_url, companies_base) if row["key"] == "lanxi-tech"][0]
                    assert approved["status"] == "queued", approved
                    # The highest-confidence address wins by default.
                    assert approved["sent-to"] == "hr@lanxi-tech.example.com", approved
                    assert approved["approved-at"], approved

                    blocked = [row for row in records_of(busabase_url, companies_base) if row["key"] == "maimang-retail"][0]
                    assert blocked["status"] == "draft", blocked

                    assert not unexpected_errors(errors), errors
                    context.close()

                # The sender lists exactly what the operator approved, and a dry
                # run works even before the resume PDF is in place.
                send_dry = run_script(["scripts/send_emails.mjs"], busabase_url)
                assert send_dry.returncode == 0, send_dry.stderr
                assert "待发出 1 封" in send_dry.stdout, send_dry.stdout
                assert "chenmo@example.com" in send_dry.stdout, send_dry.stdout
                assert "chenmo.pdf" in send_dry.stdout, send_dry.stdout

                # `/kelly-jobhunt profile` ends by typesetting a PDF resume.
                resume_dry = run_script(["scripts/build_resume.mjs"], busabase_url)
                assert resume_dry.returncode == 0, resume_dry.stderr
                assert "HTML 预览已写入" in resume_dry.stdout, resume_dry.stdout
                assert not list((SKILL_ROOT / "resume").glob("*.pdf")), "a dry run must not write a PDF"

                resume_apply = run_script(["scripts/build_resume.mjs", "--apply"], busabase_url)
                assert resume_apply.returncode == 0, resume_apply.stderr
                pdfs = list((SKILL_ROOT / "resume").glob("*.pdf"))
                assert len(pdfs) == 1, [p.name for p in pdfs]
                assert pdfs[0].read_bytes().startswith(b"%PDF-"), "output must be a real PDF"
                assert pdfs[0].stat().st_size > 5_000, pdfs[0].stat().st_size
                # The generated file name is recorded back on the profile.
                assert records_of(busabase_url, profile_base)[0]["resume-file"] == pdfs[0].name

                # No SMTP anywhere yet: the dry run names each missing item
                # rather than collapsing four different causes into "未配置".
                assert "SMTP 就绪状态" in send_dry.stdout, send_dry.stdout
                for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"):
                    assert f"{key} 缺失" in " ".join(send_dry.stdout.split()), send_dry.stdout
                # This instance HAS a Vault, so the fix is to write to it — the
                # "start a new Session" advice belongs to Cloud only.
                assert "configure_smtp" in send_dry.stdout, send_dry.stdout
                assert "没有 Vault" not in send_dry.stdout, send_dry.stdout

                # Applying without credentials stops cleanly instead of crashing.
                send_apply = run_script(["scripts/send_emails.mjs", "--apply"], busabase_url)
                assert send_apply.returncode == 1, send_apply.stdout
                assert "SMTP" in send_apply.stderr, send_apply.stderr
                assert "Error:" not in send_apply.stderr, send_apply.stderr

                # Configure SMTP through the trusted script; values land in the
                # Vault and only the reference names land on the profile.
                smtp_dry = run_script(
                    ["scripts/configure_smtp.mjs", "--host", "smtp.example.com", "--user", "chenmo@example.com", "--pass", "app-password"],
                    busabase_url,
                )
                assert smtp_dry.returncode == 0, smtp_dry.stderr
                assert "app-password" not in smtp_dry.stdout, "the password must never be printed"
                assert read_json(f"{busabase_url}/api/v1/vault")["items"] == [], "a dry run must not write"

                smtp_apply = run_script(
                    ["scripts/configure_smtp.mjs", "--host", "smtp.example.com", "--user", "chenmo@example.com", "--pass", "app-password", "--apply"],
                    busabase_url,
                )
                assert smtp_apply.returncode == 0, smtp_apply.stderr
                vault_items = {item["key"]: item for item in read_json(f"{busabase_url}/api/v1/vault")["items"]}
                assert sorted(vault_items) == ["SMTP_HOST", "SMTP_PASS", "SMTP_PORT", "SMTP_USER"], vault_items
                assert vault_items["SMTP_PASS"]["kind"] == "secret", vault_items["SMTP_PASS"]
                assert vault_items["SMTP_PASS"]["access"]["reveal"] is False, vault_items["SMTP_PASS"]

                profile_rows = records_of(busabase_url, profile_base)
                assert profile_rows[0]["smtp-vault-key"] == "SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS", profile_rows
                assert "app-password" not in json.dumps(profile_rows, ensure_ascii=False), "no Base may hold the value"

                # A second write must merge, not replace the whole Vault.
                again = run_script(
                    ["scripts/configure_smtp.mjs", "--host", "smtp2.example.com", "--user", "chenmo@example.com", "--pass", "app-password", "--apply"],
                    busabase_url,
                )
                assert again.returncode == 0, again.stderr
                vault_items = {item["key"]: item["value"] for item in read_json(f"{busabase_url}/api/v1/vault")["items"]}
                assert len(vault_items) == 4, vault_items
                assert vault_items["SMTP_HOST"] == "smtp2.example.com", vault_items

                # Now every item resolves, and the dry run says where from —
                # without echoing a single value back.
                ready_dry = run_script(["scripts/send_emails.mjs"], busabase_url)
                assert ready_dry.returncode == 0, ready_dry.stderr
                collapsed = " ".join(ready_dry.stdout.split())
                for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"):
                    assert f"{key} 就绪 · Vault" in collapsed, ready_dry.stdout
                assert "app-password" not in ready_dry.stdout, "the password must never be printed"
                assert "smtp2.example.com" not in ready_dry.stdout, ready_dry.stdout

                # A test send routes the letter elsewhere and leaves the research
                # alone: no contact row rewritten, nothing marked sent. The
                # fixture host does not resolve, so this exercises the failure
                # path too — which must still write nothing.
                companies_before = json.dumps(records_of(busabase_url, companies_base), sort_keys=True, ensure_ascii=False)
                test_dry = run_script(["scripts/send_emails.mjs", "--test-to", "inbox@example.com"], busabase_url)
                assert test_dry.returncode == 0, test_dry.stderr
                assert "测试发送模式" in test_dry.stdout, test_dry.stdout
                assert "inbox@example.com（原本 hr@lanxi-tech.example.com）" in test_dry.stdout, test_dry.stdout

                test_apply = run_script(
                    ["scripts/send_emails.mjs", "--test-to", "inbox@example.com", "--apply"], busabase_url
                )
                assert test_apply.returncode == 1, test_apply.stdout
                after_test = json.dumps(records_of(busabase_url, companies_base), sort_keys=True, ensure_ascii=False)
                assert after_test == companies_before, "a test send must not touch Busabase"

                # A malformed --test-to stops before anything is read or sent.
                bad = run_script(["scripts/send_emails.mjs", "--test-to", "not-an-address", "--apply"], busabase_url)
                assert bad.returncode == 1, bad.stdout
                assert "--test-to" in bad.stderr, bad.stderr

                # With credentials and attachment in place it really tries to send.
                # The fixture host does not resolve, which is the interesting
                # case: the failure is reported per company, and the row must
                # stay queued so another address can be tried.
                send_apply = run_script(["scripts/send_emails.mjs", "--apply"], busabase_url)
                assert send_apply.returncode == 1, send_apply.stdout
                assert "✗ 蓝汐科技" in send_apply.stderr, send_apply.stderr
                assert "已发出 0 封，失败 1 封" in send_apply.stdout, send_apply.stdout
                assert "Error:" not in send_apply.stderr, send_apply.stderr
                still_queued = [row for row in records_of(busabase_url, companies_base) if row["key"] == "lanxi-tech"][0]
                assert still_queued["status"] == "queued", still_queued
                assert not still_queued.get("sent-at"), still_queued

            change_requests = read_json(f"{busabase_url}/api/v1/change-requests")["changeRequests"]
            structure_requests = [
                item for item in change_requests if (item.get("sourceMeta") or {}).get("subject") == "node_tree"
            ]
            assert len(structure_requests) == 1, change_requests

        # The local PGlite data must survive a complete Busabase restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert sorted(resource_keys(nodes)) == ["app-root", "companies", "leads", "profile"], nodes
            companies = records_of(busabase_url, find_resource(nodes, "companies")["baseId"])
            assert any(row["key"] == "lanxi-tech" and row["status"] == "queued" for row in companies), companies


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-jobhunt-home-") as app_home:
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
                    test_busabase_round_trip(browser)
                    print("PASS OSS - provisioning, profile writes, lead import, approval, and send plan")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
