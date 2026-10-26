"""Headless synthetic UI acceptance; --capture-assets additionally needs Pillow/ffmpeg."""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))
from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-security"
APP_ROOT = SKILL_ROOT / "content" / "kelly-security-app"
SCREENSHOTS = SKILL_ROOT / "assets" / "screenshots"
RECORDINGS = SKILL_ROOT / "assets" / "recordings"
VIEWPORTS = ((1280, 820), (1280, 720), (390, 844), (360, 740))


def assert_no_overflow(page: Page) -> None:
    dimensions = page.evaluate(
        """() => ({ width: document.documentElement.scrollWidth,
            viewport: window.innerWidth, height: document.documentElement.scrollHeight,
            viewportHeight: window.innerHeight })"""
    )
    assert dimensions["width"] <= dimensions["viewport"] + 1, dimensions
    assert dimensions["height"] <= dimensions["viewportHeight"] + 1, dimensions
    assert not re.search(r"\b(?:rec|bse|bsf|nod|cmt|crq)[a-z0-9]{10,}\b", page.locator("body").inner_text()), "An unresolved resource identifier reached the user-facing text"


def capture_errors(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
    return errors


def screenshot(page: Page, name: str, capture: bool) -> None:
    if not capture:
        return
    from PIL import Image

    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(page.screenshot(animations="disabled"))) as image:
        image.convert("RGB").save(SCREENSHOTS / f"{name}.webp", quality=87, method=6)


def open_demo(page: Page, base_url: str, view: str = "overview") -> None:
    page.goto(f"{base_url}/?demo=1#/{view}")
    page.wait_for_load_state("networkidle")
    expect(page.locator("#demoBanner")).to_be_visible()
    expect(page.locator("#content .empty-state h1")).to_have_count(0)


def navigate(page: Page, view: str) -> None:
    if page.locator(".mobile-topbar").is_visible() and not page.locator("body.sidebar-open").count():
        page.get_by_role("button", name="打开导航", exact=True).click()
    page.locator(f'[data-nav="{view}"]').click()
    expect(page.locator(f'[data-nav="{view}"]')).to_have_class("active")
    if page.locator(".mobile-topbar").is_visible():
        expect(page.locator("body.sidebar-open")).to_have_count(0)


def open_settings(page: Page) -> None:
    page.locator(".mobile-topbar a" if page.locator(".mobile-topbar").is_visible() else ".settings-link").click()
    expect(page.locator("#actionDialog")).to_be_visible()
    expect(page.locator("#dialogTitle")).to_have_text("帮助与设置")


def set_family(page: Page, family: str) -> None:
    open_settings(page)
    page.get_by_role("tab", name="外观", exact=True).click()
    expect(page.locator('#actionDialog [data-panel="style"]')).to_be_visible()
    expect(page.locator('#actionDialog input[name="editorialFamily"]')).to_have_count(7)
    page.locator(f'#actionDialog label:has(input[name="editorialFamily"][value="{family}"])').click()
    expect(page.locator("html")).to_have_attribute("data-theme", family)
    page.keyboard.press("Escape")
    expect(page.locator("#actionDialog")).not_to_be_visible()


