from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-demo-video-factory"
APP_ROOT = SKILL_ROOT / "content" / "kelly-demo-video-factory-app"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-demo-video-factory"
BUSABASE_VERSION = "0.16.2"


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

    # Demo dataset (2 videos) ported verbatim from the retired
    # app/server/demo.ts. Counts verified with a throwaway `node -e` probe
    # against demo-provider.js's getState() before writing these assertions:
    # demo-video-1 has 3 shots (1 recorded / 1 pending / 1 needs_reshoot),
    # demo-video-2 has 2 shots (both recorded).
    page.goto(f"{base_url}/?demo=1#/videos")
    page.wait_for_load_state("networkidle")
    expect(page.locator("table tbody tr")).to_have_count(2)
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/videos/demo-video-1")
    page.wait_for_load_state("networkidle")
    expect(page.locator("#page-title")).to_have_text("视频1：Busabase 是 AI Coder 的『小白宝箱』")
    # The verified-claims table renders before the storyboard table -- wait
    # for both tables to actually mount (client-side rendering on a route
    # change is synchronous JS with no network activity, so
    # wait_for_load_state("networkidle") alone can resolve a beat before the
    # DOM update lands; expect()'s auto-retry is what actually makes this
    # deterministic, not the networkidle wait).
    storyboard_table = page.locator(".content table").nth(1)
    expect(storyboard_table.locator("tbody tr")).to_have_count(3, timeout=10_000)
    assert_no_horizontal_overflow(page)

    page.goto(f"{base_url}/?demo=1#/videos/demo-video-2")
    page.wait_for_load_state("networkidle")
    storyboard_table = page.locator(".content table").nth(1)
    expect(storyboard_table.locator("tbody tr")).to_have_count(2, timeout=10_000)
    assert not errors, errors
    desktop.close()


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


