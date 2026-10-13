// The ?demo=1 dataset is the course's four-month story on real weather. These are the numbers the
// lesson quotes; if a regeneration ever changes one, this fails before a screenshot does.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMonths, buildTimeline, dayFromDecision, monthGrid, totals } from "../app/js/view-model.js";

const data = JSON.parse(await readFile(new URL("../app/demo-data.json", import.meta.url), "utf8"));
const judge = data.judges[data.currentJudge];
const months = buildMonths(
  data.decisions.map((fields) => dayFromDecision(fields, judge)),
  { judge, baselineHour: data.baselineHour, baselineByDate: data.baselineWeather, judgeByMonth: data.judgeByMonth },
);
const pick = (summary) => [summary.wet, summary.hot, summary.off, summary.days];

test("each month, the playbook that was in force", () => {
  assert.deepEqual(
    months.map((month) => [month.month, month.versions.join(), month.judgeVersion, ...pick(month.summary)]),
    [
      ["2026-06", "v1", "v1", 7, 0, 0, 30],
      ["2026-07", "v2", "v1", 5, 15, 0, 31],
      ["2026-08", "v3", "v1", 2, 5, 14, 31],
      ["2026-09", "v4", "v2", 3, 0, 0, 30],
    ],
  );
});

test("the control: still on v1 every month", () => {
  assert.deepEqual(
    months.map((month) => pick(month.baseline.summary)),
    [
      [7, 0, 0, 30],
      [9, 15, 0, 31],
      [5, 3, 0, 31],
      [6, 0, 0, 30],
    ],
  );
  const sum = totals(months);
  assert.deepEqual([sum.baseline.wet, sum.baseline.hot], [27, 18]);
  assert.deepEqual([sum.inForce.wet, sum.inForce.hot, sum.inForce.off], [17, 20, 14]);
});

test("June's wet walks were all forecast at 79% or more at 6 pm", () => {
  const june = months[0];
  assert.deepEqual(
    june.days.filter((day) => day.wet).map((day) => day.prob),
    [100, 79, 100, 97, 91, 87, 100],
  );
});

test("the stored 结论 agrees with the facts it was judged from", () => {
  for (const month of months) {
    for (const day of month.days) assert.equal(day.verdict, day.storedVerdict, `${day.date}`);
  }
});

test("the timeline reads v1 → v4 from the playbook, with P5 retired and P2 closed", () => {
  const timeline = buildTimeline(data.playbookMarkdown, months, {
    closed: data.closed,
    judgeChanges: data.judgeChanges,
  });
  assert.equal(timeline.current, "v4");
  assert.deepEqual(
    timeline.versions.map((entry) => [entry.version, entry.monthResult?.month, Boolean(entry.retired)]),
    [
      ["v1", "2026-06", false],
      ["v2", "2026-07", false],
      ["v3", "2026-08", true],
      ["v4", "2026-09", false],
    ],
  );
  assert.equal(timeline.closed[0].id, "P2");
  assert.equal(timeline.judgeChanges[0].to, "v2");
});

test("the month grid is Monday-first and whole weeks", () => {
  const june = monthGrid("2026-06");
  assert.equal(june.length % 7, 0);
  assert.equal(june[0], "2026-06-01"); // 1 June 2026 is a Monday
  assert.equal(monthGrid("2026-07")[2], "2026-07-01"); // a Wednesday
});
