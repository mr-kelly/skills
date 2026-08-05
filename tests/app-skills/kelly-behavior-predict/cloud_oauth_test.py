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

APP_ROOT = REPO_ROOT / "skills" / "kelly-behavior-predict" / "app"
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


def complete_cloud_login(page, app_url: str, config: dict) -> None:
    page.goto(f"{app_url}/")
    page.wait_for_load_state("networkidle")
    page.get_by_role("heading", name="Connect Busabase").wait_for(state="visible")

    if config["base_url"] != "https://busabase.com":
        page.locator('input[name="server_mode"][value="custom"]').check()
        page.locator('input[name="custom_base_url"]').fill(config["base_url"])
    page.get_by_role("button", name="Connect Busabase").click()

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
    with tempfile.TemporaryDirectory(prefix="kelly-behavior-predict-cloud-home-") as app_home:
        env = {
            "HOME": app_home,
            "PORT": str(port),
            "BUSABASE_BASE_URL": "",
            "BUSABASE_API_KEY": "",
            "BUSABASE_SPACE_ID": config["space_id"],
        }
        with managed_process(["node", "server.js"], APP_ROOT, env, f"{app_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(viewport={"width": 1280, "height": 820})
                page = context.new_page()
                connected = False
                try:
                    complete_cloud_login(page, app_url, config)
                    status = read_json(f"{app_url}/auth/status")
                    assert status["connected"] is True and status["baseUrl"] == config["base_url"], status
                    connected = True
                    assert_browser_has_no_token(page)

                    initialize = page.locator("[data-provision]")
                    if config["allow_mutation"] and initialize.count():
                        initialize.click()
                        page.wait_for_selector("[data-provision]", state="detached", timeout=30_000)
                        print("PASS Cloud full - OAuth and lazy provisioning in dedicated test Space")
                    elif not config["allow_mutation"]:
                        print("PASS Cloud OAuth - authenticated without Cloud mutations")
                finally:
                    if connected:
                        result = page.evaluate(
                            """async () => {
                              const response = await fetch('/auth/logout', { method: 'POST' });
                              return { ok: response.ok, body: await response.json() };
                            }"""
                        )
                        assert result["ok"] and result["body"].get("ok") is True, result
                        status = read_json(f"{app_url}/auth/status")
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
