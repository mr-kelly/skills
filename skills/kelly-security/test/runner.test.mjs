import assert from "node:assert/strict";
import test from "node:test";
import { CHECKS } from "../lib/catalog.mjs";
import { executeRun, planRun } from "../lib/runner.mjs";

const options = {
  runId: "run_lab",
  aliases: ["lab-web"],
  scope: "customer-case-001",
  start: "2026-10-26T00:00:00Z",
  end: "2026-10-27T00:00:00Z",
  directory: "/tmp/kelly-security-test-no-real-acquisition",
};
const copy = (value) => structuredClone(value);

const fakeStore = ({ claimError = "", hideReadback = false } = {}) => {
  let sequence = 0;
  const data = { hosts: new Map(), runs: new Map(), checks: new Map(), evidence: new Map(), findings: new Map() };
  const put = (key, id, fields) => {
    const values = {
      ...fields,
      ...(["checks", "findings"].includes(key) && fields.run ? { "run-reference": fields.run } : {}),
      ...(key === "evidence" && fields.check ? { "check-reference": fields.check } : {}),
    };
    const row = { id, baseId: key, headCommitId: `commit-${++sequence}`, fields: copy(values) };
    data[key].set(id, row);
    return copy(row);
  };
  put("hosts", "host_lab", { title: "Lab web", "ssh-alias": "lab-web" });
  put("runs", "run_lab", {
    title: "Lab investigation",
    host: "host_lab",
    "scope-reference": options.scope,
    "window-start": options.start,
    "window-end": options.end,
    "check-profile": "intrusion-triage",
    status: "requested",
  });
  const store = {
    data,
    put,
    async get(key, id) {
      const row = data[key].get(id);
      if (!row) throw new Error("RECORD_NOT_FOUND");
      return copy(row);
    },
    async page(key, { valueFilters = [] } = {}) {
      return {
        records:
          hideReadback && key === "checks"
            ? []
            : [...data[key].values()]
                .filter((row) => valueFilters.every((filter) => row.fields[filter.fieldSlug] === filter.value))
                .map(copy),
        nextCursor: null,
      };
    },
    async create(key, fields, idempotencyKey) {
      const existing = [...data[key].values()].find((row) => row.idempotencyKey === idempotencyKey);
      if (existing) return copy(existing);
      const row = put(key, `${key}_${++sequence}`, fields);
      data[key].get(row.id).idempotencyKey = idempotencyKey;
      return copy(data[key].get(row.id));
    },
    async update(key, row, fields) {
      if (claimError && key === "runs" && fields["claim-reference"]) throw new Error(claimError);
      const current = data[key].get(row.id);
      if (current.headCommitId !== row.headCommitId) throw new Error("STALE_HEAD");
      return put(key, row.id, { ...current.fields, ...fields });
    },
  };
  return store;
};

const collected = ({ code = 0, status = "completed", gaps = [] } = {}) => ({
  artifact: "synthetic.json",
  sha256: "f".repeat(64),
  startedAt: "2026-10-26T10:00:00.000Z",
  collectedAt: "2026-10-26T10:00:01.000Z",
  code,
  analysis: {
    status,
    conclusion: code ? "insufficient-evidence" : "no-indicators",
    signals: [],
    gaps,
    summary: "Synthetic collection fixture only",
  },
});

test("the local authorization independently bounds target, time and scope", async () => {
  for (const override of [
    { aliases: ["another-host"] },
    { scope: "another-case" },
    { start: "2026-10-26T01:00:00Z" },
    { end: "2026-10-26T23:00:00Z" },
  ]) {
    const store = fakeStore();
    let calls = 0;
    await assert.rejects(
      executeRun(
        store,
        { ...options, ...override },
        {
          collector: async () => {
            calls++;
            return collected();
          },
        },
      ),
    );
    assert.equal(calls, 0);
    assert.equal((await store.get("runs", "run_lab")).fields.status, "requested");
  }
});

test("example hosts and an unrecognized check profile cannot execute", async () => {
  const example = fakeStore();
  example.data.hosts.get("host_lab").fields["is-example"] = true;
  await assert.rejects(planRun(example, options), /HOST_OUTSIDE/);
  const unknown = fakeStore();
  unknown.data.runs.get("run_lab").fields["check-profile"] = "arbitrary-command";
  await assert.rejects(planRun(unknown, options), /UNKNOWN_CHECK_PROFILE/);
});

test("queued and conflicting claims perform no SSH collection", async () => {
  for (const claimError of ["WRITE_PENDING", "STALE_HEAD"]) {
    const store = fakeStore({ claimError });
    let calls = 0;
    await assert.rejects(
      executeRun(store, options, {
        collector: async () => {
          calls++;
          return collected();
        },
      }),
      new RegExp(claimError),
    );
    assert.equal(calls, 0);
  }
});

test("a live runner claim blocks another runner even when resume is requested", async () => {
  const store = fakeStore();
  Object.assign(store.data.runs.get("run_lab").fields, {
    status: "running",
    "heartbeat-at": new Date().toISOString(),
    "runner-id": "existing-runner",
  });
  let calls = 0;
  await assert.rejects(
    executeRun(
      store,
      { ...options, resume: true },
      {
        collector: async () => {
          calls++;
          return collected();
        },
      },
    ),
    /LIVE_CLAIM/,
  );
  assert.equal(calls, 0);
});

