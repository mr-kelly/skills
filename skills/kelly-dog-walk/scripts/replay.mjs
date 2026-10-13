#!/usr/bin/env node
// 回放：用一本遛狗手册把过去的一个月重新决定一遍，再按裁判规则判每一天。一个月几秒钟。
//
//   node scripts/replay.mjs --city 上海 --month 2026-06 --playbook v1
//   node scripts/replay.mjs --city 上海 --month 2026-06 --playbook busabase --write      # 用现在的手册，写进「每天的决定」
//   node scripts/replay.mjs --city 上海 --month 2026-06 --month 2026-05 --playbook v1 --compare v2   # 同月对照 + 换一个月
//   node scripts/replay.mjs --city 北京 --month 2026-07 --playbook v4 --geocode
//
// --playbook busabase | v1 … v4 | <文件>    手册从哪来（默认 busabase：Busabase 里的遛狗手册）
// --compare  busabase | v1 … v4 | <文件>    同一个月再回放一遍做对照；按裁判规则给出「通过 / 不通过」
// --judge    busabase | v1 | v2 | <文件>    裁判规则从哪来（默认：手册来自 busabase 就用 busabase，否则用模板自带的 v1）
// --source   auto | live | cache | fixtures 天气数据从哪来（fixtures = 录制好的上海 2026 年 5–9 月，离线）
// --days      逐天列出来      --json   输出 JSON      --write   把 --playbook 的结果写进「每天的决定」
import {
  GATE_WHY,
  METRIC_LABEL,
  daysFromMonthData,
  gate,
  monthEvidence,
  parseJudgeRules,
  parseRuleCard,
  replayMonth,
  summarize,
  weekdayLabel,
} from "../content/kelly-dog-walk-app/app/js/walk-model.js";
import { lazyBusabase, loadJudgeSource, loadPlaybookSource, parseArgs, run } from "./lib/cli.mjs";
import { loadMonth, resolvePlace } from "./lib/open-meteo.mjs";

const ORIGIN = { fixture: "录制的 Open-Meteo 数据", cache: "本地缓存的 Open-Meteo 数据", live: "Open-Meteo 实时请求" };

/** Replay one playbook over already-loaded months. Pure apart from the inputs. */
export const replay = ({ months, card, judge, city }) =>
  months.map(({ month, days }) => {
    const rows = replayMonth(days, card, judge, { city });
    return { month, version: card.version, rows, summary: summarize(rows), evidence: monthEvidence(rows) };
  });

const list = (values) => values.map((value) => Math.round(value)).join("、");

const printMonth = (result, judge, { showDays }) => {
  const s = result.summary;
  console.log(
    `  ${result.month} · 手册 ${result.version}：淋雨 ${s.wet}/${s.days}   太热 ${s.hot}   不方便 ${s.off}   没淋 ${s.dry}${s.pending ? `   待判 ${s.pending}` : ""}`,
  );
  const e = result.evidence;
  if (e.wetDays.length) {
    const min = Math.min(...e.wetProbs.map(Number));
    console.log(
      `    淋雨那 ${e.wetDays.length} 天，遛狗那个钟点当时的预报降水概率：${list(e.wetProbs)}（最低 ${min}%）`,
    );
    console.log(
      `    淋雨的日子：${e.wetDays.map((day) => `${day.date.slice(5)} ${weekdayLabel(day.weekday)} ${day.hour} 点 ${day.rain} mm`).join("；")}`,
    );
    const byWeekday = Object.keys(e.weekday.wet)
      .sort()
      .map((day) => `${weekdayLabel(Number(day))} ${e.weekday.wet[day]}/${e.weekday.days[day]} 天`)
      .join(" · ");
    console.log(`    淋雨落在星期几（样本只有 ${e.weekday.sample} 天，别当规律）：${byWeekday}`);
  } else console.log("    这个月没淋雨。");
  if (e.hotDays.length)
    console.log(`    太热：${e.hotDays.map((day) => `${day.date.slice(5)} ${day.hour} 点 ${day.temp}°C`).join("；")}`);
  if (e.offDays.length)
    console.log(`    不方便：${e.offDays.map((day) => `${day.date.slice(5)} ${day.hour} 点`).join("；")}`);
  const guard = judge.guardrails
    ? `护栏（太热 ${judge.guardrails.hot ?? "—"} 次、不方便 ${judge.guardrails.off ?? "—"} 次）：${s.hot <= (judge.guardrails.hot ?? Number.POSITIVE_INFINITY) && s.off <= (judge.guardrails.off ?? Number.POSITIVE_INFINITY) ? "守住了" : "破了"}`
    : "裁判规则 v1 没有护栏：太热和不方便列出来给人看，但不计分";
  console.log(`    ${guard}`);
  if (showDays) {
    for (const row of result.rows) {
      console.log(
        `      ${row.date} ${weekdayLabel(row.weekday)} ${String(row.hour).padStart(2)} 点  ${row.verdict.padEnd(3, "　")}  降水概率 ${String(row.prob).padStart(3)}%  实际 ${row.rain} mm ${row.temp}°C  ${row.reason}`,
      );
    }
  }
};

