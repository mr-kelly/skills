#!/usr/bin/env node
// 每日模式：先读遛狗手册，抓今天的预报，按规则卡定钟点；再用昨天的实际天气给昨天的决定判结论。
// 适合放进每天早上的定时任务。
//
//   node scripts/today.mjs --city 上海                 # 读 Busabase 里的手册和裁判规则，只打印
//   node scripts/today.mjs --city 上海 --write         # 写「天气数据」和「每天的决定」，并给昨天判结论
//   node scripts/today.mjs --city 上海 --playbook v4 --judge v1     # 不连 Busabase，用课程手册试一下
//
// --date 2026-10-13   换一天当「今天」（只影响要决定的那天；昨天 = 它的前一天）
// 昨天的实际天气来自 Open-Meteo archive。还没出来就写「待判」，下次再判；
// 最近几天的 archive 数值以后可能被再分析数据修正，月底复盘用 replay.mjs 整月重判一次。
import { decisionSummary } from "../content/kelly-dog-walk-app/app/js/view-model.js";
import {
  VERDICT,
  decideHour,
  isoWeekday,
  judgeWalk,
  parseJudgeRules,
  parseRuleCard,
  weekdayLabel,
} from "../content/kelly-dog-walk-app/app/js/walk-model.js";
import { lazyBusabase, loadJudgeSource, loadPlaybookSource, parseArgs, run } from "./lib/cli.mjs";
import { HOURS, fetchActualDay, fetchForecastDay, fetchRange, resolvePlace } from "./lib/open-meteo.mjs";

const localDate = (timezone, offsetDays = 0, from = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone === "auto" ? "Asia/Shanghai" : timezone }).format(
    new Date(from.getTime() + offsetDays * 86_400_000),
  );

const shift = (date, days) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

run(async () => {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["write", "geocode", "json"],
    values: ["city", "date", "playbook", "judge", "lat", "lon", "timezone", "folder"],
  });
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
  const today = args.date || localDate(place.timezone);
  const yesterday = shift(today, -1);

  // 1. 今天：只看预报，按规则卡定钟点。
  const forecast = await fetchForecastDay(place, today);
  if (!forecast) throw new Error(`Open-Meteo 没有 ${today} 的预报`);
  const day = {
    date: today,
    hours: Object.fromEntries(HOURS.map((hour, i) => [hour, { prob: forecast[i][0], ftemp: forecast[i][1] }])),
  };
  const decision = decideHour(day, card);
  const at = day.hours[decision.hour];
  const todayRow = {
    date: today,
    month: today.slice(0, 7),
    weekday: isoWeekday(today),
    city: place.name,
    hour: decision.hour,
    rule: decision.rule,
    reason: decision.reason,
    prob: at.prob,
    ftemp: at.ftemp,
    rain: null,
    temp: null,
    version: card.version,
    ...judgeWalk(null, decision.hour, judge),
  };
  console.log(
    `${place.name} ${today}（${weekdayLabel(todayRow.weekday)}）· 遛狗手册 ${card.version}（${playbook.label}）`,
  );
  console.log(`  今天 ${decision.hour} 点遛。${decision.reason}。`);
  if (todayRow.off) console.log(`  注意：${decision.hour} 点不在裁判规则的主人方便时段里，会被判「不方便」。`);

  // 2. 昨天：拿实际天气给昨天的决定判结论。
  const actual = await fetchActualDay(place, yesterday);
  /** @type {any} */
  let yesterdayResult = null;
  if (args.write || playbookSpec === "busabase") {
    const { client, ws, findDecision } = await busabase();
    const stored = await findDecision(client, ws, place.name, yesterday);
    if (!stored) console.log(`  昨天（${yesterday}）的「每天的决定」里没有记录，跳过判定。`);
    else {
      const hour = Number(stored.fields["walk-hour"]);
      const verdict = judgeWalk(actual[hour], hour, judge);
      yesterdayResult = { recordId: stored.id, hour, actual: actual[hour] || null, ...verdict };
    }
  } else {
    // 没连 Busabase：按同一本手册把昨天重新决定一遍，再判。
    const days = await fetchRange(place, yesterday, yesterday);
    const cells = days[yesterday];
    if (cells) {
      const past = {
        date: yesterday,
        hours: Object.fromEntries(
          HOURS.map((hour, i) => [
            hour,
            { prob: cells[i][0], ftemp: cells[i][1], rain: cells[i][2], temp: cells[i][3] },
          ]),
        ),
      };
      const pick = decideHour(past, card);
      yesterdayResult = {
        hour: pick.hour,
        actual: past.hours[pick.hour],
        ...judgeWalk(past.hours[pick.hour], pick.hour, judge),
      };
    }
  }
  if (yesterdayResult) {
    const a = yesterdayResult.actual;
    console.log(
      yesterdayResult.pending
        ? `  昨天（${yesterday}）${yesterdayResult.hour} 点：archive 还没有实际数据，先记「待判」。`
        : `  昨天（${yesterday}）${yesterdayResult.hour} 点：实际降水 ${a.rain} mm、${a.temp}°C → ${yesterdayResult.verdict}`,
    );
  }

  if (args.write) {
    const { client, ws, upsertWeather, upsertDecisions, updateDecision, playbookClient } = await busabase();
    // Decided from the 遛狗手册 in Busabase → the write cites it (通过做事手册「遛狗手册」).
    const writer = playbook.nodeId ? playbookClient(playbook.nodeId) : client;
    /** @type {Array<Record<string, any>>} */
    const weatherRows = HOURS.map((hour, i) => ({
      city: place.name,
      date: today,
      hour,
      "forecast-precip-prob": forecast[i][0],
      "forecast-temp": forecast[i][1],
    }));
    for (const hour of HOURS) {
      if (actual[hour] && actual[hour].rain !== null) {
        weatherRows.push({
          city: place.name,
          date: yesterday,
          hour,
          "actual-precip-mm": actual[hour].rain,
          "actual-temp": actual[hour].temp,
        });
      }
    }
    const weather = await upsertWeather(client, ws, weatherRows, `每日抓取天气：${place.name} ${today}`);
    const decisions = await upsertDecisions(
      writer,
      ws,
      [todayRow],
      `今天几点遛：${place.name} ${today}，遛狗手册 ${card.version}`,
    );
    console.log(
      `  天气数据：新增 ${weather.created}、更新 ${weather.updated}；每天的决定：新增 ${decisions.created}、更新 ${decisions.updated}`,
    );
    if (yesterdayResult?.recordId && !yesterdayResult.pending) {
      await updateDecision(
        client,
        ws,
        yesterdayResult.recordId,
        {
          summary: decisionSummary(yesterdayResult.hour, yesterdayResult.verdict),
          "actual-precip-mm": yesterdayResult.actual.rain,
          "actual-temp": yesterdayResult.actual.temp,
          verdict: yesterdayResult.verdict,
        },
        `判昨天：${place.name} ${yesterday} → ${yesterdayResult.verdict}（裁判规则 ${judge.version}）`,
      );
      console.log(`  已把昨天的结论写进「每天的决定」：${yesterdayResult.verdict}`);
    }
  }
  if (args.json) console.log(JSON.stringify({ today: todayRow, yesterday: yesterdayResult }, null, 2));
  if (todayRow.verdict !== VERDICT.pending) throw new Error("今天的决定不应该已经有结论");
});
