// Open-Meteo: the judge's data source. Free, no key, reachable from mainland China, covers any city.
//
//   place name → lat/lon/timezone   geocoding-api.open-meteo.com/v1/search
//   the forecast as it was then     historical-forecast-api.open-meteo.com/v1/forecast  (precipitation_probability, temperature_2m)
//   what actually happened          archive-api.open-meteo.com/v1/archive               (precipitation, temperature_2m)
//   today's forecast (daily mode)   api.open-meteo.com/v1/forecast                     (precipitation_probability, temperature_2m)
//
// Only hours 6–22 are kept — the widest window any playbook in this skill may walk in. One month
// is stored as one compact JSON file, the same shape for the local cache and for the recorded
// fixtures under references/open-meteo/, so a replay reads either without knowing which.
//
// Zero dependencies: global fetch (Node ≥ 18) and node:fs.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
export const FORMAT = "kelly-dog-walk/open-meteo@1";
export const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "references",
  "open-meteo",
);

/**
 * Places whose coordinates are pinned rather than geocoded.
 *
 * 上海 is pinned to 31.23, 121.47 because that is the point the course's numbers were measured
 * at. The geocoder answers 上海 with 31.2222, 121.4581 — 1.5 km away, a different Open-Meteo grid
 * cell, and a different month: July under v1 is 11 wet walks there, not 9. A judge has to measure
 * the same place every time, so a city keeps one point. `--lat/--lon` still override this.
 */
export const PINNED_PLACES = Object.freeze({
  上海: {
    name: "上海",
    latitude: 31.23,
    longitude: 121.47,
    timezone: "Asia/Shanghai",
    note: "固定坐标，课程数据用的点",
  },
});

export const cacheDir = () =>
  process.env.KELLY_DOG_WALK_CACHE || path.join(os.homedir(), ".cache", "kelly-dog-walk", "open-meteo");

const getJson = async (url, { attempts = 3 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) throw new Error(body.reason || `HTTP ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw new Error(`Open-Meteo 请求失败：${lastError instanceof Error ? lastError.message : lastError}（${url}）`);
};

/** City name → `{ name, latitude, longitude, timezone }`, pinned first, then the geocoder. */
export const resolvePlace = async ({ city, lat, lon, timezone, geocode = false }) => {
  if (lat !== undefined && lon !== undefined) {
    return {
      name: city || `${lat},${lon}`,
      latitude: Number(lat),
      longitude: Number(lon),
      timezone: timezone || PINNED_PLACES[city]?.timezone || "auto",
      note: "命令行指定坐标",
    };
  }
  if (!city) throw new Error("要说一个城市：--city 上海");
  if (!geocode && PINNED_PLACES[city]) return { ...PINNED_PLACES[city] };
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const body = await getJson(url);
  const hit = body.results?.[0];
  if (!hit) throw new Error(`Open-Meteo 找不到这个地方：${city}`);
  return {
    name: city,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone || "auto",
    note: `地名解析：${[hit.name, hit.admin1, hit.country].filter(Boolean).join("，")}`,
  };
};

export const monthBounds = (month) => {
  const match = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`月份要写成 2026-06 这样：${month}`);
  const [year, mon] = [Number(match[1]), Number(match[2])];
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}`, days: last };
};

const tz = (place) => encodeURIComponent(place.timezone || "auto");

/** Raw Open-Meteo hourly arrays for [start, end] → `{ date: [[prob, ftemp, rain, temp] × HOURS] }`. */
const compactDays = (forecast, actual) => {
  const days = {};
  const index = new Map();
  if (actual) actual.hourly.time.forEach((time, i) => index.set(time, i));
  forecast.hourly.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13));
    if (!HOURS.includes(hour)) return;
    const date = time.slice(0, 10);
    const j = index.get(time);
    days[date] ||= HOURS.map(() => [null, null, null, null]);
    days[date][HOURS.indexOf(hour)] = [
      forecast.hourly.precipitation_probability?.[i] ?? null,
      forecast.hourly.temperature_2m?.[i] ?? null,
      j === undefined ? null : (actual.hourly.precipitation?.[j] ?? null),
      j === undefined ? null : (actual.hourly.temperature_2m?.[j] ?? null),
    ];
  });
  return days;
};

const coords = (place) => `latitude=${place.latitude}&longitude=${place.longitude}`;

/** Fetch forecast-as-it-was plus actuals for a date range, straight from the API. */
export const fetchRange = async (place, start, end) => {
  const forecast = await getJson(
    `https://historical-forecast-api.open-meteo.com/v1/forecast?${coords(place)}&start_date=${start}&end_date=${end}&hourly=precipitation_probability,temperature_2m&timezone=${tz(place)}`,
  );
  const actual = await getJson(
    `https://archive-api.open-meteo.com/v1/archive?${coords(place)}&start_date=${start}&end_date=${end}&hourly=precipitation,temperature_2m&timezone=${tz(place)}`,
  );
  return compactDays(forecast, actual);
};

