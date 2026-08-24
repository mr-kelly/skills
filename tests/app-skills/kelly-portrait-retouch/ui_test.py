from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))
from runtime import free_port, managed_process

APP_ROOT = REPO_ROOT / "skills" / "kelly-portrait-retouch" / "content" / "kelly-portrait-retouch-app"


def assert_no_overflow(page: Page) -> None:
    widths = page.evaluate("() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })")
    assert widths["content"] <= widths["viewport"] + 1, widths


def run_viewport(browser, base_url: str, width: int, height: int) -> None:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    errors: list[str] = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{base_url}/?demo=queue&lang=en#/queue")
    page.wait_for_load_state("networkidle")

    assert page.locator(".portrait-row").count() == 1
    assert page.locator(".compare img").count() == 2
    assert page.locator(".segmented button").count() == 3
    assert_no_overflow(page)

    if width <= 720:
        page.locator("[data-open-sidebar]").click()
        assert page.locator("body.sidebar-open").count() == 1
        page.mouse.click(width - 4, 24)
        assert page.locator("body.sidebar-open").count() == 0
        page.locator(".portrait-row").first.click()
        assert page.locator("body.mobile-detail-open").count() == 1
        page.locator("[data-back]").click()
        assert page.locator("body.mobile-detail-open").count() == 0
    else:
        page.locator("[data-compare-mode='after']").click()
        assert page.locator("[data-compare-mode='after'].active").count() == 1

    settings_selector = ".mobile-topbar [data-route='settings']" if width <= 720 else ".sidebar-footer [data-route='settings']"
    page.locator(settings_selector).click()
    assert page.locator(".modal").is_visible()
    assert_no_overflow(page)
    page.locator("[data-close-settings]").click()
    assert not errors, errors
    context.close()


def main() -> None:
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="kelly-portrait-retouch-home-") as home:
        env = {"HOME": home, "PORT": str(port)}
        with managed_process(["node", "server.js"], APP_ROOT, env, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                for width, height in ((1280, 820), (390, 844), (360, 740)):
                    run_viewport(browser, base_url, width, height)
                browser.close()
    print("Kelly Portrait Retouch responsive demo UI OK")


if __name__ == "__main__":
    main()