def test_busabase_provisioning(browser) -> None:
    busabase_port = free_port()
    app_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    app_url = f"http://127.0.0.1:{app_port}"

    with tempfile.TemporaryDirectory(prefix="kelly-demo-video-factory-busabase-", ignore_cleanup_errors=True) as data_dir:
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
            script_env = {"BUSABASE_BASE_URL": busabase_url, "BUSABASE_SPACE_ID": "local"}

            # This skill's schema (two Bases with a bidirectional relation
            # field) is provisioned by the trusted scripts.ensure_schema.mjs,
            # not the browser's generic lazy-create button — a relation
            # field's targetBaseId must name an ALREADY-CREATED Base, which a
            # single batched "create both Bases at once" ChangeRequest can't
            # satisfy for two Bases that reference each other. This is the
            # real "OSS Busabase provisioning" check for this skill: does
            # ensure_schema.mjs actually create the select/relation/markdown/
            # url/attachment fields correctly against a live busabase@0.11.0
            # server.
            # busabase's /api/health can report ready a moment before
            # /api/v1/bases is actually serving (observed directly: a bare
            # `GET /api/v1/bases` immediately after managed_process()
            # returns occasionally 500s once, then succeeds) -- retry the
            # first real Busabase call a few times rather than treat that
            # as a real ensure_schema.mjs bug.
            result = None
            for attempt in range(3):
                result = subprocess.run(
                    ["node", "scripts/ensure_schema.mjs"],
                    cwd=SKILL_ROOT,
                    env={**__import__("os").environ, **script_env},
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if result.returncode == 0:
                    break
                time.sleep(1)
            assert result.returncode == 0, f"ensure_schema.mjs failed:\n{result.stdout}\n{result.stderr}"
            assert "Wired bidirectional relation" in result.stdout, result.stdout

            bases = read_json(f"{busabase_url}/api/v1/bases")
            videos_base = next(b for b in bases if b["slug"] == "kelly-demo-video-factory-videos")
            shots_base = next(b for b in bases if b["slug"] == "kelly-demo-video-factory-video-shots")
            field_types = {f["slug"]: f["type"] for f in videos_base["fields"]}
            assert field_types["series"] == "select", field_types
            assert field_types["status"] == "select", field_types
            assert field_types["verified-claims"] == "markdown", field_types
            assert field_types["final-video-url"] == "url", field_types
            assert field_types["shots"] == "relation", field_types
            shot_field_types = {f["slug"]: f["type"] for f in shots_base["fields"]}
            assert shot_field_types["video"] == "relation", shot_field_types
            assert shot_field_types["asset"] == "attachment", shot_field_types
            asset_field = next(f for f in shots_base["fields"] if f["slug"] == "asset")
            assert asset_field["options"]["attachment"]["maxFiles"] == 10, asset_field
            video_field = next(f for f in shots_base["fields"] if f["slug"] == "video")
            shots_field = next(f for f in videos_base["fields"] if f["slug"] == "shots")
            assert video_field["options"]["inverseFieldId"] == shots_field["id"]
            assert shots_field["options"]["inverseFieldId"] == video_field["id"]

            app_env = {"BUSABASE_BASE_URL": busabase_url, "BUSABASE_SPACE_ID": "local"}
            with tempfile.TemporaryDirectory(prefix="kelly-demo-video-factory-home-") as app_home:
                with managed_process(
                    ["node", "server.js"],
                    APP_ROOT,
                    {**app_env, "HOME": app_home, "PORT": str(app_port)},
                    f"{app_url}/health",
                ) as (_, app_logs):
                    context = browser.new_context(viewport={"width": 1280, "height": 820})
                    page = context.new_page()
                    errors = attach_error_capture(page)
                    page.goto(f"{app_url}/#/videos")
                    page.wait_for_load_state("networkidle")
                    # ensure_schema.mjs already stamped ownership metadata
                    # matching app/app/js/config.js's declarations, so the
                    # AirApp adopts the schema immediately -- no
                    # "Initialize workspace" [data-provision] button, unlike
                    # kelly-clm/kelly-family-fund's lazy-create flow.
                    assert page.locator("[data-provision]").count() == 0
                    expect(page.get_by_text("No videos yet")).to_be_visible()
                    assert not errors, errors
                    context.close()

                # Seed a video+shots via the real ingestion path (not a raw
                # fixture POST) -- scripts/propose_video.mjs --merge.
                result = subprocess.run(
                    ["node", "scripts/propose_video.mjs", "references/example-outline.json", "--merge"],
                    cwd=SKILL_ROOT,
                    env={**__import__("os").environ, **script_env},
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                assert result.returncode == 0, f"propose_video.mjs --merge failed:\n{result.stdout}\n{result.stderr}"
                assert "Backfilled inverse relation: 3 shots" in result.stdout, result.stdout

                app_port = free_port()
                app_url = f"http://127.0.0.1:{app_port}"
                with tempfile.TemporaryDirectory(prefix="kelly-demo-video-factory-home2-") as app_home:
                    with managed_process(
                        ["node", "server.js"],
                        APP_ROOT,
                        {**app_env, "HOME": app_home, "PORT": str(app_port)},
                        f"{app_url}/health",
                    ):
                        context = browser.new_context(viewport={"width": 1280, "height": 820})
                        page = context.new_page()
                        errors = attach_error_capture(page)
                        page.goto(f"{app_url}/#/videos")
                        page.wait_for_load_state("networkidle")
                        assert page.locator("[data-provision]").count() == 0
                        rows = page.locator("table tbody tr")
                        expect(rows).to_have_count(1)
                        assert "视频1" in rows.first.inner_text()
                        # Shot-recording-progress rollup (all 3 pending) --
                        # exercises the client-side join in video-model.js.
                        assert "pending" in rows.first.inner_text()

                        # Clicking a row sets location.hash, which fires the
                        # 'hashchange' event (and the synchronous re-render it
                        # triggers) on a later browser task -- NOT within the
                        # click's own call stack. wait_for_load_state("networkidle")
                        # only tracks network activity (there is none here; the
                        # data is already client-side), so it can resolve a beat
                        # before the DOM actually updates. expect()'s auto-retry
                        # is what makes this deterministic.
                        rows.first.click()
                        storyboard_table = page.locator(".content table").nth(1)
                        expect(storyboard_table.locator("tbody tr")).to_have_count(3, timeout=10_000)
                        assert_no_horizontal_overflow(page)
                        assert not errors, errors
                        context.close()

            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            keys = resource_keys(nodes)
            assert sorted(keys) == sorted(["app-root", "videos", "video-shots"]), nodes

        # Structure and data must survive a complete Busabase process restart.
        with managed_process(busabase_command, REPO_ROOT, {}, f"{busabase_url}/api/health", timeout=90):
            nodes = read_json(f"{busabase_url}/api/v1/nodes?depth=2")
            assert len(resource_keys(nodes)) == 3, nodes
            videos_base = find_resource(nodes, "videos")
            records = read_json(f"{busabase_url}/api/v1/records?baseId={videos_base['baseId']}")
            record_items = records if isinstance(records, list) else records.get("records", [])
            assert any(
                "视频1" in (record.get("headCommit", {}).get("payload") or record.get("headCommit", {}).get("fields", {})).get("title", "")
                for record in record_items
            )


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-demo-video-factory-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(
            ["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"
        ):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI (2 videos, shot-recording-progress rollup)")
                    test_busabase_provisioning(browser)
                    print(
                        "PASS OSS - ensure_schema.mjs provisioning (select/relation/markdown/url/attachment "
                        "field types verified), propose_video.mjs --merge real ingestion, and AirApp "
                        "read + shot-to-video join against temporary Busabase"
                    )
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
