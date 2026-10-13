/**
 * 遛狗不淋雨 — the pure decision and judge logic.
 *
 * One module, shared by the trusted scripts (`skills/kelly-dog-walk/scripts/*.mjs`)
 * and the AirApp. It never fetches, never touches a file, never reads the clock:
 * everything it knows arrives as arguments. That is what makes a replay of a past
 * month reproducible, and it is why the AirApp's "still using v1" chart and the
 * scripts' `--compare` give the same numbers.
 *
 * It is a faithful port of the course's throwaway `walk-story.py`:
 *
 *   walk-story.py      →  this module
 *   rule_v1            →  规则卡 v1  (换钟点条件: 无)
 *   rule_v2            →  规则卡 v2  (换钟点条件: 默认钟点预报降水概率 ≥ 50%)
 *   rule_greedy        →  规则卡 v3  (方便时段: 6-22, 换钟点条件: 总是)
 *   rule_v3            →  规则卡 v4  (v2 + 不遛条件: 预报气温 ≥ 32°C)
 *   score()            →  replayMonth() + summarize()
 *
 * Tie-breaks follow Python's `min(hours, key=(prob, abs(h - 18)))`: lowest
 * forecast precipitation probability, then closest to the default hour, then the
 * earlier hour (the first one `min` meets in an ascending list).
 *
 * A day is `{ date: "2026-06-01", hours: { 6: { prob, ftemp, rain, temp }, …, 22: … } }`:
 *   prob  — forecast precipitation probability (%), from the historical-forecast API
 *   ftemp — forecast temperature (°C), same source
 *   rain  — actual precipitation (mm) in the hour ending at that time, from the archive API
 *   temp  — actual temperature (°C), archive API
 */

export const VERDICT = Object.freeze({ dry: "没淋", wet: "淋雨", hot: "太热", off: "不方便", pending: "待判" });

/** One label per day for the 结论 field: wet beats hot beats off. Every flag is still counted on its own. */
export const VERDICT_PRECEDENCE = Object.freeze(["淋雨", "太热", "不方便", "没淋"]);

export const VERDICT_CHOICES = Object.freeze(["没淋", "淋雨", "太热", "不方便", "待判"]);

const WEEKDAYS_ZH = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** ISO weekday, 1 = Monday … 7 = Sunday, for a `YYYY-MM-DD` date (calendar date, no time zone involved). */
export const isoWeekday = (date) => {
  const [y, m, d] = String(date).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
};

export const weekdayLabel = (weekday) => WEEKDAYS_ZH[weekday] || "";

// ── Parsing the markdown the human owns ────────────────────────────────────

/** The body of the first fenced code block whose info string is exactly `info`. */
export const fencedBlock = (markdown, info) => {
  const fence = /^(`{3,}|~{3,})[ \t]*([^\n`]*)\n([\s\S]*?)^\1[ \t]*$/gm;
  for (const match of String(markdown || "").matchAll(fence)) {
    if (match[2].trim() === info) return match[3];
  }
  return null;
};

const keyValues = (block) => {
  const values = {};
  for (const line of block.split("\n")) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const match = text.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
};

const NONE = /^(无|没有|none|-)$/i;

/** `"7, 8, 17-21"` → `[7, 8, 17, 18, 19, 20, 21]`. Accepts `,` `，` `、` and `-` `–` `~` `到`. */
export const parseHours = (text) => {
  const normalized = String(text || "")
    .replace(/点/g, "")
    .replace(/\s*[-–—~～到至]\s*/g, "-");
  const hours = new Set();
  for (const part of normalized.split(/[,，、\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d{1,2})-(\d{1,2})$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from > to) throw new Error(`钟点范围写反了：${part}`);
      for (let hour = from; hour <= to; hour++) hours.add(hour);
      continue;
    }
    if (!/^\d{1,2}$/.test(part)) throw new Error(`看不懂的钟点：「${part}」`);
    hours.add(Number(part));
  }
  for (const hour of hours) {
    if (hour < 0 || hour > 23) throw new Error(`钟点要在 0–23 之间：${hour}`);
  }
  if (!hours.size) throw new Error("方便时段是空的");
  return [...hours].sort((a, b) => a - b);
};