def desktop_flow(browser, base_url: str, capture: bool) -> dict:
    context = browser.new_context(viewport={"width": 1280, "height": 820}, locale="zh-CN", color_scheme="light")
    page = context.new_page()
    errors = capture_errors(page)
    try:
        open_demo(page, base_url)
        expect(page.locator(".matrix tbody tr")).to_have_count(3)
        expect(page.locator(".matrix-cell")).to_have_count(36)
        expect(page.locator(".host-row")).to_have_count(3)
        expect(page.locator("#attentionCount")).to_have_text("2")
        assert_no_overflow(page)
        screenshot(page, "overview-zh-CN", capture)

        page.get_by_role("button", name="收起侧栏", exact=True).click()
        expect(page.locator("body.sidebar-collapsed")).to_have_count(1)
        expect(page.locator(".brand-icon")).to_be_visible()
        assert_no_overflow(page)
        page.get_by_role("button", name="收起侧栏", exact=True).click()
        expect(page.locator("body.sidebar-collapsed")).to_have_count(0)

        navigate(page, "checklist")
        expect(page.locator(".check-row")).to_have_count(12)
        page.locator(".check-row").filter(has_text="systemd 服务").click()
        expect(page.locator(".detail-panel h2")).to_have_text("systemd 服务与定时器")
        expect(page.locator(".detail-panel .evidence-card")).to_have_count(1)
        deep_link = page.url
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.locator(".detail-panel h2")).to_have_text("systemd 服务与定时器")
        assert page.url == deep_link
        assert_no_overflow(page)
        screenshot(page, "checklist-zh-CN", capture)

        navigate(page, "timeline")
        expect(page.locator(".timeline-row")).to_have_count(4)
        page.go_back()
        expect(page.locator(".detail-panel h2")).to_have_text("systemd 服务与定时器")

        # A per-task picker must not misattribute another host's findings or evidence.
        options = page.locator("#runSelect option").evaluate_all(
            "nodes => nodes.map(node => ({value: node.value, label: node.textContent}))"
        )
        api_run = next(option["value"] for option in options if "Tokyo" in option["label"])
        web_run = next(option["value"] for option in options if "Singapore" in option["label"])
        page.locator("#runSelect").select_option(api_run)
        expect(page.locator(".check-row").filter(has_text="SSH 登录")).to_contain_text("无权限")
        navigate(page, "findings")
        expect(page.locator("#runSelect")).to_have_value(api_run)
        expect(page.locator(".finding-row")).to_have_count(0)
        navigate(page, "timeline")
        expect(page.locator(".timeline-row")).to_have_count(0)

        page.locator("#runSelect").select_option(web_run)
        expect(page.locator(".timeline-row")).to_have_count(4)
        navigate(page, "findings")
        expect(page.locator(".finding-row")).to_have_count(2)
        screenshot(page, "findings-zh-CN", capture)
        page.get_by_role("button", name="已解释为正常", exact=True).click()
        expect(page.locator("#reviewNote")).to_have_value("")
        expect(page.locator("#attentionCount")).to_have_text("2")
        page.locator("#reviewNote").fill("已核对发布审批及业务负责人记录：这是授权的临时诊断服务，保留原始线索供复查。")
        page.get_by_role("button", name="已解释为正常", exact=True).click()
        expect(page.locator(".finding-row").first).to_contain_text("已解释为正常")
        expect(page.locator("#attentionCount")).to_have_text("1")
        expect(page.locator("#notice")).to_contain_text("演示")
        screenshot(page, "reviewed-finding-zh-CN", capture)

        open_settings(page)
        for tab in ("操作指南", "外观", "核查配置"):
            page.get_by_role("tab", name=tab, exact=True).click()
            assert_no_overflow(page)
        expect(page.locator('#settingsForm input[name="operator"]')).to_have_value("值班响应人")
        page.keyboard.press("Escape")
        expect(page.locator("#actionDialog")).not_to_be_visible()
        set_family(page, "ink-paper")
        navigate(page, "checklist")
        page.locator(".check-row").filter(has_text="SSH 登录").click()
        expect(page.locator(".detail-panel h2")).to_have_text("SSH 登录与认证")
        screenshot(page, "checklist-ink-paper-zh-CN", capture)

        # Multi-host requests stay queued for the local Agent; the browser runs no SSH.
        navigate(page, "hosts")
        page.locator('input[data-host]').nth(0).check()
        page.locator('input[data-host]').nth(1).check()
        page.get_by_role("button", name="检查选中服务器", exact=False).click()
        expect(page.locator("#requestForm")).to_be_visible()
        expect(page.locator('#requestForm input[name="hosts"]:checked')).to_have_count(2)
        page.get_by_role("button", name="模拟创建检查请求", exact=True).click()
        expect(page.locator("#actionDialog")).not_to_be_visible()
        navigate(page, "runs")
        expect(page.locator(".record-table tbody tr")).to_have_count(5)
        expect(page.locator(".record-table tbody tr").filter(has_text="等待本机 Agent")).to_have_count(3)
        page.get_by_role("button", name="停止后续检查", exact=True).first.click()
        expect(page.locator("#cancelForm")).to_be_visible()
        page.locator("#cancelForm").get_by_role("button", name="停止后续检查", exact=True).click()
        expect(page.locator(".record-table tbody tr").filter(has_text="已取消")).to_have_count(1)
        assert_no_overflow(page)
        assert not errors, errors
        return {"suite": "desktop workflow", "status": "pass", "errors": errors}
    finally:
        context.close()


