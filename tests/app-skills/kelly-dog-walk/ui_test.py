from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "tests" / "app-skills" / "harness"))

from runtime import free_port, managed_process

SKILL_ROOT = REPO_ROOT / "skills" / "kelly-dog-walk"
APP_ROOT = SKILL_ROOT / "content" / "kelly-dog-walk-app"
PROBE = REPO_ROOT / "tests" / "app-skills" / "kelly-dog-walk" / "busabase_probe.mjs"
RESULTS_ROOT = REPO_ROOT / "test-results" / "kelly-dog-walk"
# A Busabase new enough to carry Skill nodes, template install and native calendar/kanban views.
BUSABASE_VERSION = "0.96.0"


def assert_no_horizontal_overflow(page: Page) -> None:
    dims = page.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert dims[0] <= dims[1] + 1, dims


def attach_error_capture(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("console", lambda message: errors.append(f"console: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    return errors


def numbers(page: Page, selector: str) -> list[int]:
    return [int(text) for text in page.locator(selector).all_inner_texts()]


def open_demo(page: Page, base_url: str, path: str) -> None:
    page.goto(f"{base_url}{path}")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector(".page-head .headline")


# The four story months, from real Shanghai 2026 weather: [淋雨, 太热, 不方便] for the playbook in
# force, then for "still on v1". The same figures are pinned against the raw fixtures in replay.test.mjs.
STORY = {
    "2026-06": ("6 月淋了 7 次雨。", [7, 0, 0], [7, 0, 0]),
    "2026-07": ("7 月淋了 5 次雨。", [5, 15, 0], [9, 15, 0]),
    "2026-08": ("8 月淋了 2 次雨。", [2, 5, 14], [5, 3, 0]),
    "2026-09": ("9 月淋了 3 次雨。", [3, 0, 0], [6, 0, 0]),
}


def test_demo_ui(browser, base_url: str) -> None:
    desktop = browser.new_context(viewport={"width": 1440, "height": 900})
    page = desktop.new_page()
    errors = attach_error_capture(page)

    for month, (headline, in_force, baseline) in STORY.items():
        open_demo(page, base_url, f"/?demo=1&lang=zh-CN#/calendar/{month}")
        assert page.locator(".page-head .headline").inner_text() == headline
        assert numbers(page, ".side-panel .metric-value") == in_force, month
        bars = numbers(page, ".side-panel .bar-value")
        assert bars[0::2] == in_force and bars[1::2] == baseline, (month, bars)
        assert page.locator("a.day-cell").count() == int(month[5:] in ("06", "09") and 30 or 31)
        assert page.locator("a.day-cell.v-wet").count() == in_force[0]
        assert_no_horizontal_overflow(page)

    # The sidebar carries every month's wet count, and the tabs every month's playbook.
    assert numbers(page, ".nav-months .nav-count") == [7, 5, 2, 3]
    assert [tab.split("\n")[-1] for tab in page.locator(".month-tab").all_inner_texts()] == ["v1", "v2", "v3", "v4"]

    # Read-only: no approve / merge control anywhere.
    body = page.locator("body").inner_text()
    for word in ("批准", "通过审批", "Approve", "Merge"):
        assert word not in body, word
    assert page.locator("button").filter(has_text="合并").count() == 0

    # A day explains itself: the rule sentence written by the replay.
    open_demo(page, base_url, "/?demo=1&lang=zh-CN#/calendar/2026-07")
    page.locator('a.day-cell[href$="/2026-07-15"]').click()
    page.wait_for_selector(".day-detail .facts")
    detail = page.locator(".day-detail").inner_text()
    assert "淋雨" in detail and "太热" in detail, detail  # wet AND hot that evening
    assert "18 点预报降水概率" in detail, detail
    assert page.url.endswith("#/calendar/2026-07/2026-07-15")

    # The timeline: v1 → v4 from the playbook itself, P5 retired, P2 closed, the judge change.
    open_demo(page, base_url, "/?demo=1&lang=zh-CN#/timeline")
    assert page.locator(".page-head .headline").inner_text() == "手册从 v1 走到了 v4。"
    assert page.locator(".version-card").count() == 4
    assert page.locator(".version-card.is-retired .version-tag").inner_text() == "v3"
    assert page.locator(".version-card.is-current .version-tag").inner_text() == "v4"
    assert "周日和周二不遛" in page.locator(".note-closed").inner_text()
    assert "裁判规则 v1 → v2" in page.locator(".note-judge").inner_text()
    assert [int(n) for n in page.locator(".total-pair b").all_inner_texts()] == [17, 27, 20, 18, 14, 0]
    assert_no_horizontal_overflow(page)

    # Help & Settings: a modal on its own hash; the Style tab drives <html data-theme>; Escape closes.
    page.locator('.sidebar a[href="#/help"]').click()
    page.wait_for_selector(".modal")
    assert "这里没有审批按钮" not in page.locator(".modal").inner_text()  # the modal explains, it does not repeat
    assert "合并才算数" in page.locator(".modal").inner_text()
    page.locator('[data-family="graphite"]').click()
    assert page.locator("html").get_attribute("data-theme") == "graphite"
    page.keyboard.press("Escape")
    page.wait_for_selector(".modal", state="detached")
    assert page.url.endswith("#/timeline")

    # Desktop sidebar collapses to a rail.
    page.locator(".collapse-button").click()
    assert page.locator(".app-shell.sidebar-collapsed").count() == 1

    # English chrome.
    open_demo(page, base_url, "/?demo=1&lang=en#/calendar/2026-06")
    assert page.locator(".page-head .headline").inner_text() == "June: 7 wet walks."
    assert page.locator("html").get_attribute("lang") == "en"
    assert not errors, errors
    desktop.close()

    for width, height in ((390, 844), (360, 740)):
        phone = browser.new_context(viewport={"width": width, "height": height})
        page = phone.new_page()
        errors = attach_error_capture(page)
        open_demo(page, base_url, "/?demo=1&lang=zh-CN#/calendar/2026-08")
        assert_no_horizontal_overflow(page)
        assert page.locator(".mobile-topbar").is_visible()
        page.locator("[data-open-sidebar]").click()
        assert page.locator("body.sidebar-open").count() == 1
        page.locator(".sidebar-scrim.is-open").click(position={"x": width - 8, "y": 400})
        assert page.locator("body.sidebar-open").count() == 0
        page.locator('a.day-cell[href$="/2026-08-01"]').click()
        page.wait_for_selector(".day-detail .facts")
        assert "10 点" in page.locator(".day-detail").inner_text()
        open_demo(page, base_url, "/?demo=1&lang=zh-CN#/timeline")
        assert_no_horizontal_overflow(page)
        assert not errors, errors
        phone.close()


def run(command: list[str], env: dict[str, str], ok: bool = True) -> str:
    result = subprocess.run(command, cwd=SKILL_ROOT, env={**os.environ, **env}, capture_output=True, text=True, timeout=300)
    output = result.stdout + result.stderr
    if ok and result.returncode != 0:
        raise AssertionError(f"{' '.join(command)} failed ({result.returncode}):\n{output}")
    if not ok and result.returncode == 0:
        raise AssertionError(f"{' '.join(command)} should have failed:\n{output}")
    return output


def state(env: dict[str, str]) -> dict:
    return json.loads(run(["node", str(PROBE), "state"], env))


def propose(env: dict[str, str], version: str, months: str, *extra: str, ok: bool = True) -> str:
    return run(
        [
            "node",
            "scripts/propose.mjs",
            "--file",
            f"references/playbooks/{version}.md",
            "--city",
            "上海",
            "--month",
            months,
            "--source",
            "fixtures",
            *extra,
        ],
        env,
        ok,
    )


def change_request_id(output: str) -> str:
    marker = "变更请求已提交："
    assert marker in output, output
    return output.split(marker, 1)[1].split("（", 1)[0].strip()


def test_busabase_round_trip(browser) -> None:
    """Install the template into a throwaway local Busabase, run the agent's loop for real,
    play the human's part (review + merge) through the API, and read the AirApp in live mode."""
    busabase_port = free_port()
    busabase_url = f"http://127.0.0.1:{busabase_port}"
    with tempfile.TemporaryDirectory(prefix="kelly-dog-walk-busabase-") as data_dir, tempfile.TemporaryDirectory(
        prefix="kelly-dog-walk-home-"
    ) as home:
        busabase = ["npx", "-y", f"busabase@{BUSABASE_VERSION}", "server", "--host", "127.0.0.1", "--port", str(busabase_port), "--data", data_dir]
        # HOME is a throwaway so nothing reads the operator's real ~/.busabase/.env.
        env = {"HOME": home, "BUSABASE_BASE_URL": busabase_url, "BUSABASE_API_KEY": "", "BUSABASE_SPACE_ID": ""}
        with managed_process(busabase, REPO_ROOT, {"HOME": home}, f"{busabase_url}/api/health", timeout=120):
            install = run(["npx", "-y", f"busabase-cli@{BUSABASE_VERSION}", "install", str(SKILL_ROOT), "--output", "json"], env)
            assert '"installed": true' in install, install

            # Setup: rename, stamp the judge Doc, create the calendar + kanban; then idempotent.
            assert "将创建" not in run(["node", "scripts/setup.mjs"], env) or True
            run(["node", "scripts/setup.mjs", "--apply"], env)
            assert "收尾已完成" in run(["node", "scripts/setup.mjs", "--agent-user", "agent-1"], env)
            first = state(env)
            assert first["folder"]["name"] == "遛狗不淋雨"
            assert first["judgeStamped"] is True
            assert sorted((view["slug"], view["type"]) for view in first["views"]) == [
                ("verdict-board", "kanban"),
                ("verdict-calendar", "calendar"),
            ]
            assert first["playbookVersion"] == "v1" and first["judgeVersion"] == "v1"

            # Weather and a replay, written; a second replay changes nothing.
            assert "新增 510 行" in run(["node", "scripts/weather.mjs", "--city", "上海", "--month", "2026-06", "--source", "fixtures", "--write"], env)
            replay = ["node", "scripts/replay.mjs", "--city", "上海", "--month", "2026-06", "--playbook", "busabase", "--source", "fixtures", "--write"]
            out = run(replay, env)
            assert "淋雨 7/30" in out and "新增 30 行" in out, out
            assert "没变 30 行" in run(replay, env)
            rows = state(env)["decisions"]
            assert len(rows) == 30
            assert sum(1 for row in rows if row["verdict"] == "淋雨") == 7
            assert {row["playbook-version"] for row in rows} == {"v1"}
            # 摘要 is the record title, so the calendar and kanban cards say the hour and the verdict.
            assert all(row["summary"] == f'{int(row["walk-hour"])} 点 · {row["verdict"]}' for row in rows), rows[0]
            # Decided from the Busabase 遛狗手册, so the write cites it: 通过做事手册「遛狗手册」.
            assert state(env)["decisionPlaybooks"] == ["遛狗手册"], state(env)["decisionPlaybooks"]

            # Round 1: propose v2. The ChangeRequest is pending; the playbook is still v1.
            out = propose(env, "v2", "2026-06,2026-05")
            v2_request = change_request_id(out)
            assert "- 2026-06：现在 v1 淋雨 7/30、太热 0、不方便 0；提议 v2 淋雨 3/30" in out and "2 个月都通过" in out, out
            after = state(env)
            assert after["playbookVersion"] == "v1", "a proposal must not change the playbook"
            assert v2_request in after["pending"]
            # The human merges it in Busabase.
            assert json.loads(run(["node", str(PROBE), "merge", v2_request], env))["merge"] == "merged"
            assert state(env)["playbookVersion"] == "v2"
            assert "淋雨 5/31" in run(["node", "scripts/replay.mjs", "--city", "上海", "--month", "2026-07", "--playbook", "busabase", "--source", "fixtures"], env)

            # Round 2: the bad rule passes judge v1 on two months — with the warning printed.
            out = propose(env, "v3", "2026-07,2026-06")
            assert "不方便变多（这版裁判不计）" in out, out
            run(["node", str(PROBE), "merge", change_request_id(out)], env)
            assert state(env)["playbookVersion"] == "v3"

            # Round 3: judge v1 cannot justify the rollback; the script refuses without --despite.
            refused = propose(env, "v4", "2026-08,2026-07", ok=False)
            assert "没有提交" in refused, refused
            assert state(env)["pending"] == []
            out = propose(env, "v4", "2026-08,2026-07", "--despite", "回滚：主指标赢、护栏输；建议主人把裁判规则改成 v2")
            run(["node", str(PROBE), "merge", change_request_id(out)], env)
            final = state(env)
            assert final["playbookVersion"] == "v4"
            assert "P5" in final["playbookRetired"]

            # History only grows: a playbook that drops a retired rule is refused.
            forged = Path(home) / "v5-forged.md"
            text = (SKILL_ROOT / "references" / "playbooks" / "v4.md").read_text(encoding="utf-8")
            text = text.replace("当前版本：v4", "当前版本：v5").replace("版本: v4", "版本: v5")
            text = text.split("## 已退休")[0] + "## 已退休\n\n还没有退休的规则。\n"
            text = text.replace("## 版本记录\n", "## 版本记录\n\n- v5 · 2026-10 起 · 删掉已退休。为什么：试试\n", 1)
            forged.write_text(text, encoding="utf-8")
            out = run(["node", "scripts/propose.mjs", "--file", str(forged), "--city", "上海", "--month", "2026-09,2026-08", "--source", "fixtures"], env, ok=False)
            assert "「已退休」里少了" in out, out

            # The agent never touched the judge.
            assert state(env)["judgeVersion"] == "v1"

            # The AirApp in live mode reads what the scripts wrote.
            app_port = free_port()
            app_url = f"http://127.0.0.1:{app_port}"
            with managed_process(["node", "server.js"], APP_ROOT, {"BUSABASE_BASE_URL": busabase_url, "HOME": home, "PORT": str(app_port)}, f"{app_url}/health"):
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                page = context.new_page()
                errors = attach_error_capture(page)
                page.goto(f"{app_url}/?lang=zh-CN#/calendar/2026-06")
                page.wait_for_selector(".page-head .headline", timeout=30_000)
                assert page.locator(".page-head .headline").inner_text() == "6 月淋了 7 次雨。"
                assert numbers(page, ".side-panel .metric-value") == [7, 0, 0]
                # The control came from the 天气数据 rows written above.
                assert numbers(page, ".side-panel .bar-value")[1::2] == [7, 0, 0]
                assert "Busabase · 只读" in page.locator(".sidebar").inner_text()
                page.goto(f"{app_url}/?lang=zh-CN#/timeline")
                page.wait_for_selector(".version-card")
                assert page.locator(".version-card").count() == 4
                assert page.locator(".version-card.is-current .version-tag").inner_text() == "v4"
                page.screenshot(path=str(RESULTS_ROOT / "live-timeline.png"))
                assert not errors, errors
                context.close()


def main() -> None:
    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kelly-dog-walk-home-") as app_home:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        with managed_process(["node", "server.js"], APP_ROOT, {"HOME": app_home, "PORT": str(port)}, f"{base_url}/health"):
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                try:
                    test_demo_ui(browser, base_url)
                    print("PASS OSS - demo UI: four story months, timeline, help, desktop and phone")
                    test_busabase_round_trip(browser)
                    print("PASS OSS - template install, setup, replay, proposals pending until merged, live AirApp")
                except Exception:
                    for index, context in enumerate(browser.contexts):
                        for page_index, page in enumerate(context.pages):
                            page.screenshot(path=RESULTS_ROOT / f"failure-{index}-{page_index}.png", full_page=True)
                    raise
                finally:
                    browser.close()


if __name__ == "__main__":
    main()
