#!/usr/bin/env node
// 抓取天气：Open-Meteo 的逐时预报和实际天气（早 6 点到晚 10 点），按月或今天。
//
//   node scripts/weather.mjs --city 上海 --month 2026-06               # 看一个月（本地有缓存就用缓存）
//   node scripts/weather.mjs --city 上海 --month 2026-06 --write       # 再写进 Busabase「天气数据」
//   node scripts/weather.mjs --city 上海 --today [--write]              # 今天的预报 + 昨天的实际
//   node scripts/weather.mjs --city 北京 --month 2026-07 --geocode     # 任何城市：按地名解析坐标
//   node scripts/weather.mjs --city 上海 --month 2026-06 --source live --out references/open-meteo/shanghai-2026-06.json
//
// --source auto|live|cache|fixtures   auto = 本地缓存，没有再问 Open-Meteo（默认）
// --lat/--lon/--timezone              自己指定坐标（上海默认固定在 31.23, 121.47，见 lib/open-meteo.mjs）
// --write 需要 BUSABASE_BASE_URL / BUSABASE_API_KEY / BUSABASE_SPACE_ID（Agent 自己的成员账号）。
import { writeFile } from "node:fs/promises";
import { lazyBusabase, parseArgs, run } from "./lib/cli.mjs";
import { HOURS, fetchActualDay, fetchForecastDay, loadMonth, resolvePlace, serializeMonth } from "./lib/open-meteo.mjs";

const shanghaiDate = (offsetDays, timezone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone === "auto" ? "Asia/Shanghai" : timezone }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

run(async () => {
  const args = parseArgs(process.argv.slice(2), {
    flags: ["write", "today", "geocode", "json"],
    values: ["city", "month", "source", "lat", "lon", "timezone", "out", "folder", "date"],
  });
  const place = await resolvePlace({
    city: args.city,
    lat: args.lat,
    lon: args.lon,
    timezone: args.timezone,
    geocode: args.geocode,
  });
  const where = `${place.name}（${place.latitude}, ${place.longitude} · ${place.note}）`;
  const rows = [];

  if (args.today) {
    const today = args.date || shanghaiDate(0, place.timezone);
    const yesterday = shanghaiDate(-1, place.timezone);
    const forecast = await fetchForecastDay(place, today);
    const actual = await fetchActualDay(place, yesterday);
    if (!forecast) throw new Error(`Open-Meteo 没有给出 ${today} 的预报`);
    console.log(`${where} ${today} 逐时预报（降水概率 / 气温）：`);
    HOURS.forEach((hour, i) => {
      const [prob, ftemp] = forecast[i];
      console.log(`  ${String(hour).padStart(2)} 点  ${String(prob ?? "—").padStart(3)}%  ${ftemp ?? "—"}°C`);
      rows.push({ city: place.name, date: today, hour, "forecast-precip-prob": prob, "forecast-temp": ftemp });
    });
    const known = HOURS.filter((hour) => actual[hour]?.rain !== null && actual[hour]?.rain !== undefined);
    console.log(
      `${yesterday} 实际天气：${known.length ? `${known.length} 个钟点有数据` : "archive 还没有数据，明天再判"}`,
    );
    for (const hour of known) {
      rows.push({
        city: place.name,
        date: yesterday,
        hour,
        "actual-precip-mm": actual[hour].rain,
        "actual-temp": actual[hour].temp,
      });
    }
  } else {
    if (!args.month) throw new Error("要说一个月份：--month 2026-06（或者用 --today）");
    const data = await loadMonth(place, args.month, { source: args.source || "auto" });
    const dates = Object.keys(data.days).sort();
    let rainyHours = 0;
    for (const date of dates) {
      data.hours.forEach((hour, i) => {
        const [prob, ftemp, rain, temp] = data.days[date][i];
        if (Number(rain) >= 0.2) rainyHours++;
        rows.push({
          city: place.name,
          date,
          hour,
          "forecast-precip-prob": prob,
          "forecast-temp": ftemp,
          "actual-precip-mm": rain,
          "actual-temp": temp,
        });
      });
    }
    const origin = { fixture: "录制的数据", cache: "本地缓存", live: "Open-Meteo 实时请求" }[data.origin];
    console.log(
      `${where} ${args.month}：${dates.length} 天 × ${data.hours.length} 个钟点（${data.hours[0]}–${data.hours.at(-1)} 点），下雨（≥ 0.2 mm）的钟点 ${rainyHours} 个。来源：${origin}${data.partial ? "（这个月还没过完）" : ""}`,
    );
    if (args.out) {
      await writeFile(args.out, serializeMonth(data));
      console.log(`已写入 ${args.out}`);
    }
  }

  if (args.write) {
    const { client, ws, upsertWeather } = await lazyBusabase(args.folder)();
    const result = await upsertWeather(
      client,
      ws,
      rows,
      `抓取天气：${place.name} ${args.month || "今天"}（Open-Meteo）`,
    );
    console.log(
      `天气数据：新增 ${result.created} 行，更新 ${result.updated} 行，没变 ${result.unchanged} 行${result.pending.length ? `；待审核变更请求 ${result.pending.join("、")}` : ""}`,
    );
  }
  if (args.json) console.log(JSON.stringify({ place, rows }, null, 2));
});
