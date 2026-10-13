import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  VERDICT,
  decideHour,
  fencedBlock,
  formatRuleCard,
  gate,
  isoWeekday,
  judgeWalk,
  parseHours,
  parseJudgeRules,
  parsePlaybookHistory,
  parseRuleCard,
} from "../app/js/walk-model.js";

const OWNER = [7, 8, 17, 18, 19, 20, 21];
const judgeV1 = { version: "v1", wetMm: 0.2, hotC: 32, ownerHours: OWNER, guardrails: null, evidence: {} };
const judgeV2 = { ...judgeV1, version: "v2", guardrails: { hot: 0, off: 0 } };

/** A day where every hour has the same forecast unless overridden. */
const day = (overrides = {}, base = { prob: 10, ftemp: 28, rain: 0, temp: 28 }) => {
  const hours = {};
  for (let hour = 6; hour <= 22; hour++) hours[hour] = { ...base, ...(overrides[hour] || {}) };
  return { date: "2026-07-01", hours };
};

const card = (text) => parseRuleCard(`\`\`\`规则卡\n版本: v9\n方便时段: 7, 8, 17-21\n默认钟点: 18\n${text}\n\`\`\``);

test("hours parse as lists and ranges, in any separator the playbook might use", () => {
  assert.deepEqual(parseHours("7, 8, 17, 18, 19, 20, 21"), OWNER);
  assert.deepEqual(parseHours("7、8、17-21"), OWNER);
  assert.deepEqual(parseHours("6–22").length, 17);
  assert.deepEqual(parseHours("17 到 19"), [17, 18, 19]);
  assert.throws(() => parseHours("7, 25"), /0–23/);
  assert.throws(() => parseHours("傍晚"), /看不懂/);
});

test("a rule card that is half-understood is refused, not half-applied", () => {
  assert.throws(() => parseRuleCard("no card here"), /规则卡/);
  assert.throws(() => card("换钟点条件: 无"), /不遛条件/);
  assert.throws(() => card("换钟点条件: 下雨就换\n不遛条件: 无"), /换钟点条件/);
  assert.throws(
    () => parseRuleCard("```规则卡\n版本: v1\n方便时段: 7, 8\n默认钟点: 18\n换钟点条件: 无\n不遛条件: 无\n```"),
    /不在方便时段/,
  );
});

test("formatRuleCard round-trips", () => {
  const parsed = card("换钟点条件: 默认钟点预报降水概率 ≥ 50%\n不遛条件: 预报气温 ≥ 32°C");
  assert.deepEqual(parseRuleCard(`\`\`\`规则卡\n${formatRuleCard(parsed)}\n\`\`\``).switchRule, parsed.switchRule);
  assert.deepEqual(parseRuleCard(`\`\`\`规则卡\n${formatRuleCard(parsed)}\n\`\`\``).skipRule, parsed.skipRule);
});

test("v1: never switches", () => {
  const rule = card("换钟点条件: 无\n不遛条件: 无");
  assert.equal(decideHour(day({ 18: { prob: 100 } }), rule).hour, 18);
});

test("v2: switches only when the default hour reaches the threshold, to the driest, nearest-to-18 hour", () => {
  const rule = card("换钟点条件: 默认钟点预报降水概率 ≥ 50%\n不遛条件: 无");
  assert.equal(decideHour(day({ 18: { prob: 49 } }), rule).hour, 18);
  const wet = day({ 18: { prob: 50 }, 7: { prob: 5 }, 21: { prob: 5 } });
  // 7 and 21 tie on probability; 21 is closer to 18.
  assert.equal(decideHour(wet, rule).hour, 21);
  // Full tie: 17 and 19 are equally close; Python's min() keeps the first, i.e. the earlier hour.
  const tie = day({ 18: { prob: 80 } }, { prob: 30, ftemp: 28, rain: 0, temp: 28 });
  assert.equal(decideHour(tie, rule).hour, 17);
  // No drier hour anywhere: stays and says so.
  const flat = day({}, { prob: 90, ftemp: 28, rain: 0, temp: 28 });
  const kept = decideHour(flat, rule);
  assert.equal(kept.hour, 18);
  assert.equal(kept.rule, "kept-wettest");
});

test("v3 (the bad rule): every day the driest hour of 6–22, even at noon", () => {
  const rule = parseRuleCard("```规则卡\n版本: v3\n方便时段: 6-22\n默认钟点: 18\n换钟点条件: 总是\n不遛条件: 无\n```");
  assert.equal(decideHour(day({ 12: { prob: 0 } }), rule).hour, 12);
});