def responsive_flow(browser, base_url: str, capture: bool) -> list[dict]:
    results = []
    for width, height in VIEWPORTS:
        context = browser.new_context(viewport={"width": width, "height": height}, locale="zh-CN", color_scheme="dark")
        page = context.new_page()
        errors = capture_errors(page)
        try:
            open_demo(page, base_url)
            assert_no_overflow(page)
            if width == 1280 and height == 720:
                screenshot(page, "overview-dark-zh-CN", capture)
            if width <= 720:
                page.get_by_role("button", name="打开导航", exact=True).click()
                expect(page.locator("body.sidebar-open")).to_have_count(1)
                expect(page.locator(".sidebar-scrim")).to_be_visible()
                page.locator(".sidebar-scrim").click(position={"x": width - 5, "y": 10})
                expect(page.locator("body.sidebar-open")).to_have_count(0)
            navigate(page, "checklist")
            expect(page.locator(".check-row")).to_have_count(12)
            page.locator(".check-row").filter(has_text="SSH 登录").click()
            expect(page.locator(".detail-panel")).to_be_visible()
            expect(page.locator(".detail-panel h2")).to_have_text("SSH 登录与认证")
            assert_no_overflow(page)
            if width <= 720:
                expect(page.locator(".list-panel")).not_to_be_visible()
                if width == 390:
                    screenshot(page, "checklist-mobile-zh-CN", capture)
                page.locator(".back-to-list").click()
                expect(page.locator(".list-panel")).to_be_visible()
                page.go_back()
                expect(page.locator(".detail-panel")).to_be_visible()
                page.go_forward()
                expect(page.locator(".list-panel")).to_be_visible()

            navigate(page, "findings")
            page.locator(".finding-row").first.click()
            expect(page.locator("#reviewNote")).to_be_visible()
            assert_no_overflow(page)
            if width <= 720:
                expect(page.locator(".detail-actions-top")).to_be_in_viewport(ratio=1)
            if width == 360:
                screenshot(page, "findings-mobile-zh-CN", capture)
            if width <= 720:
                page.locator("#reviewNote").click()
                page.locator("#reviewNote").fill("已核对业务负责人及发布审批：这是授权的诊断服务，保留原始证据供复查。")
                page.get_by_role("button", name="已解释为正常", exact=True).click()
                expect(page.locator(".detail-panel .pill").filter(has_text="已解释为正常")).to_be_visible()
                if width == 360:
                    screenshot(page, "reviewed-findings-mobile-zh-CN", capture)
            open_settings(page)
            for tab in ("操作指南", "外观", "核查配置"):
                page.get_by_role("tab", name=tab, exact=True).click()
                assert_no_overflow(page)
                panel = page.locator("#actionDialog [data-panel]:visible")
                assert panel.evaluate("element => element.scrollWidth <= element.clientWidth + 1")
            expect(page.get_by_role("button", name="关闭", exact=True)).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.locator("#actionDialog")).not_to_be_visible()
            set_family(page, "ink-paper")
            assert_no_overflow(page)
            assert not errors, errors
            results.append({"suite": f"{width}x{height} dark and alternate family", "status": "pass"})
        finally:
            context.close()
    return results


def production_failure(browser, base_url: str) -> dict:
    context = browser.new_context(viewport={"width": 1280, "height": 820}, locale="zh-CN")
    page = context.new_page()
    requests = []
    page.on("request", lambda request: requests.append(request.url))
    # Prove failure behavior without contacting a real Busabase/Cloud connection.
    page.route("**/__airapp/runtime", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"runtime": "local", "hosted": True, "devProxy": False})))
    page.route("**/api/v1/**", lambda route: route.fulfill(status=503, content_type="application/json", body=json.dumps({"message": "synthetic unavailable data service"})))
    try:
        page.goto(base_url)
        page.wait_for_load_state("networkidle")
        expect(page.locator("#demoBanner")).not_to_be_visible()
        expect(page.locator("#content")).to_contain_text("工作台暂时无法读取数据")
        assert page.locator(".matrix").count() == 0
        assert not any("demo-provider.js" in request for request in requests), requests
        assert not any("/auth/" in request for request in requests), requests
        assert all(request.startswith(base_url) for request in requests), requests
        return {"suite": "production provider failure has no silent Demo fallback", "status": "pass"}
    finally:
        context.close()


