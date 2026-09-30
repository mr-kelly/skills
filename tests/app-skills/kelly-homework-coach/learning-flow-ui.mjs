// Run with PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs and an app
// serving at HOMEWORK_UI_URL (default localhost:3159). No real records/photos.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.HOMEWORK_UI_URL || "http://localhost:3159";
const points = {
  A: [0, 0],
  B: [200, 0],
  C: [200, 160],
  D: [0, 160],
  E: [140, 0],
  G: [0, 65],
  H: [200, 120],
  Q: [70, -30],
};
const diagram = { points, note: "Synthetic UI fixture, not geometry evidence" };
const paper = {
  paper_id: "paper-ui-fixture",
  ref: 1,
  title: "UI-only synthetic paper",
  status: "approved",
  subject: "Math",
  question_count: 3,
  items: [
    {
      prompt: "Fixture objective one",
      answer: "7",
      hint: "Try another calculation",
      explanation: "reason-fixture-one",
      diagram,
    },
    {
      prompt: "Fixture explanation",
      answer: "",
      parent_answer: "parent-only-fixture",
      explanation: "manual-reason-fixture",
      diagram,
    },
    { prompt: "Fixture objective two", answer: "9", hint: "Try again", explanation: "reason-fixture-two", diagram },
  ],
  analysis: { deep_notes: "private-parent-note-fixture" },
};
const review = {
  review_id: "rv-ui-fixture",
  ref: 1,
  target_id: paper.paper_id,
  target_type: "paper",
  status: "needs_review",
  risk: [],
  suggestions: [],
};
const evidence = process.env.HOMEWORK_EVIDENCE_DIR;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/js/providers/demo-provider.js*", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        "const snapshot = demoSnapshot(lang);",
        `const snapshot = demoSnapshot(lang); snapshot.papers = [${JSON.stringify(paper)}]; snapshot.review_items = [${JSON.stringify(review)}];`,
      );
      await route.fulfill({ response, body });
    });
    await page.goto(`${base}/?demo=papers&lang=zh-CN#/papers`);
    if (width < 700) await page.locator("[data-select-id]").first().click();
    await page.locator("[data-run-start]").waitFor();
    const detail = await page.locator(".detail-panel").innerText();
    assert(!detail.includes("private-parent-note-fixture"));
    assert(!detail.includes("reason-fixture-one"));
    assert.equal(await page.locator(".practice-diagram").count(), 3);
    if (evidence) await page.screenshot({ path: `${evidence}/homework-child-paper-${width}.png`, fullPage: true });
    await page.locator("[data-run-start]").click();
    await page.locator("#runAnswer").fill("1");
    await page.locator("[data-run-submit]").click();
    assert(!(await page.locator(".detail-panel").innerText()).includes("reason-fixture-one"));
    await page.locator("[data-run-retry]").click();
    await page.locator("#runAnswer").fill("7");
    await page.locator("[data-run-submit]").click();
    assert((await page.locator(".detail-panel").innerText()).includes("reason-fixture-one"));
    await page.locator("[data-run-next]").click();
    assert.equal(await page.locator("textarea#runAnswer").count(), 1);
    assert(!(await page.locator(".detail-panel").innerText()).includes("parent-only-fixture"));
    await page.goto(`${base}/?demo=review&lang=zh-CN#/review/rv-ui-fixture`);
    await page.locator("[data-decision-action=approve]").waitFor();
    assert.equal(await page.locator("[data-decision-action=approve]").innerText(), "确认这份练习卷");
    assert((await page.locator(".detail-panel").innerText()).includes("parent-only-fixture"));
    assert.equal(await page.locator(".practice-diagram").count(), 3);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (evidence) await page.screenshot({ path: `${evidence}/homework-parent-paper-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}: child hiding, retry reasoning, open response, parent preview`);
    await page.close();
  }
} finally {
  await browser.close();
}
