// Pins the course's numbers — 风变第二期第 10 节, Shanghai 2026 — to the recorded Open-Meteo
// fixtures. These are the figures the lecture quotes. Every one is reproduced here from real data
// through the same walk-model.js the trusted scripts and the AirApp use; none is typed in by hand
// anywhere else. Offline and deterministic: the fixtures were recorded once from the live API.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-dog-walk");
const model = await import(join(skillRoot, "content", "kelly-dog-walk-app", "app", "js", "walk-model.js"));
const { PINNED_PLACES, loadMonth } = await import(join(skillRoot, "scripts", "lib", "open-meteo.mjs"));

const shanghai = PINNED_PLACES.上海;
const read = (path) => readFile(join(skillRoot, path), "utf8");
const cards = {};
for (const version of ["v1", "v2", "v3", "v4"]) {
  cards[version] = model.parseRuleCard(await read(`references/playbooks/${version}.md`));
}
const judgeV1 = model.parseJudgeRules(await read("content/judge-rules.md"));
const judgeV2 = model.parseJudgeRules(await read("references/judge-rules-v2.md"));
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const days = {};
for (const month of MONTHS) {
  days[month] = model.daysFromMonthData(await loadMonth(shanghai, month, { source: "fixtures" }));
}
const replay = (month, version, judge = judgeV1) => model.replayMonth(days[month], cards[version], judge);
const counts = (month, version) => {
  const summary = model.summarize(replay(month, version));
  return [summary.wet, summary.hot, summary.off];
};

test("the pinned point is the brief's: 31.23, 121.47 (the geocoder's 上海 is a different grid cell)", () => {
  assert.deepEqual([shanghai.latitude, shanghai.longitude, shanghai.timezone], [31.23, 121.47, "Asia/Shanghai"]);
  for (const month of MONTHS) {
    assert.equal(days[month].length, Number(month.slice(5)) === 6 || Number(month.slice(5)) === 9 ? 30 : 31);
  }
});

test("every rule × every month — [淋雨, 太热, 不方便]", () => {
  const table = Object.fromEntries(
    MONTHS.map((month) => [month, Object.fromEntries(["v1", "v2", "v3", "v4"].map((v) => [v, counts(month, v)]))]),
  );
  assert.deepEqual(table, {
    "2026-05": { v1: [3, 0, 0], v2: [1, 0, 0], v3: [1, 0, 8], v4: [1, 0, 0] },
    "2026-06": { v1: [7, 0, 0], v2: [3, 0, 0], v3: [2, 0, 8], v4: [3, 0, 0] },
    "2026-07": { v1: [9, 15, 0], v2: [5, 15, 0], v3: [0, 14, 16], v4: [3, 2, 0] },
    "2026-08": { v1: [5, 3, 0], v2: [2, 3, 0], v3: [2, 5, 14], v4: [2, 0, 0] },
    "2026-09": { v1: [6, 0, 0], v2: [3, 0, 0], v3: [1, 1, 10], v4: [3, 0, 0] },
  });
});

test("the brief's story table: the playbook in force each month", () => {
  assert.deepEqual(counts("2026-06", "v1"), [7, 0, 0]);
  assert.deepEqual(counts("2026-07", "v2"), [5, 15, 0]);
  assert.deepEqual(counts("2026-08", "v3"), [2, 5, 14]);
  assert.deepEqual(counts("2026-09", "v4"), [3, 0, 0]);
});

test("controls: always v1 = 27 wet / 18 hot; v4 all along = 11 wet / 2 hot / 0 off", () => {
  const sum = (version, index) =>
    ["2026-06", "2026-07", "2026-08", "2026-09"].reduce((total, month) => total + counts(month, version)[index], 0);
  assert.deepEqual(
    ["2026-06", "2026-07", "2026-08", "2026-09"].map((month) => counts("2026-06" === month ? month : month, "v1")[0]),
    [7, 9, 5, 6],
  );
  assert.deepEqual([sum("v1", 0), sum("v1", 1)], [27, 18]);
  assert.deepEqual([sum("v4", 0), sum("v4", 1), sum("v4", 2)], [11, 2, 0]);
  assert.deepEqual(counts("2026-07", "v3"), [0, 14, 16], "the bad rule in July");
});

