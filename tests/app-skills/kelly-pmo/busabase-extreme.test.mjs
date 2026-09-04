import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getFreePort, startProcess } from "../harness/process.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = join(repoRoot, "skills", "kelly-pmo", "content", "kelly-pmo-app");
const { CREATABLE_NODE_TYPES, createBusabaseClient } = await import(
  join(appRoot, "node_modules", "busabase-sdk", "dist", "index.js")
);
const BUSABASE_VERSION = "0.16.2";

const createNodeId = (result) =>
  result.node?.id || result.mergeSummary?.mergedNodeIds?.[0] || result.operations?.[0]?.nodeId;

async function waitForWorkspaceReady(baseUrl) {
  const deadline = Date.now() + 15_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/v1/nodes?depth=1`).catch(() => null);
    if (response?.ok) return;
    lastStatus = response?.status || 0;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Busabase health passed but workspace migrations never became ready (last HTTP ${lastStatus}).`);
}

test(
  "exercises every creatable node, every native view, bulk idempotency, pagination, grep, and restart persistence",
  { timeout: 180_000 },
  async () => {
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const dataDir = await mkdtemp(join(tmpdir(), "kelly-pmo-extreme-data-"));
    const home = await mkdtemp(join(tmpdir(), "kelly-pmo-extreme-home-"));
    const serverArgs = [
      "-y",
      `busabase@${BUSABASE_VERSION}`,
      "server",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--data",
      dataDir,
    ];
    let runtime;
    try {
      runtime = await startProcess({
        command: "npx",
        args: serverArgs,
        cwd: repoRoot,
        env: {},
        readyUrl: `${baseUrl}/api/health`,
        timeoutMs: 90_000,
      });
      // `/api/health` becomes available before the first-run PGlite migration
      // has committed every table. Probe a workspace route before proceeding.
      await waitForWorkspaceReady(baseUrl);
      let client = createBusabaseClient({ baseUrl });

      const rootResult = await client.nodes.createChangeRequest({
        operations: [
          {
            kind: "create",
            nodeType: "folder",
            slug: "pmo-extreme-lab",
            name: "PMO Extreme Lab",
            description: "Isolated Busabase capability test; never production data.",
            metadata: { suite: "kelly-pmo", disposable: true },
          },
        ],
        message: "Create isolated Kelly PMO extreme lab",
        submittedBy: "kelly-pmo-extreme-test",
        autoMerge: true,
      });
      const rootId = createNodeId(rootResult);
      assert.ok(rootId, rootResult);

      const stressBase = await client.bases.create({
        parentNodeId: rootId,
        slug: "field-and-view-matrix",
        name: "Field and View Matrix",
        description: "Covers editable, presentational, computed, and file-shaped field families.",
        autoMerge: true,
        fields: [
          { slug: "title", name: "Title", type: "text", required: true },
          { slug: "detail", name: "Detail", type: "longtext" },
          { slug: "markdown", name: "Markdown", type: "markdown" },
          { slug: "number", name: "Number", type: "number" },
          { slug: "checked", name: "Checked", type: "checkbox" },
          {
            slug: "status",
            name: "Status",
            type: "select",
            options: {
              choices: [
                { id: "open", name: "Open" },
                { id: "done", name: "Done" },
              ],
            },
          },
          {
            slug: "tags",
            name: "Tags",
            type: "multiselect",
            options: {
              choices: [
                { id: "alpha", name: "Alpha" },
                { id: "beta", name: "Beta" },
              ],
            },
          },
          { slug: "start", name: "Start", type: "date" },
          { slug: "end", name: "End", type: "date" },
          { slug: "url", name: "URL", type: "url" },
          { slug: "email", name: "Email", type: "email" },
          { slug: "phone", name: "Phone", type: "phone" },
          { slug: "code", name: "Code", type: "code", options: { code: { language: "javascript" } } },
          { slug: "json", name: "JSON", type: "json" },
          { slug: "yaml", name: "YAML", type: "yaml" },
          { slug: "html", name: "HTML", type: "html" },
          { slug: "whiteboard", name: "Whiteboard", type: "whiteboard" },
          { slug: "cover", name: "Cover", type: "attachment", options: { attachment: { maxFiles: 5 } } },
        ],
      });
      assert.equal(stressBase.materialized, true);
      assert.equal(stressBase.fields.length, 18);

      const viewSpecs = [
        {
          type: "table",
          name: "Table",
          config: { filters: [], sorts: [], visibleFieldSlugs: ["title", "status", "number"] },
        },
        {
          type: "gallery",
          name: "Gallery",
          config: {
            filters: [],
            sorts: [],
            visibleFieldSlugs: ["title", "status", "detail"],
            coverFieldSlug: "cover",
            coverFit: "cover",
            cardSize: "medium",
            showFieldLabels: true,
          },
        },
        {
          type: "kanban",
          name: "Kanban",
          config: { filters: [], sorts: [], stackByFieldSlug: "status", visibleFieldSlugs: ["title", "number"] },
        },
        {
          type: "calendar",
          name: "Calendar",
          config: { filters: [], sorts: [], dateFieldSlug: "start", visibleFieldSlugs: ["title", "status"] },
        },
        {
          type: "gantt",
          name: "Gantt",
          config: {
            filters: [],
            sorts: [],
            startFieldSlug: "start",
            endFieldSlug: "end",
            ganttScale: "week",
            visibleFieldSlugs: ["title", "status", "number"],
          },
        },
      ];
      for (const spec of viewSpecs) {
        const created = await client.views.changeRequest({
          operation: "create",
          baseId: stressBase.id,
          slug: `matrix-${spec.type}`,
          name: spec.name,
          type: spec.type,
          config: spec.config,
          autoMerge: true,
          submittedBy: "kelly-pmo-extreme-test",
        });
        assert.equal(created.materialized, true, spec.type);
      }
      const views = await client.bases.listViews({ baseId: stressBase.id, status: "active" });
      assert.deepEqual([...new Set(views.map((item) => item.type))].sort(), [
        "calendar",
        "gallery",
        "gantt",
        "kanban",
        "table",
      ]);

      const doc = await client.docs.create({
        parentNodeId: rootId,
        slug: "playbook",
        name: "Playbook",
        body: "# PMO extreme sentinel\n\nNode and view coverage.",
        autoMerge: true,
      });
      assert.equal(doc.materialized, true);

      const fileTreeNodes = [
        {
          type: "skill",
          slug: "operator-skill",
          name: "Operator Skill",
          files: [
            {
              path: "SKILL.md",
              content:
                "---\nname: operator-skill\ndescription: Test skill node for Kelly PMO.\n---\n\n# Operator Skill\n",
            },
          ],
        },
        {
          type: "drive",
          slug: "evidence-drive",
          name: "Evidence Drive",
          files: [{ path: "README.md", content: "# PMO extreme sentinel\n\nEvidence index.\n" }],
        },
        {
          type: "airapp",
          slug: "probe-airapp",
          name: "Probe AirApp",
          files: [
            {
              path: "package.json",
              content: JSON.stringify({ private: true, type: "module", scripts: { dev: "node server.js" } }),
            },
            {
              path: "server.js",
              content:
                'import { createServer } from "node:http"; createServer((_, r) => r.end("PMO extreme sentinel")).listen(process.env.PORT || 3000);',
            },
          ],
        },
      ];
      const createdTreeNodes = [];
      for (const spec of fileTreeNodes) {
        const created = await client.fileTrees.create({
          parentNodeId: rootId,
          ...spec,
          autoMerge: true,
          mergeMode: "replace",
          version: "0.1.0",
        });
        assert.equal(created.materialized, true, spec.type);
        createdTreeNodes.push(created.node.id);
      }

      const contentResult = await client.nodes.createChangeRequest({
        operations: ["form", "whiteboard", "workflow", "html"].map((nodeType) => ({
          kind: "create",
          nodeType,
          slug: `${nodeType}-probe`,
          name: `${nodeType} probe`,
          description: `Kelly PMO ${nodeType} capability probe`,
          parentNodeId: rootId,
        })),
        message: "Create content-node capability probes",
        submittedBy: "kelly-pmo-extreme-test",
        autoMerge: true,
      });
      const contentNodeIds = Object.fromEntries(
        contentResult.operations.map((operation) => [operation.headCommit.payload.nodeType, operation.nodeId]),
      );
      await client.nodes.updateContent({
        nodeId: contentNodeIds.whiteboard,
        content: { kind: "whiteboard", document: { version: 1, elements: [{ id: "sentinel" }], appState: {} } },
        autoMerge: true,
      });
      await client.nodes.updateContent({
        nodeId: contentNodeIds.workflow,
        content: {
          kind: "workflow",
          document: {
            version: 2,
            nodes: [
              { id: "start", kind: "trigger", position: { x: 0, y: 0 }, label: "Weekly", eventName: "weekly" },
              { id: "end", kind: "end", position: { x: 220, y: 0 }, label: "Done", outcome: "complete" },
            ],
            edges: [{ id: "edge", source: "start", target: "end", label: "", outcome: "" }],
            settings: { executionMode: "manual", concurrency: 1, timeoutMs: 30_000, errorPolicy: "stop" },
          },
        },
        autoMerge: true,
      });
      await client.nodes.updateContent({
        nodeId: contentNodeIds.html,
        content: {
          kind: "html",
          document: { version: 1, source: "<!doctype html><title>PMO extreme sentinel</title>" },
        },
        autoMerge: true,
      });
      const form = await client.forms.create({
        nodeId: contentNodeIds.form,
        targetBaseId: stressBase.id,
        name: "Stress intake",
        description: "Private form capability probe",
        bindings: [{ inputName: "title", fieldSlug: "title", required: true, label: "Title" }],
        page: { code: "<main><h1>PMO stress intake</h1></main>" },
        share: { isPublic: false, anonymousSubmit: false },
      });
      assert.equal(form.nodeId, contentNodeIds.form);

      const assetBytes = Buffer.from("PMO extreme sentinel file\n", "utf8");
      const upload = await client.assets.createUploadUrl({
        fileName: "sentinel.txt",
        mimeType: "text/plain",
        sizeBytes: assetBytes.byteLength,
        context: "kelly-pmo-extreme-test",
      });
      const uploadResponse = await fetch(new URL(upload.uploadUrl, baseUrl), {
        method: "PUT",
        headers: { "content-type": "text/plain" },
        body: assetBytes,
      });
      assert.equal(uploadResponse.ok, true);
      const confirmed = await client.assets.confirm({
        storageKey: upload.storageKey,
        fileName: "sentinel.txt",
        mimeType: "text/plain",
        sizeBytes: assetBytes.byteLength,
        context: "kelly-pmo-extreme-test",
      });
      const fileNode = await client.files.create({
        parentNodeId: rootId,
        slug: "sentinel-file",
        name: "Sentinel File",
        assetId: confirmed.assetId,
        autoMerge: true,
      });
      assert.equal(fileNode.materialized, true);

      const nodes = await client.nodes.list({ parentId: rootId, depth: 2 });
      const actualTypes = [
        ...new Set(nodes.flatMap((item) => [item.type, ...(item.children || []).map((child) => child.type)])),
      ];
      const expectedChildTypes = CREATABLE_NODE_TYPES.filter((type) => type !== "folder");
      for (const type of expectedChildTypes)
        assert.ok(actualTypes.includes(type), `${type} missing from ${actualTypes}`);

      const bulkRows = Array.from({ length: 1_000 }, (_, index) => ({
        title: `Extreme record ${String(index).padStart(4, "0")}`,
        detail: index === 777 ? "PMO extreme sentinel searchable record" : `payload ${index}`,
        markdown: `**row ${index}**`,
        number: index,
        checked: index % 2 === 0,
        status: index % 3 === 0 ? "done" : "open",
        tags: index % 2 === 0 ? ["alpha"] : ["beta"],
        start: "2026-09-01",
        end: "2026-09-30",
        url: `https://example.invalid/${index}`,
        email: `row-${index}@example.invalid`,
        phone: `+852000${String(index).padStart(4, "0")}`,
        code: `return ${index};`,
        json: JSON.stringify({ index }),
        yaml: `index: ${index}`,
        html: `<strong>${index}</strong>`,
      }));
      const firstBulk = await client.bases.createBulkChangeRequest({
        baseId: stressBase.id,
        records: bulkRows,
        message: "Insert 1000 PMO extreme records",
        submittedBy: "kelly-pmo-extreme-test",
        idempotencyKey: "kelly-pmo-extreme-1000-v1",
        autoMerge: true,
      });
      assert.equal(firstBulk.status, "merged");
      await client.bases.createBulkChangeRequest({
        baseId: stressBase.id,
        records: bulkRows,
        message: "Replay 1000 PMO extreme records",
        submittedBy: "kelly-pmo-extreme-test",
        idempotencyKey: "kelly-pmo-extreme-1000-v1",
        autoMerge: true,
      });
      assert.equal((await client.records.count({ baseId: stressBase.id })).total, 1_000);
      const firstPage = await client.records.list({ baseId: stressBase.id, limit: 100 });
      assert.equal(firstPage.records.length, 100);
      assert.ok(firstPage.nextCursor);
      const secondPage = await client.records.list({ baseId: stressBase.id, limit: 100, cursor: firstPage.nextCursor });
      assert.equal(secondPage.records.length, 100);
      assert.notEqual(firstPage.records[0].id, secondPage.records[0].id);

      await assert.rejects(
        client.grep({
          pattern: "PMO extreme sentinel",
          sources: ["nodes", "records"],
          scope: { nodes: { nodeIds: [doc.node.id, contentNodeIds.html] }, records: { baseIds: [stressBase.id] } },
          maxMatches: 20,
          contextLines: 1,
        }),
        /expected one of "files"\|"docs"\|"records"/,
      );
      const grepResponse = await fetch(`${baseUrl}/api/v1/grep`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pattern: "PMO extreme sentinel",
          sources: ["docs", "records"],
          scope: { docs: { nodeIds: [doc.node.id] }, records: { baseIds: [stressBase.id] } },
          maxMatches: 20,
          contextLines: 1,
        }),
      });
      assert.equal(grepResponse.ok, true);
      const grepResult = await grepResponse.json();
      assert.ok(grepResult.matches.some((item) => item.source === "docs"));
      assert.ok(grepResult.matches.some((item) => item.source === "records"));

      await runtime.stop();
      runtime = await startProcess({
        command: "npx",
        args: serverArgs,
        cwd: repoRoot,
        env: {},
        readyUrl: `${baseUrl}/api/health`,
        timeoutMs: 90_000,
      });
      await waitForWorkspaceReady(baseUrl);
      client = createBusabaseClient({ baseUrl });
      assert.equal((await client.records.count({ baseId: stressBase.id })).total, 1_000);
      assert.equal((await client.bases.listViews({ baseId: stressBase.id, status: "active" })).length, 5);
      const persisted = await client.nodes.list({ parentId: rootId, depth: 2 });
      assert.ok(persisted.length >= 10);
      assert.equal(createdTreeNodes.length, 3);
    } catch (error) {
      const diagnostics = runtime?.logs?.slice(-120).join("") || "No Busabase logs captured.";
      throw new Error(`${error instanceof Error ? error.stack : error}\n\nBusabase logs:\n${diagnostics}`);
    } finally {
      await runtime?.stop();
      await rm(dataDir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  },
);