const printCompare = (current, candidate, judge) => {
  const verdicts = current.map((mine, i) => {
    const theirs = candidate[i];
    const result = gate(theirs.summary, mine.summary, judge);
    console.log(
      `\n  ${mine.month} 同月对照（裁判规则 ${judge.version}${judge.guardrails ? "：先看护栏，再看淋雨" : "：只看淋雨"}）`,
    );
    console.log("               淋雨  太热  不方便");
    for (const [label, run] of [
      [`${mine.version}（现在）`, mine],
      [`${theirs.version}（提议）`, theirs],
    ]) {
      console.log(
        `    ${label.padEnd(9, " ")}${String(run.summary.wet).padStart(4)}${String(run.summary.hot).padStart(6)}${String(run.summary.off).padStart(7)}`,
      );
    }
    const warn = result.warnings.length
      ? `；提醒：${result.warnings.map((key) => `${METRIC_LABEL[key]} ${mine.summary[key]} → ${theirs.summary[key]}`).join("、")}——这版裁判不看，但主人应该知道`
      : "";
    const broken = result.broken.length ? `（${result.broken.map((key) => METRIC_LABEL[key]).join("、")}）` : "";
    console.log(`    → ${result.pass ? "通过" : "不通过"}：${GATE_WHY[result.why]}${broken}${warn}`);
    return { month: mine.month, ...result };
  });
  const passed = verdicts.filter((v) => v.pass).length;
  const needOther = judge.evidence.otherMonth;
  const overall =
    verdicts.length < 2
      ? `只对照了 1 个月。提议之前还要换一个月再回放一次${needOther ? "（裁判规则要求）" : "（遛狗不淋雨的做事规矩要求）"}。`
      : passed === verdicts.length
        ? `${verdicts.length} 个月都通过，可以提议。`
        : `${verdicts.length} 个月里只有 ${passed} 个通过，不要提议。`;
  console.log(`\n  总结：${overall}`);
  return { verdicts, ready: verdicts.length >= 2 && passed === verdicts.length };
};

run(async () => {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["write", "json", "days", "geocode"],
    values: ["city", "playbook", "compare", "judge", "source", "lat", "lon", "timezone", "folder"],
    repeatable: ["month"],
  });
  if (!args.month.length) throw new Error("要说一个月份：--month 2026-06");
  const busabase = lazyBusabase(args.folder);
  const playbookSpec = args.playbook || "busabase";
  const playbook = await loadPlaybookSource(playbookSpec, busabase);
  const judgeSource = await loadJudgeSource(args.judge || (playbookSpec === "busabase" ? "busabase" : "v1"), busabase);
  const card = parseRuleCard(playbook.content);
  const judge = parseJudgeRules(judgeSource.content);
  const place = await resolvePlace({
    city: args.city,
    lat: args.lat,
    lon: args.lon,
    timezone: args.timezone,
    geocode: args.geocode,
  });

  const months = [];
  for (const month of args.month) {
    const data = await loadMonth(place, month, { source: args.source || "auto" });
    months.push({ month, days: daysFromMonthData(data), origin: data.origin, partial: data.partial });
  }
  const current = replay({ months, card, judge, city: place.name });
  const compareCard = args.compare ? parseRuleCard((await loadPlaybookSource(args.compare, busabase)).content) : null;
  const candidate = compareCard ? replay({ months, card: compareCard, judge, city: place.name }) : null;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          place,
          judge: {
            version: judge.version,
            wetMm: judge.wetMm,
            hotC: judge.hotC,
            ownerHours: judge.ownerHours,
            guardrails: judge.guardrails,
          },
          playbook: { version: card.version, source: playbook.label },
          months: current.map(({ rows, ...rest }) => ({ ...rest, rows })),
          ...(candidate
            ? {
                compare: {
                  version: compareCard.version,
                  months: candidate.map(({ rows, ...rest }) => rest),
                  gates: current.map((mine, i) => ({
                    month: mine.month,
                    ...gate(candidate[i].summary, mine.summary, judge),
                  })),
                },
              }
            : {}),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `回放 ${place.name}（${place.latitude}, ${place.longitude} · ${place.note}）· 手册：${playbook.label}（${card.version}）· 裁判规则：${judgeSource.label}（${judge.version}）`,
    );
    console.log(
      `判法：淋雨 ≥ ${judge.wetMm} mm · 太热 ≥ ${judge.hotC}°C · 主人方便时段 ${judge.ownerHours.join("、")} 点 · 数据：${[...new Set(months.map((m) => ORIGIN[m.origin]))].join("、")}`,
    );
    for (const result of current) printMonth(result, judge, { showDays: args.days });
    if (candidate) printCompare(current, candidate, judge);
  }

  if (args.write) {
    const { client, ws, upsertDecisions } = await busabase();
    for (const result of current) {
      const written = await upsertDecisions(
        client,
        ws,
        result.rows,
        `回放 ${place.name} ${result.month}：遛狗手册 ${card.version}，裁判规则 ${judge.version}`,
      );
      console.log(
        `每天的决定 ${result.month}：新增 ${written.created} 行，更新 ${written.updated} 行，没变 ${written.unchanged} 行${written.pending.length ? `；待审核 ${written.pending.join("、")}` : ""}`,
      );
    }
  }
});