test("v4: hot hours are skipped; if every convenient hour is hot it falls back to the v2 choice", () => {
  const rule = card("换钟点条件: 默认钟点预报降水概率 ≥ 50%\n不遛条件: 预报气温 ≥ 32°C");
  const hotEvening = day({
    7: { prob: 40 },
    8: { prob: 40 },
    17: { ftemp: 33 },
    18: { ftemp: 33 },
    19: { ftemp: 32 },
    20: { prob: 20 },
    21: { prob: 20 },
  });
  const picked = decideHour(hotEvening, rule);
  assert.equal(picked.hour, 20);
  assert.equal(picked.rule, "skipped-heat");
  const allHot = day({}, { prob: 10, ftemp: 34, rain: 0, temp: 34 });
  assert.equal(decideHour(allHot, rule).hour, 18);
});

test("the judge: thresholds are inclusive, flags are independent, one label by precedence", () => {
  assert.equal(judgeWalk({ rain: 0.2, temp: 20 }, 18, judgeV1).verdict, VERDICT.wet);
  assert.equal(judgeWalk({ rain: 0.19, temp: 20 }, 18, judgeV1).verdict, VERDICT.dry);
  const both = judgeWalk({ rain: 3, temp: 33 }, 12, judgeV1);
  assert.deepEqual([both.wet, both.hot, both.off, both.verdict], [true, true, true, VERDICT.wet]);
  assert.equal(judgeWalk({ rain: 0, temp: 32 }, 18, judgeV1).verdict, VERDICT.hot);
  assert.equal(judgeWalk({ rain: 0, temp: 25 }, 12, judgeV1).verdict, VERDICT.off);
  assert.equal(judgeWalk(null, 18, judgeV1).verdict, VERDICT.pending);
});

test("the gate: judge v1 sees only rain; judge v2 puts guardrails first", () => {
  const v2July = { wet: 5, hot: 15, off: 0 };
  const v3July = { wet: 0, hot: 14, off: 16 };
  const v4July = { wet: 3, hot: 2, off: 0 };
  const underV1 = gate(v3July, v2July, judgeV1);
  assert.equal(underV1.pass, true);
  assert.deepEqual(underV1.warnings, ["off"]);
  assert.equal(gate(v3July, v2July, judgeV2).why, "broken-guardrail");
  assert.equal(gate(v4July, v3July, judgeV1).pass, false);
  assert.equal(gate(v4July, v3July, judgeV2).why, "fixes-guardrail");
  assert.equal(gate({ wet: 3, hot: 0, off: 0 }, { wet: 7, hot: 0, off: 0 }, judgeV2).why, "wins-primary");
  assert.equal(gate({ wet: 3, hot: 0, off: 0 }, { wet: 3, hot: 0, off: 0 }, judgeV2).why, "no-change");
});

test("judge rules parse from the doc's block, including v2 guardrails", () => {
  const v1 = parseJudgeRules(
    "```裁判规则\n版本: v1\n淋雨: 实际降水 ≥ 0.2 mm\n太热: 实际气温 ≥ 32°C\n主人方便时段: 7, 8, 17-21\n主指标: 淋雨次数\n护栏: 无\n证据门槛: 无\n```",
  );
  assert.deepEqual([v1.wetMm, v1.hotC, v1.guardrails, v1.ownerHours], [0.2, 32, null, OWNER]);
  const v2 = parseJudgeRules(
    "```裁判规则\n版本: v2\n淋雨: 实际降水 ≥ 0.5 mm\n太热: 实际气温 ≥ 30°C\n主人方便时段: 7-9\n主指标: 淋雨次数\n护栏: 太热 0 次, 不方便 1 次\n证据门槛: 换一个月也要赢; 同一个月和旧手册对照\n```",
  );
  assert.deepEqual([v2.wetMm, v2.hotC, v2.guardrails, v2.evidence.otherMonth], [0.5, 30, { hot: 0, off: 1 }, true]);
});

test("the playbook history parses into versions and retired rules", async () => {
  const text = await readFile(new URL("../../../references/playbooks/v4.md", import.meta.url), "utf8").catch(
    () => null,
  );
  if (!text) return; // the AirApp can be checked outside the repo, where references/ is absent
  const history = parsePlaybookHistory(text);
  assert.equal(history.current, "v4");
  assert.deepEqual(
    history.versions.map((entry) => [entry.version, entry.month]),
    [
      ["v1", "2026-06"],
      ["v2", "2026-07"],
      ["v3", "2026-08"],
      ["v4", "2026-09"],
    ],
  );
  assert.equal(history.retired.length, 1);
  assert.match(history.retired[0].rule, /（v3，/);
  assert.match(history.retired[0].reason, /主指标赢、护栏输/);
  assert.ok(fencedBlock(text, "规则卡"));
});

test("weekday is ISO, Monday = 1 … Sunday = 7, independent of the machine's time zone", () => {
  assert.equal(isoWeekday("2026-06-07"), 7);
  assert.equal(isoWeekday("2026-06-09"), 2);
});
