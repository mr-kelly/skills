// Turns stored decisions into what the calendar draws. Pure: the demo provider and the Busabase
// provider both hand it rows, so both modes render through exactly the same code.
import { VERDICT, isoWeekday, judgeWalk, parsePlaybookHistory, summarize } from "./walk-model.js";

const num = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

/** A replayed or decided day (walk-model's row shape) → the 每天的决定 field slugs. */
export const decisionFields = (row) => ({
  date: row.date,
  city: row.city,
  "walk-hour": row.hour,
  "rule-applied": row.reason,
  "forecast-precip-prob": row.prob,
  "forecast-temp": row.ftemp,
  "actual-precip-mm": row.pending ? null : row.rain,
  "actual-temp": row.pending ? null : row.temp,
  verdict: row.verdict,
  "playbook-version": row.version,
  month: row.month,
});

/**
 * One 每天的决定 row (Busabase field slugs, or the demo's identical shape) → a calendar day.
 * Flags are recomputed from the facts with the judge's thresholds: the stored 结论 is one label
 * per day, but 淋雨, 太热 and 不方便 are counted separately, and a day can be both wet and hot.
 */
export const dayFromDecision = (fields, judge) => {
  const date = String(fields.date || "").slice(0, 10);
  const hour = num(fields["walk-hour"]);
  const rain = num(fields["actual-precip-mm"]);
  const temp = num(fields["actual-temp"]);
  const stored = fields.verdict || "";
  const flags =
    judge && hour !== null && (rain !== null || temp !== null)
      ? judgeWalk({ rain, temp }, hour, judge)
      : {
          wet: stored === VERDICT.wet,
          hot: stored === VERDICT.hot,
          off: stored === VERDICT.off,
          pending: !stored || stored === VERDICT.pending,
          verdict: stored || VERDICT.pending,
        };
  return {
    date,
    month: fields.month || date.slice(0, 7),
    weekday: isoWeekday(date),
    city: fields.city || "",
    hour,
    reason: fields["rule-applied"] || "",
    rule: fields.rule || "",
    prob: num(fields["forecast-precip-prob"]),
    ftemp: num(fields["forecast-temp"]),
    rain,
    temp,
    version: fields["playbook-version"] || "",
    storedVerdict: stored,
    ...flags,
  };
};

/** The playbook version that was in force for most days of a month (a mid-month merge shows both). */
const versionsOf = (days) => {
  const counts = new Map();
  for (const day of days) counts.set(day.version, (counts.get(day.version) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([version]) => version)
    .filter(Boolean);
};

/**
 * Months, newest last. `baselineByDate` maps a date to that day's weather at the baseline hour
 * (`{ rain, temp }`), so "still using v1" can be judged with the same thresholds.
 */
/**
 * @param {ReturnType<typeof dayFromDecision>[]} days
 * @param {{ judge?: any, baselineHour?: number, baselineByDate?: Record<string, { rain: number, temp: number | null }> | null, judgeByMonth?: Record<string, string> }} [options]
 */
export const buildMonths = (days, { judge, baselineHour = 18, baselineByDate = null, judgeByMonth = {} } = {}) => {
  const byMonth = new Map();
  for (const day of days) {
    if (!day.date) continue;
    if (!byMonth.has(day.month)) byMonth.set(day.month, []);
    byMonth.get(day.month).push(day);
  }
  return [...byMonth.keys()].sort().map((month) => {
    const monthDays = byMonth.get(month).sort((a, b) => a.date.localeCompare(b.date));
    let baseline = null;
    if (baselineByDate && judge) {
      const judged = monthDays
        .map((day) => {
          const weather = baselineByDate[day.date];
          if (!weather) return null;
          return { date: day.date, hour: baselineHour, ...judgeWalk(weather, baselineHour, judge) };
        })
        .filter(Boolean);
      baseline = { hour: baselineHour, covered: judged.length, summary: summarize(judged) };
    }
    return {
      month,
      versions: versionsOf(monthDays),
      judgeVersion: judgeByMonth[month] || judge?.version || "",
      days: monthDays,
      summary: summarize(monthDays),
      baseline,
    };
  });
};

/** 42 cells (Monday-first) covering a `YYYY-MM` month; `null` for the padding days. */
export const monthGrid = (month) => {
  const [year, mon] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
};

/**
 * The version timeline: the playbook's own 版本记录 and 已退休 sections, plus — where the
 * provider knows them — proposals that were closed without merging and judge changes.
 */
export const buildTimeline = (playbookMarkdown, months, { closed = [], judgeChanges = [] } = {}) => {
  const history = parsePlaybookHistory(playbookMarkdown);
  const retiredFor = (version) => history.retired.find((entry) => entry.rule.includes(`（${version}`));
  return {
    current: history.current,
    versions: history.versions.map((entry) => ({
      ...entry,
      isCurrent: entry.version === history.current,
      retired: retiredFor(entry.version) || null,
      monthResult: months.find((month) => month.versions[0] === entry.version && month.month === entry.month) || null,
    })),
    retired: history.retired,
    closed,
    judgeChanges,
  };
};

/** Totals across months, for the in-force playbooks and for the baseline. */
export const totals = (months) => {
  const add = (pick) =>
    months.reduce(
      (sum, month) => {
        const summary = pick(month);
        if (!summary) return sum;
        return {
          wet: sum.wet + summary.wet,
          hot: sum.hot + summary.hot,
          off: sum.off + summary.off,
          days: sum.days + summary.days,
        };
      },
      { wet: 0, hot: 0, off: 0, days: 0 },
    );
  return { inForce: add((month) => month.summary), baseline: add((month) => month.baseline?.summary) };
};