/** Today's (or any near date's) forecast from the live forecast API. No actuals yet. */
export const fetchForecastDay = async (place, date) => {
  const forecast = await getJson(
    `https://api.open-meteo.com/v1/forecast?${coords(place)}&start_date=${date}&end_date=${date}&hourly=precipitation_probability,temperature_2m&timezone=${tz(place)}`,
  );
  return compactDays(forecast, null)[date] || null;
};

/** One past day's actuals from the archive. `null` hours mean the archive has not caught up yet. */
export const fetchActualDay = async (place, date) => {
  const actual = await getJson(
    `https://archive-api.open-meteo.com/v1/archive?${coords(place)}&start_date=${date}&end_date=${date}&hourly=precipitation,temperature_2m&timezone=${tz(place)}`,
  );
  const hours = {};
  actual.hourly.time.forEach((time, i) => {
    const hour = Number(time.slice(11, 13));
    if (HOURS.includes(hour))
      hours[hour] = { rain: actual.hourly.precipitation?.[i] ?? null, temp: actual.hourly.temperature_2m?.[i] ?? null };
  });
  return hours;
};

const sameSpot = (a, b) =>
  Math.abs(Number(a.latitude) - Number(b.latitude)) < 1e-6 &&
  Math.abs(Number(a.longitude) - Number(b.longitude)) < 1e-6;

/** One file per month: one line per day, so a re-recording diffs by day. */
export const serializeMonth = (data) => {
  const head = {
    format: FORMAT,
    place: data.place,
    month: data.month,
    hours: HOURS,
    fields: ["prob", "ftemp", "rain", "temp"],
    sources: {
      forecast: "https://historical-forecast-api.open-meteo.com/v1/forecast",
      actual: "https://archive-api.open-meteo.com/v1/archive",
    },
    recordedAt: data.recordedAt,
  };
  const lines = Object.keys(data.days)
    .sort()
    .map((date) => `    ${JSON.stringify(date)}: ${JSON.stringify(data.days[date])}`);
  const headText = JSON.stringify(head, null, 2)
    .replace(/\n}$/, "")
    .replace(/"(hours|fields)": \[[^\]]*\]/g, (_, key) => `"${key}": ${JSON.stringify(head[key])}`);
  return `${headText},\n  "days": {\n${lines.join(",\n")}\n  }\n}\n`;
};

const placeKey = (place) => `${Number(place.latitude).toFixed(4)},${Number(place.longitude).toFixed(4)}`;

const readMonthFile = async (file) => {
  const data = JSON.parse(await readFile(file, "utf8"));
  if (data.format !== FORMAT) throw new Error(`${file} 不是 ${FORMAT}`);
  return data;
};

export const findFixture = async (place, month, dir = FIXTURES_DIR) => {
  for (const name of await readdir(dir).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    const data = await readMonthFile(path.join(dir, name));
    if (data.month === month && sameSpot(data.place, place)) return { data, file: path.join(dir, name) };
  }
  return null;
};

const complete = (data, expectedDays) =>
  Object.keys(data.days).length === expectedDays &&
  Object.values(data.days).every((hours) => hours.every((cell) => cell[2] !== null && cell[3] !== null));

/**
 * A month of hours 6–22 for one place.
 *
 *   source "auto"      cache → live (and cache the result when the month is complete)
 *   source "live"      always ask Open-Meteo (still refreshes the cache)
 *   source "fixtures"  only the recorded files under references/open-meteo/ — offline and deterministic
 *   source "cache"     only the local cache
 *
 * A month that is not over yet is fetched up to `until` (default: yesterday) and never cached.
 */
/**
 * @param {{ name: string, latitude: number, longitude: number, timezone: string }} place
 * @param {string} month
 * @param {{ source?: string, until?: string, now?: Date }} [options]
 */
export const loadMonth = async (place, month, options = {}) => {
  const { source = "auto", until, now = new Date() } = options;
  const bounds = monthBounds(month);
  if (source === "fixtures") {
    const hit = await findFixture(place, month);
    if (!hit) throw new Error(`没有 ${place.name} ${month} 的录制数据（references/open-meteo/）`);
    return { ...hit.data, origin: "fixture", file: hit.file };
  }
  const cacheFile = path.join(cacheDir(), placeKey(place), `${month}.json`);
  if (source === "auto" || source === "cache") {
    const cached = await readMonthFile(cacheFile).catch(() => null);
    if (cached) return { ...cached, origin: "cache", file: cacheFile };
    if (source === "cache") throw new Error(`本地缓存里没有 ${place.name} ${month}`);
  }
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const last = until || yesterday;
  if (last < bounds.start) throw new Error(`${month} 还没开始，没有可回放的日子`);
  const end = last < bounds.end ? last : bounds.end;
  const data = {
    place: { name: place.name, latitude: place.latitude, longitude: place.longitude, timezone: place.timezone },
    month,
    recordedAt: now.toISOString().slice(0, 10),
    days: await fetchRange(place, bounds.start, end),
  };
  if (complete(data, bounds.days)) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, serializeMonth(data));
  }
  return { ...data, format: FORMAT, hours: HOURS, origin: "live", partial: end !== bounds.end, file: null };
};