test("round 1 evidence: June's 7 wet walks were all forecast ≥ 79% at 6 pm, and v2 cuts June 7 → 3, May 3 → 1", () => {
  const evidence = model.monthEvidence(replay("2026-06", "v1"));
  assert.deepEqual(evidence.wetProbs, [100, 79, 100, 97, 91, 87, 100]);
  assert.ok(evidence.wetDays.every((day) => day.hour === 18));
  assert.deepEqual([counts("2026-06", "v1")[0], counts("2026-06", "v2")[0]], [7, 3]);
  assert.deepEqual([counts("2026-05", "v1")[0], counts("2026-05", "v2")[0]], [3, 1]);
});

test("round 1 coincidence (P2): 4 of June's 7 on Sunday/Tuesday; July's 6 pm rain spreads out", () => {
  const june = model.monthEvidence(replay("2026-06", "v1")).weekday.wet;
  assert.equal((june[7] || 0) + (june[2] || 0), 4);
  const july = model.monthEvidence(replay("2026-07", "v1")).weekday.wet;
  assert.deepEqual(july, { 2: 1, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1 });
});

test("the gate: judge v1 lets P5 through on two months; judge v2 stops it and lets the rollback through", () => {
  const gateOn = (month, from, to, judge) =>
    model.gate(model.summarize(replay(month, to, judge)), model.summarize(replay(month, from, judge)), judge);
  // Round 2, judge v1: the bad rule wins on rain in July and in June. Only warnings say otherwise.
  for (const month of ["2026-07", "2026-06"]) {
    const result = gateOn(month, "v2", "v3", judgeV1);
    assert.equal(result.pass, true, month);
    assert.deepEqual(result.warnings, ["off"], month);
  }
  // Round 3, judge v1 cannot justify the rollback: August ties on rain, July rains more.
  assert.equal(gateOn("2026-08", "v3", "v4", judgeV1).why, "tie-primary");
  assert.equal(gateOn("2026-07", "v3", "v4", judgeV1).why, "worse-primary");
  // Judge v2: guardrails first.
  assert.equal(gateOn("2026-07", "v2", "v3", judgeV2).why, "broken-guardrail");
  assert.equal(gateOn("2026-06", "v2", "v3", judgeV2).why, "broken-guardrail");
  assert.equal(gateOn("2026-08", "v3", "v4", judgeV2).why, "fixes-guardrail");
  assert.equal(gateOn("2026-07", "v3", "v4", judgeV2).why, "fixes-guardrail");
  // And P1 passes under either judge, on both months.
  for (const judge of [judgeV1, judgeV2]) {
    assert.equal(gateOn("2026-06", "v1", "v2", judge).pass, true);
    assert.equal(gateOn("2026-05", "v1", "v2", judge).pass, true);
  }
});

test("the CLI agrees: replay.mjs --json over the fixtures", () => {
  const out = execFileSync(
    process.execPath,
    [
      "scripts/replay.mjs",
      "--city",
      "上海",
      "--month",
      "2026-07,2026-06",
      "--playbook",
      "v2",
      "--compare",
      "v3",
      "--source",
      "fixtures",
      "--json",
    ],
    { cwd: skillRoot, encoding: "utf8", env: { ...process.env, BUSABASE_BASE_URL: "" } },
  );
  const result = JSON.parse(out);
  assert.equal(result.judge.version, "v1");
  assert.deepEqual(
    result.months.map((month) => [month.month, month.summary.wet, month.summary.hot, month.summary.off]),
    [
      ["2026-07", 5, 15, 0],
      ["2026-06", 3, 0, 0],
    ],
  );
  assert.deepEqual(
    result.compare.months.map((month) => [month.summary.wet, month.summary.hot, month.summary.off]),
    [
      [0, 14, 16],
      [2, 0, 8],
    ],
  );
  assert.deepEqual(
    result.compare.gates.map((item) => item.pass),
    [true, true],
  );
  assert.equal(result.months[0].rows[0].city, "上海");
});