test("completed and cancelled tasks cannot silently rerun", async () => {
  for (const status of ["completed", "cancelled"]) {
    const store = fakeStore();
    store.data.runs.get("run_lab").fields.status = status;
    let calls = 0;
    await assert.rejects(
      executeRun(
        store,
        { ...options, resume: true },
        {
          collector: async () => {
            calls++;
            return collected();
          },
        },
      ),
      /RUN_NOT_EXECUTABLE/,
    );
    assert.equal(calls, 0);
  }
});

test("cancel after the current collection preserves it and prevents the next one", async () => {
  const store = fakeStore();
  let calls = 0;
  const result = await executeRun(store, options, {
    runnerId: "test-runner",
    collector: async () => {
      calls++;
      const run = await store.get("runs", "run_lab");
      await store.update("runs", run, { status: "cancelled" });
      return collected();
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "cancelled");
  assert.equal(store.data.evidence.size, 1);
  assert.equal([...store.data.checks.values()][0].fields.status, "completed");
});

test("SSH connection rejection stops the host rather than repeating every check", async () => {
  const store = fakeStore();
  let calls = 0;
  try {
    await executeRun(store, options, {
      collector: async () => {
        calls++;
        return collected({ code: 255, status: "failed", gaps: ["ssh-connection-failed"] });
      },
    });
  } catch {
    // Either a failed result or a diagnosed rejection may represent this stopped run.
  }
  assert.equal(calls, 1);
  assert.equal((await store.get("runs", "run_lab")).fields.status, "failed");
});

test("missing saved checks in final readback cannot yield completed", async () => {
  const store = fakeStore({ hideReadback: true });
  try {
    await executeRun(store, options, { collector: async () => collected() });
  } catch {
    /* A readback inconsistency is a valid explicit failure. */
  }
  assert.notEqual((await store.get("runs", "run_lab")).fields.status, "completed");
});

test("a partial collection error is recoverable without erasing the previous attempt", async () => {
  const store = fakeStore();
  await assert.rejects(
    executeRun(store, options, {
      collector: async () => {
        throw new Error("SYNTHETIC_DISCONNECT");
      },
    }),
    /SYNTHETIC_DISCONNECT/,
  );
  assert.equal((await store.get("runs", "run_lab")).fields.status, "failed");
  const first = [...store.data.checks.values()][0];
  assert.equal(first.fields.status, "failed");
  await assert.rejects(executeRun(store, options, { collector: async () => collected() }), /EXPLICIT_RESUME/);
  await executeRun(store, { ...options, resume: true }, { collector: async () => collected() });
  const attempts = [...store.data.checks.values()].filter((row) => row.fields["check-id"] === CHECKS[0].id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts.find((row) => row.fields.attempt === 1).fields.status, "failed");
  assert.equal(attempts.find((row) => row.fields.attempt === 2).fields.status, "completed");
});

test("resume reuses completed checks and supersedes an interrupted attempt", async () => {
  const store = fakeStore();
  Object.assign(store.data.runs.get("run_lab").fields, {
    status: "running",
    "heartbeat-at": "2020-01-01T00:00:00Z",
    "runner-id": "old-runner",
  });
  store.put("checks", "check_finished", {
    title: CHECKS[0].name,
    run: "run_lab",
    "check-id": CHECKS[0].id,
    attempt: 1,
    status: "completed",
    conclusion: "no-indicators",
  });
  store.put("checks", "check_interrupted", {
    title: CHECKS[1].name,
    run: "run_lab",
    "check-id": CHECKS[1].id,
    attempt: 1,
    status: "running",
    conclusion: "unassessed",
  });
  const called = [];
  await executeRun(
    store,
    { ...options, resume: true },
    {
      collector: async ({ check }) => {
        called.push(check.id);
        return collected();
      },
    },
  );
  assert.equal(called.includes(CHECKS[0].id), false);
  assert.equal(called.length, CHECKS.length - 1);
  assert.equal(store.data.checks.get("check_interrupted").fields.status, "failed");
  assert.ok(
    [...store.data.checks.values()].some(
      (row) => row.fields["check-id"] === CHECKS[1].id && row.fields.attempt === 2 && row.fields.status === "completed",
    ),
  );
});

test("checks returned from another investigation cannot suppress this run's collection", async () => {
  const store = fakeStore();
  const originalPage = store.page.bind(store);
  store.page = async (key, args) => {
    const page = await originalPage(key, args);
    if (key === "checks" && page.records.length === 0)
      return {
        records: [
          {
            id: "foreign_check",
            baseId: "checks",
            headCommitId: "foreign-head",
            fields: {
              title: "Other case",
              run: "other_run",
              "check-id": CHECKS[0].id,
              attempt: 1,
              status: "completed",
            },
          },
        ],
        nextCursor: null,
      };
    return page;
  };
  const called = [];
  try {
    await executeRun(store, options, {
      collector: async ({ check }) => {
        called.push(check.id);
        return collected();
      },
    });
  } catch {
    /* Refusing an untrusted filter result is acceptable. */
  }
  assert.ok(
    called.length === 0 || called.includes(CHECKS[0].id),
    "A different case's completed check was incorrectly reused",
  );
});
