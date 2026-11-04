// Opt-in conformance test: exercises the page's data layer against a live local
// Busabase server through this app's own standalone gateway (not the demo mode,
// not a fake in-process client).
//
// Requires a running `busabase server` reachable at BUSABASE_LIVE_TEST_URL, e.g.:
//
//   npx -y busabase@latest server --port 15420 --data /tmp/busabase-conformance-data
//   BUSABASE_LIVE_TEST_URL=http://127.0.0.1:15420 node --test test/busabase-conformance.test.mjs
//
// Skips itself (not a failure) when BUSABASE_LIVE_TEST_URL is unset, so it never
// blocks `npm run check` / CI, which has no Busabase server available.
import assert from "node:assert/strict";
import test from "node:test";

const LIVE_URL = process.env.BUSABASE_LIVE_TEST_URL;

test(
  "busabase conformance (live local server)",
  { skip: !LIVE_URL && "set BUSABASE_LIVE_TEST_URL to run" },
  async (t) => {
    process.env.BUSABASE_BASE_URL = LIVE_URL;
    process.env.BUSABASE_SPACE_ID = process.env.BUSABASE_SPACE_ID || "local";

    // The page calls `/api/v1` on its own origin; standalone, that is this
    // app's gateway (`server/local-auth.js`), which forwards to
    // BUSABASE_BASE_URL. The gateway is a real network hop, so the app listens
    // on a real socket and the data layer is pointed at it exactly as the page
    // points it at `window.location.origin`.
    const { serve } = await import("@hono/node-server");
    const { app } = await import("../server/hono.js");
    const server = await new Promise((resolve) => {
      const instance = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) =>
        resolve({ instance, port: info.port }),
      );
    });
    t.after(() => server.instance.close());
    const origin = `http://127.0.0.1:${server.port}`;

    const { useSameOriginBusabase } = await import("../app/js/data/connection.js");
    useSameOriginBusabase(origin);
    const { statePayload } = await import("../app/js/data/state.js");
    const { updateItems } = await import("../app/js/data/decisions.js");
    const { createProvider } = await import("../app/js/data/index.js");
    const { normalizeBatch } = await import("../app/js/data/provider-utils.js");

    await t.test("provisions declared Busabase resources on first contact", async () => {
      const body = await statePayload({});
      assert.equal(body.provider_status.ok, true, JSON.stringify(body.provider_status));
      assert.deepEqual(body.provider_status.connection, {
        folder_exists: true,
        base_exists: true,
        contacts_base_exists: true,
        settings_base_exists: true,
        drive_exists: true,
      });
    });

    await t.test("a saved review item surfaces in the page's state", async () => {
      // The queue stays empty until an account is configured (`needs_config`),
      // so configure one the way an operator does: a config row in Email
      // Settings, with Vault references rather than values.
      const provider = createProvider();
      const { appConfig } = await import("../app/js/config.js");
      const { createEmailClient } = await import("../app/js/busabase-client.js");
      await createEmailClient().upsertSettingsRecord(
        "kelly-email-config",
        {
          kind: "config",
          name: "Configuration",
          payload: JSON.stringify({
            mailboxes: [
              {
                mailbox_id: "conformance",
                primary_email: "conformance@example.test",
                imap: { host: "imap.example.test", vault_ref: "CONFORMANCE_IMAP" },
                smtp: { host: "smtp.example.test", vault_ref: "CONFORMANCE_SMTP" },
              },
            ],
          }),
        },
        `Configure ${appConfig.appName}`,
      );
      // Go through the provider's saveBatch — the path the trusted skill process
      // uses after scanning IMAP — rather than hand-crafting Base fields.
      await provider.saveBatch(
        normalizeBatch({
          batch_id: "conformance-batch",
          generated_at: new Date().toISOString(),
          source: "conformance-test",
          items: [
            {
              id: "conformance-item-1",
              uid: "conformance-item-1",
              subject: "Conformance test subject",
              from: "Someone <someone@example.test>",
              category: "other",
              status: "needs_review",
            },
          ],
        }),
      );
      const body = await statePayload({});
      const item = body.items.find((entry) => entry.id === "conformance-item-1");
      assert.ok(item, `expected seeded item in ${JSON.stringify(body.items.map((i) => i.id))}`);
      assert.equal(item.subject, "Conformance test subject");
      assert.equal(item.status, "needs_review");
    });

    await t.test("a decision from the page persists to Busabase", async () => {
      const body = await updateItems({ ids: ["conformance-item-1"], action: "approve_archive" });
      assert.deepEqual(body.changed, ["conformance-item-1"]);
      assert.equal(body.decisions, 1);
      const after = await statePayload({});
      const item = after.items.find((entry) => entry.id === "conformance-item-1");
      // The UI's "approve archive" is stored as the executable action `archive`,
      // which puts the item in the Approved queue for the trusted executor.
      assert.equal(item.decision.action, "archive");
      const { isApprovedForExecution } = await import("../app/js/data/workflow.js");
      assert.equal(isApprovedForExecution(item), true);
      assert.ok(after.counts.approved >= 1);
    });

    await t.test("gated-write boundary: the AirApp never touches IMAP/SMTP", async () => {
      // The AirApp only ever calls busabase-sdk. The trusted skill process owns
      // mailbox side effects. The server does not read the workspace at all.
      const fs = await import("node:fs/promises");
      const server = await fs.readFile(new URL("../server/hono.js", import.meta.url), "utf8");
      assert.doesNotMatch(server, /imap|nodemailer|smtp|createProvider/i);
    });

    // Runs last: it archives the Folder every test above depends on.
    await t.test("a Folder the owner archived is not recreated by the next read", async () => {
      const { appConfig } = await import("../app/js/config.js");
      const { providerStatus } = await import("../app/js/data/provider-status.js");
      const provider = createProvider();
      assert.ok(appConfig.folder.nodeId, "the Folder should be resolved by the earlier tests");

      const archived = await fetch(`${origin}/api/v1/nodes/change-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Archive Kelly Email on purpose",
          autoMerge: true,
          operations: [{ kind: "delete", nodeId: appConfig.folder.nodeId }],
        }),
      });
      assert.ok(archived.ok, await archived.text());

      // Every page load asks for the status, and every data call runs the same
      // check first: several rounds, because the old behaviour recreated the
      // Folder on the very first one.
      for (let round = 0; round < 3; round += 1) {
        const status = await providerStatus();
        assert.equal(status.ok, false, JSON.stringify(status));
        assert.match(String(status.error), /SETUP_ARCHIVED/);
      }
      const inspected = await provider.checkSchema();
      assert.equal(inspected.resources.folder, null, "the archived Folder must stay archived");

      // An operator explicitly applying the schema is still allowed to bring it back.
      const applied = await provider.ensureSchema({ apply: true });
      assert.equal(applied.ok, true, JSON.stringify(applied));
    });

    // The guard is about the Folder. Once the Space has a live Folder again (a
    // re-install), an old Drive sitting in the Trash must not stop the app from
    // creating the one it is missing.
    await t.test("a re-installed Space still gets its missing Drive", async () => {
      const { appConfig } = await import("../app/js/config.js");
      const { providerStatus } = await import("../app/js/data/provider-status.js");
      assert.ok(appConfig.drive.nodeId, "the Drive should exist after the explicit apply");
      const archived = await fetch(`${origin}/api/v1/nodes/change-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Archive the old Drive",
          autoMerge: true,
          operations: [{ kind: "delete", nodeId: appConfig.drive.nodeId }],
        }),
      });
      assert.ok(archived.ok, await archived.text());
      appConfig.drive.nodeId = "";
      const status = await providerStatus();
      assert.equal(status.ok, true, JSON.stringify(status));
      assert.equal(status.connection.drive_exists, true, JSON.stringify(status));
    });

    // The window a check-then-create guard leaves: the owner deletes the Folder
    // right after our read and before the creating call's own lookup. When
    // nothing is missing, provisioning must not reach that call at all.
    await t.test("a delete landing mid-provision does not rebuild the Folder", async () => {
      const { appConfig } = await import("../app/js/config.js");
      const { createEmailClient } = await import("../app/js/busabase-client.js");
      const folderId = appConfig.folder.nodeId;
      assert.ok(folderId, "the Folder should be live after the earlier re-install test");

      const liveFolder = async () => {
        const nodes = await (await fetch(`${origin}/api/v1/nodes?depth=3`)).json();
        const find = (list) => {
          for (const node of list) {
            if (node?.metadata?.resourceKey === "app-root") return node;
            const inner = find(node.children || []);
            if (inner) return inner;
          }
          return null;
        };
        return find(nodes);
      };
      assert.ok(await liveFolder(), "precondition: a live Folder");

      // How many reads of the Folder does a plain look take? Measure it rather
      // than assume, so the delete below lands right after the last one.
      const realFetch = globalThis.fetch;
      let folderReads = 0;
      let archiveAfter = Number.POSITIVE_INFINITY;
      globalThis.fetch = async (input, init) => {
        const response = await realFetch(input, init);
        const url = String(input?.url || input);
        if ((init?.method || "GET") === "GET" && url.includes(`/api/v1/nodes/${folderId}`)) {
          folderReads += 1;
          if (folderReads === archiveAfter) {
            await realFetch(`${origin}/api/v1/nodes/change-requests`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: "Owner archives the Folder mid-read",
                autoMerge: true,
                operations: [{ kind: "delete", nodeId: folderId }],
              }),
            });
          }
        }
        return response;
      };
      try {
        await createEmailClient().inspectResources();
        archiveAfter = folderReads;
        folderReads = 0;
        // Everything is in place, so this is the ordinary page-load path. The
        // owner's delete lands after its last read of the Folder.
        await createEmailClient().provisionResources();
      } finally {
        globalThis.fetch = realFetch;
      }
      assert.ok(
        archiveAfter >= 1 && folderReads >= archiveAfter,
        `the delete never fired (${folderReads} of ${archiveAfter} Folder reads)`,
      );
      assert.equal(await liveFolder(), null, "no replacement Folder may appear after the owner deleted it");
    });
  },
);