const firstNumber = (text) => {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

const atLeast = (text, subject) => {
  const match = String(text || "").match(new RegExp(`${subject}[^≥>\\d]*(?:≥|>=)\\s*(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
};

/**
 * The 规则卡 block of a 遛狗手册 SKILL.md — the only part a script acts on.
 *
 * ```规则卡
 * 版本: v1
 * 方便时段: 7, 8, 17, 18, 19, 20, 21
 * 默认钟点: 18
 * 换钟点条件: 无                        | 总是 | 默认钟点预报降水概率 ≥ 50%
 * 不遛条件: 无                          | 预报气温 ≥ 32°C
 * ```
 *
 * Throws on anything it does not understand: a card that is half-read is a
 * playbook that silently does something nobody wrote.
 */
export const parseRuleCard = (markdown) => {
  const block = fencedBlock(markdown, "规则卡");
  if (block === null) throw new Error("遛狗手册里没有找到 ```规则卡 代码块");
  const values = keyValues(block);
  for (const key of ["版本", "方便时段", "默认钟点", "换钟点条件", "不遛条件"]) {
    if (!(key in values)) throw new Error(`规则卡缺少「${key}」`);
  }
  const version = values.版本;
  if (!/^v\d+$/.test(version)) throw new Error(`规则卡的版本要写成 v1、v2 这样：${version}`);
  const hours = parseHours(values.方便时段);
  const defaultHour = firstNumber(values.默认钟点);
  if (defaultHour === null || !Number.isInteger(defaultHour)) throw new Error(`看不懂默认钟点：${values.默认钟点}`);
  if (!hours.includes(defaultHour)) throw new Error(`默认钟点 ${defaultHour} 点不在方便时段里`);

  let switchRule;
  const switchText = values.换钟点条件;
  if (NONE.test(switchText)) switchRule = { kind: "never" };
  else if (/^(总是|每天)/.test(switchText)) switchRule = { kind: "always" };
  else {
    const threshold = atLeast(switchText, "降水概率");
    if (threshold === null) throw new Error(`看不懂换钟点条件：${switchText}`);
    switchRule = { kind: "rain", atLeast: threshold };
  }

  let skipRule;
  const skipText = values.不遛条件;
  if (NONE.test(skipText)) skipRule = { kind: "none" };
  else {
    const threshold = atLeast(skipText, "气温");
    if (threshold === null) throw new Error(`看不懂不遛条件：${skipText}`);
    skipRule = { kind: "heat", atLeast: threshold };
  }

  return { version, hours, defaultHour, switchRule, skipRule, text: values };
};

/** Write a parsed card back as the exact block text — used to keep the human rules and the card in sync. */
export const formatRuleCard = (card) =>
  [
    `版本: ${card.version}`,
    `方便时段: ${card.hours.join(", ")}`,
    `默认钟点: ${card.defaultHour}`,
    `换钟点条件: ${
      card.switchRule.kind === "never"
        ? "无"
        : card.switchRule.kind === "always"
          ? "总是"
          : `默认钟点预报降水概率 ≥ ${card.switchRule.atLeast}%`
    }`,
    `不遛条件: ${card.skipRule.kind === "none" ? "无" : `预报气温 ≥ ${card.skipRule.atLeast}°C`}`,
  ].join("\n");

/**
 * The 裁判规则 block of the judge Doc. Scripts read every threshold from here
 * rather than hardcoding one, so a human who edits the Doc changes the judge.
 *
 * ```裁判规则
 * 版本: v1
 * 淋雨: 实际降水 ≥ 0.2 mm
 * 太热: 实际气温 ≥ 32°C
 * 主人方便时段: 7, 8, 17, 18, 19, 20, 21
 * 主指标: 淋雨次数
 * 护栏: 无                              | 太热 0 次, 不方便 0 次
 * 证据门槛: 无                          | 换一个月也要赢; 同一个月和旧手册对照
 * ```
 */
export const parseJudgeRules = (markdown) => {
  const block = fencedBlock(markdown, "裁判规则");
  if (block === null) throw new Error("裁判规则文档里没有找到 ```裁判规则 代码块");
  const values = keyValues(block);
  for (const key of ["版本", "淋雨", "太热", "主人方便时段", "主指标", "护栏", "证据门槛"]) {
    if (!(key in values)) throw new Error(`裁判规则缺少「${key}」`);
  }
  const wetMm = atLeast(values.淋雨, "降水");
  const hotC = atLeast(values.太热, "气温");
  if (wetMm === null) throw new Error(`看不懂淋雨阈值：${values.淋雨}`);
  if (hotC === null) throw new Error(`看不懂太热阈值：${values.太热}`);
  if (!/淋雨/.test(values.主指标)) throw new Error(`这个版本的脚本只会按淋雨次数打分：${values.主指标}`);

  let guardrails = null;
  if (!NONE.test(values.护栏)) {
    const hot = values.护栏.match(/太热\s*(\d+)\s*次/);
    const off = values.护栏.match(/不方便\s*(\d+)\s*次/);
    if (!hot && !off) throw new Error(`看不懂护栏：${values.护栏}`);
    guardrails = { hot: hot ? Number(hot[1]) : null, off: off ? Number(off[1]) : null };
  }
  const evidenceText = values.证据门槛;
  const evidence = NONE.test(evidenceText)
    ? { otherMonth: false, sameMonthControl: false }
    : { otherMonth: /换一个月/.test(evidenceText), sameMonthControl: /同一个月/.test(evidenceText) };

  return {
    version: values.版本,
    wetMm,
    hotC,
    ownerHours: parseHours(values.主人方便时段),
    primary: "wet",
    guardrails,
    evidence,
    text: values,
  };
};

/**
 * `## 版本记录` and `## 已退休` from a 遛狗手册 — the timeline the AirApp draws.
 *
 *   - v2 · 2026-07 起 · 加：……。为什么：……
 *   - P5「……」（v3，2026-08 退休）。原因：……
 */
export const parsePlaybookHistory = (markdown) => {
  const section = (title) => {
    const text = String(markdown || "");
    const start = text.search(new RegExp(`^##\\s+${title}\\s*$`, "m"));
    if (start === -1) return "";
    const rest = text.slice(start).split("\n").slice(1).join("\n");
    const end = rest.search(/^##\s+/m);
    return end === -1 ? rest : rest.slice(0, end);
  };
  const versions = [];
  for (const line of section("版本记录").split("\n")) {
    const match = line.match(/^\s*-\s*(v\d+)\s*·\s*([^·]+?)\s*·\s*(.+)$/);
    if (!match) continue;
    const [change, why = ""] = match[3].split(/为什么[:：]/);
    const month = match[2].match(/(\d{4}-\d{2})/)?.[1] || "";
    versions.push({ version: match[1], from: match[2].trim(), month, change: change.trim(), why: why.trim() });
  }
  const retired = [];
  for (const line of section("已退休").split("\n")) {
    const match = line.match(/^\s*-\s*(.+)$/);
    if (!match) continue;
    const [rule, reason = ""] = match[1].split(/原因[:：]/);
    retired.push({ rule: rule.trim().replace(/[。.]$/, ""), reason: reason.trim() });
  }
  const current = String(markdown || "").match(/当前版本[:：]\s*(v\d+)/)?.[1] || "";
  return { current, versions, retired };
};

// ── Deciding ───────────────────────────────────────────────────────────────

const probOf = (day, hour) => Number(day.hours?.[hour]?.prob ?? 0);
const isHot = (value, threshold) => value !== null && value !== undefined && Number(value) >= threshold;

const pct = (value) => `${Math.round(Number(value ?? 0))}%`;
const deg = (value) => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}°C`);

/**
 * Pick the walk hour for one day from its forecast, exactly as the rule card says.
 * Reads only `prob` and `ftemp` — the decision never sees what actually happened.
 *
 * Returns `{ hour, rule, reason }`: `rule` is a stable code, `reason` is the
 * sentence written into 每天的决定.依据规则.
 */
export const decideHour = (day, card) => {
  const target = card.defaultHour;
  let candidates = card.hours;
  let heatNote = "";
  if (card.skipRule.kind === "heat") {
    const cool = candidates.filter((hour) => !isHot(day.hours?.[hour]?.ftemp, card.skipRule.atLeast));
    if (cool.length) {
      if (!cool.includes(target) && candidates.includes(target)) {
        heatNote = `${target} 点预报 ${deg(day.hours?.[target]?.ftemp)} ≥ ${card.skipRule.atLeast}°C，不遛这个钟点；`;
      }
      candidates = cool;
    } else {
      heatNote = `方便时段全都预报 ≥ ${card.skipRule.atLeast}°C，照常按降水概率挑；`;
    }
  }
  const driest = () =>
    [...candidates].sort(
      (a, b) => probOf(day, a) - probOf(day, b) || Math.abs(a - target) - Math.abs(b - target) || a - b,
    )[0];
  const picked = (hour, rule, lead) => ({
    hour,
    rule,
    reason: `${heatNote}${lead}${hour} 点（降水概率 ${pct(probOf(day, hour))}）`,
  });
  // Only reachable when the default hour was dropped for heat; heatNote already says why.
  const awayFromHeat = () => picked(driest(), "skipped-heat", "换到 ");

  if (card.switchRule.kind === "never") {
    if (candidates.includes(target)) {
      return { hour: target, rule: "default", reason: `${heatNote}每天 ${target} 点，规则卡不换钟点` };
    }
    return awayFromHeat();
  }
  if (card.switchRule.kind === "always") {
    return picked(driest(), "driest", "全天挑最干：");
  }
  // kind === "rain"
  const threshold = card.switchRule.atLeast;
  const targetProb = probOf(day, target);
  if (!candidates.includes(target)) return awayFromHeat();
  if (targetProb < threshold) {
    return {
      hour: target,
      rule: "default",
      reason: `${heatNote}${target} 点预报降水概率 ${pct(targetProb)} < ${threshold}%，照常 ${target} 点`,
    };
  }
  const hour = driest();
  if (hour === target) {
    return {
      hour,
      rule: "kept-wettest",
      reason: `${heatNote}${target} 点预报降水概率 ${pct(targetProb)} ≥ ${threshold}%，但没有更干的钟点，还是 ${target} 点`,
    };
  }
  return picked(hour, "switched-rain", `${target} 点预报降水概率 ${pct(targetProb)} ≥ ${threshold}%，换到 `);
};

// ── Judging ────────────────────────────────────────────────────────────────

/**
 * Judge one walk against what actually happened. Each flag is independent —
 * a July evening can be both a downpour and 33°C — and `verdict` is the single
 * label 每天的决定.结论 stores, by {@link VERDICT_PRECEDENCE}.
 *
 * With no actuals at all (today, or an archive that has not caught up) the day is
 * 待判: undecided, never "dry".
 */
export const judgeWalk = (actual, hour, judge) => {
  const rain = actual?.rain;
  const temp = actual?.temp;
  if ((rain === null || rain === undefined) && (temp === null || temp === undefined)) {
    return { wet: false, hot: false, off: !judge.ownerHours.includes(hour), pending: true, verdict: VERDICT.pending };
  }
  const wet = Number(rain ?? 0) >= judge.wetMm;
  const hot = isHot(temp, judge.hotC);
  const off = !judge.ownerHours.includes(hour);
  const verdict = wet ? VERDICT.wet : hot ? VERDICT.hot : off ? VERDICT.off : VERDICT.dry;
  return { wet, hot, off, pending: false, verdict };
};

// ── Replaying ──────────────────────────────────────────────────────────────

/** Decide and judge every day of a month. `days` in date order. */
export const replayMonth = (days, card, judge, { city = "" } = {}) =>
  days.map((day) => {
    const decision = decideHour(day, card);
    const at = day.hours?.[decision.hour] || {};
    const verdict = judgeWalk(at, decision.hour, judge);
    return {
      date: day.date,
      month: String(day.date).slice(0, 7),
      weekday: isoWeekday(day.date),
      city,
      hour: decision.hour,
      rule: decision.rule,
      reason: decision.reason,
      prob: at.prob ?? null,
      ftemp: at.ftemp ?? null,
      rain: at.rain ?? null,
      temp: at.temp ?? null,
      version: card.version,
      ...verdict,
    };
  });

/** Counts. `wet`/`hot`/`off` are independent, so they can add up to more than `days`. */
export const summarize = (rows) => {
  const judged = rows.filter((row) => !row.pending);
  return {
    days: rows.length,
    judged: judged.length,
    pending: rows.length - judged.length,
    wet: judged.filter((row) => row.wet).length,
    hot: judged.filter((row) => row.hot).length,
    off: rows.filter((row) => row.off).length,
    dry: judged.filter((row) => !row.wet && !row.hot && !row.off).length,
  };
};

/**
 * What a monthly review cites. Everything here is computed from the judge data —
 * forecasts and actuals — never from anything the agent read elsewhere.
 */
export const monthEvidence = (rows) => {
  const wetDays = rows.filter((row) => row.wet);
  const daysPerWeekday = {};
  const wetPerWeekday = {};
  for (const row of rows) daysPerWeekday[row.weekday] = (daysPerWeekday[row.weekday] || 0) + 1;
  for (const row of wetDays) wetPerWeekday[row.weekday] = (wetPerWeekday[row.weekday] || 0) + 1;
  return {
    wetDays: wetDays.map(({ date, weekday, hour, prob, rain }) => ({ date, weekday, hour, prob, rain })),
    wetProbs: wetDays.map((row) => row.prob),
    weekday: { wet: wetPerWeekday, days: daysPerWeekday, sample: wetDays.length },
    hotDays: rows.filter((row) => row.hot).map(({ date, hour, temp, ftemp }) => ({ date, hour, temp, ftemp })),
    offDays: rows.filter((row) => row.off).map(({ date, hour }) => ({ date, hour })),
    guardrails: { hot: rows.filter((row) => row.hot).length, off: rows.filter((row) => row.off).length },
  };
};

/**
 * Should a candidate playbook replace the current one, judged on ONE month?
 *
 * Judge v1 has no guardrails: only 淋雨 counts, so a candidate that rains less
 * passes even if it walks the dog at noon. `warnings` still names what got worse,
 * because the reader deserves to know what the judge is not looking at — but it
 * does not change the verdict. That blind spot is the lesson.
 *
 * Judge v2 adds guardrails (太热 0 次, 不方便 0 次) and they come FIRST:
 *   1. count how far each playbook goes over the guardrails this month;
 *   2. more over than the current one → 破护栏, fails;
 *      less over → 修护栏, passes even if it rains more (that is a rollback);
 *   3. equally over (usually both 0) → fewer 淋雨 passes, more fails.
 */
export const gate = (candidate, current, judge) => {
  const primary = candidate.wet < current.wet ? "win" : candidate.wet === current.wet ? "tie" : "lose";
  const keys = ["hot", "off"];
  const improved = keys.filter((key) => candidate[key] < current[key]);
  const worsened = keys.filter((key) => candidate[key] > current[key]);
  if (!judge.guardrails) {
    return {
      pass: primary === "win",
      why: primary === "win" ? "wins-primary" : primary === "lose" ? "worse-primary" : "tie-primary",
      primary,
      broken: [],
      improved,
      warnings: worsened,
    };
  }
  const limited = keys.filter((key) => judge.guardrails[key] !== null && judge.guardrails[key] !== undefined);
  const over = (summary, key) => Math.max(0, summary[key] - judge.guardrails[key]);
  const total = (summary) => limited.reduce((sum, key) => sum + over(summary, key), 0);
  const broken = limited.filter((key) => over(candidate, key) > over(current, key));
  const base = { primary, broken, improved, warnings: [] };
  if (total(candidate) > total(current)) return { ...base, pass: false, why: "broken-guardrail" };
  if (total(candidate) < total(current)) return { ...base, pass: true, why: "fixes-guardrail" };
  if (primary === "win") return { ...base, pass: true, why: "wins-primary" };
  if (primary === "lose") return { ...base, pass: false, why: "worse-primary" };
  return { ...base, pass: false, why: "no-change" };
};

export const GATE_WHY = Object.freeze({
  "broken-guardrail": "破护栏",
  "worse-primary": "淋雨变多了",
  "wins-primary": "淋雨变少了",
  "fixes-guardrail": "超出护栏的次数变少了",
  "no-change": "没有变好",
  "tie-primary": "淋雨一样多（这版裁判只看淋雨）",
});

export const METRIC_LABEL = Object.freeze({ wet: "淋雨", hot: "太热", off: "不方便" });

/** A month's days, sorted, from the compact fixture/cache shape written by scripts/lib/open-meteo.mjs. */
export const daysFromMonthData = (data) =>
  Object.keys(data.days)
    .sort()
    .map((date) => {
      const hours = {};
      data.hours.forEach((hour, index) => {
        const [prob, ftemp, rain, temp] = data.days[date][index] || [];
        hours[hour] = { prob, ftemp, rain, temp };
      });
      return { date, hours };
    });