def pagination_flow(browser, base_url: str) -> dict:
    context = browser.new_context(viewport={"width": 1280, "height": 820}, locale="zh-CN")
    page = context.new_page()
    errors = capture_errors(page)
    original = (APP_ROOT / "app" / "js" / "providers" / "demo-provider.js").read_text()
    fixture = (Path(__file__).parent / "fixtures" / "pagination-demo.js").read_text()
    page.route("**/js/providers/demo-provider.js", lambda route: route.fulfill(status=200, content_type="text/javascript", body=original + "\n" + fixture))
    try:
        open_demo(page, base_url, "checklist")
        options = page.locator("#runSelect option").evaluate_all(
            "nodes => nodes.map(node => ({value: node.value, label: node.textContent}))"
        )
        last_run = next(option["value"] for option in options if "Lab fleet 6" in option["label"])
        page.locator("#runSelect").select_option(last_run)
        expect(page.locator("#runSelect")).to_have_value(last_run)
        expect(page.locator(".check-row")).to_have_count(12)
        more = page.locator('[data-more="checks"]')
        if more.count():
            before = page.evaluate("globalThis.__kellyDemoReads.length")
            more.click()
            expect(page.locator(".check-row").filter(has_text="采集完成")).to_have_count(12)
            new_reads = page.evaluate("index => globalThis.__kellyDemoReads.slice(index)", before)
            check_reads = [read for read in new_reads if read["key"] == "checks"]
            assert len(check_reads) == 1 and check_reads[0]["cursor"] is not None, check_reads
        else:
            # A provider that genuinely reads only the selected run needs no second page.
            expect(page.locator(".check-row").filter(has_text="采集完成")).to_have_count(12)
        initial_refreshes = page.evaluate("globalThis.__kellyDemoReads.filter(read => read.key === 'checks' && read.cursor === null).length")
        page.wait_for_function(
            "initial => globalThis.__kellyDemoReads.filter(read => read.key === 'checks' && read.cursor === null).length > initial",
            arg=initial_refreshes,
            timeout=12000,
        )
        expect(page.locator(".check-row").filter(has_text="采集完成")).to_have_count(12)
        expect(page.locator('[data-more="checks"]')).to_have_count(0)
        assert_no_overflow(page)
        assert not errors, errors
        return {"suite": "six hosts and 72 checks retain the requested continuation page", "status": "pass"}
    finally:
        context.close()


def record_review(browser, base_url: str) -> dict:
    if not shutil.which("ffmpeg"):
        return {"suite": "10-second review recording", "status": "skip", "reason": "ffmpeg unavailable"}
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-security-recording-") as raw_dir:
        context = browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN", color_scheme="dark", record_video_dir=raw_dir, record_video_size={"width": 1280, "height": 720})
        page = context.new_page()
        video = page.video
        started = time.monotonic()
        open_demo(page, base_url)
        page.wait_for_timeout(1200)
        navigate(page, "findings")
        page.locator(".finding-row").first.click()
        page.wait_for_timeout(1000)
        page.locator("#reviewNote").fill("已核对业务负责人和发布审批：该服务为授权的临时诊断工具，保留证据供后续复查。")
        page.wait_for_timeout(1200)
        page.get_by_role("button", name="已解释为正常", exact=True).click()
        expect(page.locator(".finding-row").first).to_contain_text("已解释为正常")
        remaining = 10.5 - (time.monotonic() - started)
        if remaining > 0:
            page.wait_for_timeout(remaining * 1000)
        context.close()
        source = video.path()
        target = RECORDINGS / "review-zh-CN.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-t", "10", "-vf", "fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target)], check=True)
    return {"suite": "10-second review recording", "status": "pass", "path": str(target.relative_to(REPO_ROOT))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture-assets", action="store_true")
    args = parser.parse_args()
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = {"PORT": str(port), "BUSABASE_BASE_URL": "", "BUSABASE_API_KEY": "", "BUSABASE_SPACE_ID": "", "BUSABASE_AIRAPP_RUNTIME": ""}
    with managed_process(["node", "server.js"], APP_ROOT, env, f"{base_url}/health"):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                results = [desktop_flow(browser, base_url, args.capture_assets)]
                results.extend(responsive_flow(browser, base_url, args.capture_assets))
                results.append(pagination_flow(browser, base_url))
                results.append(production_failure(browser, base_url))
                if args.capture_assets:
                    results.append(record_review(browser, base_url))
                print(json.dumps({"suite": "kelly-security independent browser acceptance", "browser": browser.version, "results": results}, ensure_ascii=False, indent=2))
            finally:
                browser.close()


if __name__ == "__main__":
    main()
