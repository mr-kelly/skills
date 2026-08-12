from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process


APP_ROOT = REPO_ROOT / "skills" / "kelly-jobhunt" / "app"
REQUIRED_ENV = (
    "KELLY_APP_CLOUD_BASE_URL",
    "KELLY_APP_CLOUD_TEST_EMAIL",
    "KELLY_APP_CLOUD_TEST_PASSWORD",
)


def load_config():
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        print(f"SKIP Cloud OAuth - missing environment variables: {', '.join(missing)}")
        return None

    base_url = os.environ["KELLY_APP_CLOUD_BASE_URL"].rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/"):
        raise AssertionError("KELLY_APP_CLOUD_BASE_URL must be an exact HTTPS origin")

    allow_mutation = os.environ.get("KELLY_APP_CLOUD_TEST_ALLOW_MUTATION") == "1"
    space_id = os.environ.get("KELLY_APP_CLOUD_TEST_SPACE_ID", "").strip()
    if allow_mutation and not space_id:
        raise AssertionError(
            "KELLY_APP_CLOUD_TEST_SPACE_ID is required when KELLY_APP_CLOUD_TEST_ALLOW_MUTATION=1"
        )
    return {
        "base_url": base_url,
        "email": os.environ["KELLY_APP_CLOUD_TEST_EMAIL"],
        "password": os.environ["KELLY_APP_CLOUD_TEST_PASSWORD"],
        "space_id": space_id,
        "allow_mutation": allow_mutation,
    }


def read_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


def read_browser_json(page, path: str):
    return page.evaluate(
        """async (path) => {
          const response = await fetch(path, { headers: { accept: 'application/json' } });
          return response.json();
        }""",
        path,
    )


def complete_cloud_login(page, app_url: str, config: dict) -> None:
    page.goto(f"{app_url}/")
    page.wait_for_load_state("networkidle")
    page.get_by_role("heading", name="连接 Busabase").wait_for(state="visible")

    if config["base_url"] != "https://busabase.com":
        page.locator('input[name="server_mode"][value="custom"]').check()
        page.locator('input[name="custom_base_url"]').fill(config["base_url"])
    page.get_by_role("button", name="连接 Busabase").click()

    page.wait_for_load_state("domcontentloaded")
    if page.url.startswith(app_url):
        error = page.locator("[role=alert]")
        raise AssertionError(error.inner_text() if error.count() else "Cloud OAuth did not leave the local app")

    if "/sign-in" in urlparse(page.url).path:
        page.locator("#email").fill(config["email"])
        page.locator("#password").fill(config["password"])
        page.locator('form button[type="submit"]').click()

    deadline_url = re.compile(rf"^{re.escape(app_url)}/")
    for _ in range(3):
        try:
            page.wait_for_url(deadline_url, timeout=4_000)
            break
        except Exception:
            path = urlparse(page.url).path
            if "/oauth/authorize" in path:
                buttons = page.locator("button:enabled")
                assert buttons.count() > 0, "Cloud OAuth consent page has no enabled action"
                buttons.last.click()
            elif "/sign-in" in path:
                page.locator("#email").wait_for(state="visible")
            else:
                page.wait_for_timeout(500)
    page.wait_for_url(deadline_url, timeout=20_000)
    page.wait_for_load_state("networkidle")


def assert_browser_has_no_token(page) -> None:
    visible = page.locator("body").inner_text()
    storage = page.evaluate(
        """() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })"""
    )
    assert not re.search(r"\b(?:bso|bsr|sk)_[A-Za-z0-9_-]+", visible)
    assert not any(name in page.url for name in ("access_token", "refresh_token"))
    assert storage == {"local": [], "session": []}, storage


def run_cloud_oauth(config: dict) -> None:
    port = free_port()
    app_url = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="kelly-jobhunt-cloud-home-") as app_home:
        env = {
            "HOME": app_home,
            "PORT": str(port),
            "BUSABASE_BASE_URL": "",
            "BUSABASE_API_KEY": "",
            "BUSABASE_SPACE_ID": "",
        }
        with managed_process(["node", "server.js"], APP_ROOT, env, f"{app_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(viewport={"width": 1280, "height": 820})
                page = context.new_page()
                business_requests = []
                page.on(
                    "request",
                    lambda request: business_requests.append(request.url)
                    if "/api/v1/" in request.url and not request.url.endswith("/api/v1/auth")
                    else None,
                )
                connected = False
                try:
                    complete_cloud_login(page, app_url, config)
                    status = read_browser_json(page, "/auth/status")
                    assert status.get("connected") is True, status
                    assert status.get("baseUrl") == config["base_url"], status
                    assert status.get("source") == "airapp-oauth-local", status
                    if status.get("requiresSpace"):
                        assert business_requests == [], (
                            "Business API was called before Space selection",
                            business_requests,
                        )
                        select = page.locator('select[name="space_id"]')
                        select.wait_for(state="visible")
                        if config["space_id"]:
                            select.select_option(config["space_id"])
                        page.get_by_role("button", name="使用这个 Space").click()
                        page.get_by_role("heading", name=re.compile("初始化|待发送")).wait_for(timeout=20_000)
                        status = read_browser_json(page, "/auth/status")
                    assert status.get("requiresSpace") is False, status
                    assert status.get("space", {}).get("id"), status
                    if config["space_id"]:
                        assert status["space"]["id"] == config["space_id"], status
                    connected = True
                    assert_browser_has_no_token(page)

                    initialize = page.get_by_role("button", name="初始化工作区")
                    if config["allow_mutation"] and initialize.count():
                        initialize.click()
                        page.get_by_role("heading", name="先让 Agent 整理求职档案", exact=True).wait_for(
                            timeout=30_000
                        )
                        page.locator(".onboarding-manual summary").click()
                        page.locator('[data-onboarding="name"]').fill("Cloud OAuth Test")
                        page.locator('[data-onboarding="targetRole"]').fill("Test Operator")
                        page.locator('[data-onboarding="highlights"]').fill(
                            "Dedicated automated test profile for the JobHunt onboarding gate."
                        )
                        page.locator('[data-onboarding="resumeFile"]').fill("cloud-oauth-test.pdf")
                        page.locator('[data-onboarding="fromEmail"]').fill("cloud-oauth@example.com")
                        page.get_by_role("button", name="保存手动填写内容").click()
                        page.get_by_text("等待当前 Space 审批", exact=False).wait_for(timeout=20_000)
                    elif not config["allow_mutation"]:
                        print("PASS Cloud OAuth - authenticated without Cloud mutations")
                    if config["allow_mutation"]:
                        print(
                            "PASS Cloud full - OAuth, lazy provisioning, and onboarding CR in dedicated test Space"
                        )
                finally:
                    if connected:
                        result = page.evaluate(
                            """async () => {
                              const response = await fetch('/auth/logout', { method: 'POST' });
                              return { ok: response.ok, body: await response.json() };
                            }"""
                        )
                        assert result["ok"] and result["body"].get("ok") is True, result
                        status = read_browser_json(page, "/auth/status")
                        assert status.get("connected") is False, status
                    context.close()
                    browser.close()


def main() -> None:
    config = load_config()
    if config is None:
        return
    run_cloud_oauth(config)


if __name__ == "__main__":
    main()
