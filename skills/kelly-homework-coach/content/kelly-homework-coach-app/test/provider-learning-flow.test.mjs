import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
/** @type {any} */
const testGlobal = globalThis;

import { appConfig } from "../app/js/config.js";

test("cause and practice write existing latest heads, stay pending and never reset old reviews", async () => {
  let source = await readFile(new URL("../app/js/providers/busabase-provider.js", import.meta.url), "utf8");
  source = source.replace(/import \{ inspectProvisionedResources, provisionDeclaredResources \}[^;]+;/, "");
  source = source.replace(
    /import \{ createRuntimeClient \}[^;]+;/,
    "const createRuntimeClient = () => globalThis.homeworkTestClient;",
  );
  source = source.replace(
    '"../config.js?v=0.1.0"',
    JSON.stringify(new URL("../app/js/config.js", import.meta.url).href),
  );
  source = source.replace(
    '"../homework-model.js?v=0.1.0"',
    JSON.stringify(new URL("../app/js/homework-model.js", import.meta.url).href),
  );
  source = source.replace('"../runtime.js"', JSON.stringify(new URL("../app/js/runtime.js", import.meta.url).href));
  source = source.replace(
    /async function ensureResources\(\) \{[\s\S]*?\n\}\n\nfunction base/,
    `async function ensureResources() {
    runtimeClient = createRuntimeClient();
    runtimeBases = new Map(${JSON.stringify(appConfig.bases.map((b) => [b.key, { ...b, baseId: `fixture-${b.key}` }]))});
  }

function base`,
  );
  /** @type {Record<string, string>} */
  const raw = {
    "mistake-id": "m-fixture",
    status: "needs_review",
    analysis: JSON.stringify({ root_cause: "old", fix_strategy: "keep" }),
  };
  /** @type {Array<[string, any]>} */
  const calls = [];
  testGlobal.homeworkTestClient = {
    records: {
      get: async (input) => {
        calls.push(["get", input]);
        return { id: "record-fixture", headCommitId: "head-fixture", headCommit: { payload: raw } };
      },
      changeRequest: async (input) => {
        calls.push(["write", input]);
        return { id: "crqfixture", status: "in_review" };
      },
    },
    changeRequests: {
      get: async () => ({
        baseId: "fixture-mistakes",
        operations: [{ targetRecordId: "record-fixture" }],
        status: "merged",
      }),
    },
  };
  try {
    const { busabaseProvider: provider } = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    const result = await provider.submitMistakeCause({ mistake_id: "m-fixture", cause: "new observation" });
    assert.equal(result.id, "crqfixture");
    assert.equal(calls[0][1].baseId, "fixture-mistakes");
    const write = calls[1][1];
    assert.equal(write.autoMerge, false);
    assert.equal(write.baseCommitId, "head-fixture");
    assert.equal(write.fields.status, "needs_review");
    assert.deepEqual(JSON.parse(write.fields.analysis), { root_cause: "new observation", fix_strategy: "keep" });
    await assert.rejects(provider.submitMistakeCause({ mistake_id: "m-fixture", cause: " " }));
    assert.equal(
      await provider.getMistakeRequestStatus({ requestId: "crqfixture", mistake_id: "m-fixture" }),
      "merged",
    );
    const validRequest = testGlobal.homeworkTestClient.changeRequests.get;
    testGlobal.homeworkTestClient.changeRequests.get = async () => ({
      baseId: "wrong-base",
      operations: [{ targetRecordId: "record-fixture" }],
      status: "merged",
    });
    await assert.rejects(provider.getMistakeRequestStatus({ requestId: "crqfixture", mistake_id: "m-fixture" }));
    testGlobal.homeworkTestClient.changeRequests.get = validRequest;
    await assert.rejects(provider.getMistakeRequestStatus({ requestId: "invalid-id", mistake_id: "m-fixture" }));
    const validWrite = testGlobal.homeworkTestClient.records.changeRequest;
    testGlobal.homeworkTestClient.records.changeRequest = async () => {
      throw new Error("conflict-fixture");
    };
    await assert.rejects(
      provider.submitMistakeCause({ mistake_id: "m-fixture", cause: "another observation" }),
      /conflict-fixture/,
    );
    testGlobal.homeworkTestClient.records.changeRequest = validWrite;
    calls.length = 0;
    Object.assign(raw, {
      "paper-id": "p-fixture",
      status: "approved",
      items: "[]",
      analysis: JSON.stringify({ strengths: ["stale"], attempts: [{ correct: 0 }] }),
    });
    const submitted = await provider.submitPaperAttempt({
      paper_id: "p-fixture",
      attempt: { total: 1, correct: 1, wrong_count: 0, results: [] },
    });
    assert.equal(submitted.status, "in_review");
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1].autoMerge, false);
    assert.equal(calls[1][1].fields.status, "needs_review");
    const analysis = JSON.parse(calls[1][1].fields.analysis);
    assert.equal(analysis.attempts.length, 2);
    assert.deepEqual(analysis.strengths, []);
    calls.length = 0;
    raw.status = "needs_review";
    raw.analysis = JSON.stringify({
      attempts: [
        {
          attempted_at: "fixture-attempt",
          results: [
            { ref: 1, outcome: "correct" },
            { ref: 2, outcome: "ungraded", given: "an explanation" },
          ],
        },
      ],
      attempt_reviews: [],
    });
    await assert.rejects(
      provider.submitAttemptReview({
        paper_id: "p-fixture",
        attempted_at: "stale",
        verdicts: [{ ref: 2, outcome: "correct" }],
        comment: "Read it",
      }),
      /current/,
    );
    await assert.rejects(
      provider.submitAttemptReview({
        paper_id: "p-fixture",
        attempted_at: "fixture-attempt",
        verdicts: [],
        comment: "Read it",
      }),
      /manual mark/,
    );
    await assert.rejects(
      provider.submitAttemptReview({
        paper_id: "p-fixture",
        attempted_at: "fixture-attempt",
        verdicts: [{ ref: 2, outcome: "correct" }],
        comment: " ",
      }),
      /required/,
    );
    assert.equal(calls.filter(([kind]) => kind === "write").length, 0);
    const reviewed = await provider.submitAttemptReview({
      paper_id: "p-fixture",
      attempted_at: "fixture-attempt",
      verdicts: [{ ref: 2, outcome: "correct" }],
      comment: "Read the explanation.",
    });
    assert.equal(reviewed.status, "in_review");
    const reviewWrite = calls.at(-1)[1];
    assert.equal(reviewWrite.recordId, "record-fixture");
    assert.equal(reviewWrite.baseCommitId, "head-fixture");
    assert.equal(reviewWrite.autoMerge, false);
    assert.equal(reviewWrite.fields.status, "needs_review");
    assert.equal(JSON.parse(reviewWrite.fields.analysis).attempt_reviews[0].verdicts[0].outcome, "correct");
    assert.equal(calls.filter(([kind]) => kind === "write").length, 1);
    calls.length = 0;
    Object.assign(raw, { "review-id": "rv-fixture", "target-type": "paper", "target-id": "p-fixture" });
    await assert.rejects(provider.submitReview({ review_id: "rv-fixture", action: "approve" }), /old paper approval/);
    assert.equal(calls.filter(([kind]) => kind === "write").length, 0);
    raw.analysis = reviewWrite.fields.analysis;
    await assert.rejects(
      provider.submitAttemptReview({
        paper_id: "p-fixture",
        attempted_at: "fixture-attempt",
        verdicts: [{ ref: 2, outcome: "correct" }],
        comment: "Again",
      }),
      /already reviewed/,
    );
    raw.status = "blocked";
    await assert.rejects(provider.submitPaperAttempt({ paper_id: "p-fixture", attempt: {} }));
  } finally {
    testGlobal.homeworkTestClient = undefined;
  }
});
