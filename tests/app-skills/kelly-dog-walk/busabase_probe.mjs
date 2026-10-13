// Test-only helper for ui_test.py: read (and, for the reviewer's part, approve + merge) through
// busabase-sdk against the temporary local Busabase. Uses the skill's own resolution code, so the
// test exercises the same lookup the trusted scripts do. Prints one JSON document.
//
//   node busabase_probe.mjs state
//   node busabase_probe.mjs merge <changeRequestId>     # what the HUMAN does in Busabase
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = fileURLToPath(new URL("../../../skills/kelly-dog-walk/", import.meta.url));
const lib = await import(join(skillRoot, "scripts", "lib", "busabase.mjs"));
const client = lib.connect();
const [action, arg] = process.argv.slice(2);

if (action === "merge") {
  const review = await client.changeRequests.review({ changeRequestIds: [arg], verdict: "approved" });
  const merged = await client.changeRequests.merge({ changeRequestIds: [arg] });
  console.log(JSON.stringify({ review: review.results?.[0]?.status, merge: merged.results?.[0]?.status }));
} else if (action === "state") {
  const ws = await lib.resolveWorkspace(client);
  const playbook = await lib.readPlaybook(client, ws);
  const judge = await lib.readJudge(client, ws);
  const decisions = await lib.listAll(client, ws.bases.decisions.baseId);
  const views = await client.bases.listViews({ baseId: ws.bases.decisions.baseId });
  const weatherCount = await client.records.count({ baseId: ws.bases.weather.baseId });
  const pending = await client.changeRequests.list({ affectsNodeId: ws.playbook.id, status: ["in_review"], limit: 20 });
  const items = pending.changeRequests || pending.items || [];
  // Which playbook the merged 每天的决定 record writes cited (x-busabase-playbook), as Busabase labels it.
  const written = await client.changeRequests.list({
    affectsNodeId: ws.bases.decisions.nodeId,
    status: ["merged"],
    limit: 50,
  });
  const decisionPlaybooks = [
    ...new Set(
      (written.changeRequests || written.items || [])
        .filter((item) => String(item.primaryOperation?.operation || "").startsWith("record_"))
        .map((item) => item.sourceAttribution?.playbook?.label ?? null),
    ),
  ];
  console.log(
    JSON.stringify({
      folder: { id: ws.folder.id, name: ws.folder.name },
      judgeStamped: ws.judge?.metadata?.resourceKey === "judge-rules",
      playbookVersion: playbook.content.match(/当前版本：(v\d+)/)?.[1],
      playbookRetired: (playbook.content.split("## 已退休")[1] || "").trim(),
      judgeVersion: judge.content.match(/当前版本：(v\d+)/)?.[1],
      decisions: decisions.map((row) => row.fields),
      weatherCount: weatherCount.total,
      views: views.map((view) => ({ slug: view.slug, type: view.type, config: view.config })),
      pending: items.filter((item) => item.status === "in_review").map((item) => item.id),
      decisionPlaybooks,
    }),
  );
} else {
  throw new Error(`unknown action ${action}`);
}
