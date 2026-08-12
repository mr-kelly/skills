import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-jobhunt");
const appRoot = join(skillRoot, "app");
const browserRoot = join(appRoot, "app");
const requiredFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "server.js",
  "resource-map.json",
  "scripts/check.mjs",
  "app/index.html",
  "app/js/app.js",
  "app/js/config.js",
  "app/js/jobhunt-model.js",
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const browserSource = async () => {
  const files = [
    join(browserRoot, "js", "app.js"),
    join(browserRoot, "js", "busabase-client.js"),
    join(browserRoot, "js", "jobhunt-model.js"),
    join(browserRoot, "js", "providers", "busabase-provider.js"),
    join(browserRoot, "js", "providers", "demo-provider.js"),
    join(browserRoot, "js", "resource-provisioning.js"),
  ];
  return (await Promise.all(files.map((path) => readFile(path, "utf8")))).join("\n");
};

test("has the canonical app project and deterministic commands", async () => {
  await Promise.all(requiredFiles.map((path) => readFile(join(appRoot, path))));
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
});

test("keeps resource-map and runtime declarations aligned", async () => {
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  assert.equal(resourceMap.schemaVersion, appConfig.schemaVersion);
  assert.equal(resourceMap.appRoot.slug, appConfig.folder.slug);
  assert.equal(resourceMap.provisioning.mode, "lazy");
  assert.deepEqual(resourceMap.provisioning.mutations, appConfig.permissions.setupProcedures);
  assert.deepEqual(
    resourceMap.resources.map(({ key, slug, schemaVersion }) => ({ key, slug, schemaVersion })),
    appConfig.bases.map(({ key, slug }) => ({ key, slug, schemaVersion: appConfig.schemaVersion })),
  );
});

test("transport pagination is owned by the provider, not declared per Base", async () => {
  // A per-Base readLimit is how a desk ends up silently showing only the first
  // page: research routinely produces more than 100 contact addresses, and
  // neither demo mode nor a unit test would ever notice the truncation.
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const resourceMap = await readJson(join(appRoot, "resource-map.json"));
  for (const declaration of [...appConfig.bases, ...resourceMap.resources]) {
    assert.ok(!Object.hasOwn(declaration, "readLimit"), `${declaration.slug} still declares readLimit`);
  }

  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(provider, /const BUSABASE_RECORD_PAGE_SIZE = 100;/);
  assert.match(provider, /readAllPages/);
  // A server that keeps handing back the same cursor must not spin forever.
  assert.match(provider, /PAGINATION_LOOP/);
});

test("reads follow nextCursor past the first page", async () => {
  const { readAllPages } = await import(join(browserRoot, "js", "providers", "busabase-provider.js"));
  const total = 250;
  const rows = Array.from({ length: total }, (_, index) => ({ id: `rec_${index}`, fields: { name: `第${index}家` } }));
  const client = {
    records: {
      list: async ({ cursor }) => {
        const start = cursor ? Number(cursor) : 0;
        const slice = rows.slice(start, start + 100);
        const next = start + 100;
        return { records: slice, nextCursor: next < total ? String(next) : null };
      },
    },
  };
  const page = await readAllPages(client, { key: "companies", baseId: "bse_x" });
  assert.equal(page.records.length, total);
  assert.equal(page.pageCount, 3);
  assert.equal(page.records.at(-1).fields.name, "第249家");
});

test("a repeating cursor is reported instead of looping forever", async () => {
  const { readAllPages } = await import(join(browserRoot, "js", "providers", "busabase-provider.js"));
  const client = { records: { list: async () => ({ records: [], nextCursor: "same" }) } };
  await assert.rejects(() => readAllPages(client, { key: "leads", baseId: "bse_y" }), /PAGINATION_LOOP/);
});

test("does not persist secrets or domain state in browser storage", async () => {
  const source = await browserSource();
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.match(source, /createBusabaseClient/);
});

test("local OAuth selects and validates a Space before proxying SDK requests", async () => {
  const server = await readFile(join(appRoot, "server.js"), "utf8");
  const app = await readFile(join(browserRoot, "js", "app.js"), "utf8");
  assert.match(server, /new URL\("\/api\/v1\/auth"/);
  assert.match(server, /requiresSpace/);
  assert.match(server, /spaceError/);
  assert.match(server, /app\.post\("\/auth\/space"/);
  assert.match(server, /HttpOnly; SameSite=Lax/);
  assert.match(server, /cookieValue\(context, SPACE_COOKIE\)/);
  assert.doesNotMatch(server, /cookieValue\(context, SPACE_COOKIE\) \|\| context\.req\.header\("x-busabase-space"\)/);
  assert.match(app, /选择 Busabase Space/);
  assert.match(app, /authStatus\.requiresSpace/);
  assert.match(app, /fetch\("\/auth\/space"/);
});

test("first-run product onboarding is versioned Busabase domain state", async () => {
  const { appConfig } = await import(join(browserRoot, "js", "config.js"));
  const app = await readFile(join(browserRoot, "js", "app.js"), "utf8");
  const model = await readFile(join(browserRoot, "js", "jobhunt-model.js"), "utf8");
  assert.ok(Number.isInteger(appConfig.onboardingVersion) && appConfig.onboardingVersion > 0);
  assert.ok(appConfig.bases[0].fields.some((field) => field.slug === "onboarding-version"));
  assert.match(app, /renderOnboarding/);
  assert.match(app, /desk\.profile\.onboardingVersion < appConfig\.onboardingVersion/);
  assert.match(model, /"onboarding-version"/);
});

test("first-run onboarding renders fields from a shared helper", async () => {
  const app = await readFile(join(browserRoot, "js", "app.js"), "utf8");
  const onboarding = app.slice(app.indexOf("const renderOnboarding"), app.indexOf("const renderSpaceSetup"));
  assert.match(app, /const renderTextField/);
  assert.match(onboarding, /renderTextField\("data-onboarding"/);
  assert.doesNotMatch(onboarding, /\bfield\(/);
});

test("onboarding readiness reads only the profile before loading workflow queues", async () => {
  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  const app = await readFile(join(browserRoot, "js", "app.js"), "utf8");
  assert.match(provider, /getReadinessState\(\)[\s\S]*requireBase\("profile"\)/);
  assert.match(app, /provider\.getReadinessState\(\)[\s\S]*renderOnboarding\(\)[\s\S]*provider\.getState\(\)/);
});

test("no mail transport can ever run in browser code", async () => {
  // The Vault key names legitimately appear in the profile screen, which shows
  // whether credentials are configured. A transport or a value does not.
  const source = await browserSource();
  assert.doesNotMatch(source, /\bnodemailer\b|createTransport|sendMail|process\.env\.SMTP/i);
});

test("browser code never touches the Vault", async () => {
  // vault.get returns plaintext values, so reaching it from the browser would
  // put an app password one console.log away from the screen.
  const source = await browserSource();
  assert.doesNotMatch(source, /vault\.(get|update|clear)/);
});

test("the Vault is written by a trusted script that merges rather than replaces", async () => {
  const lib = await readFile(join(skillRoot, "scripts", "lib.mjs"), "utf8");
  const configure = await readFile(join(skillRoot, "scripts", "configure_smtp.mjs"), "utf8");
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");

  // busabase-sdk strips the Vault from its cloud client on purpose, so the
  // script talks to /api/v1/vault directly and treats a route-less instance as
  // a normal answer rather than a crash.
  assert.match(lib, /\/api\/v1\/vault/);
  // PUT /vault replaces the whole document; writing only our own keys would
  // delete every other item on the instance.
  assert.match(lib, /upsertVaultItems/);
  assert.match(configure, /upsertVaultItems/);
  assert.doesNotMatch(configure, /client\.vault\.update/);

  // A 404 on that route means "this is Cloud", not "you have no Vault" — Cloud
  // keeps one and injects its runtime items into the task environment instead.
  // Saying the feature is absent sent a real operator hunting for an hour.
  assert.match(lib, /vaultWriteUnavailableHint/);
  assert.doesNotMatch(lib, /没有 Vault（/);

  // So the sender reads the environment as a first-class source, and reports
  // readiness per key rather than as one "未配置".
  assert.match(send, /resolveSmtpSettings/);
  assert.match(send, /smtpMissingHint/);
  // The sender hands the password to the transport but never prints one: no
  // log line interpolates a resolved value, masked or otherwise, because this
  // output ends up in whatever captured the run.
  assert.doesNotMatch(send, /console\.log\([^)]*smtp\.SMTP/);
  // Same for the writer, which used to print a mask. A mask still leaks length.
  assert.doesNotMatch(configure, /"\*"\.repeat\(/);
  assert.doesNotMatch(configure, /console\.log\([^)]*\bpass\b/);
});

test("the resume builder never invents a claim and degrades without Chrome", async () => {
  const builder = await readFile(join(skillRoot, "scripts", "build_resume.mjs"), "utf8");
  const renderer = await readFile(join(skillRoot, "scripts", "render_pdf.mjs"), "utf8");
  // Everything printed comes from stored profile fields.
  assert.match(builder, /resume_source/);
  // Chrome prints from the command line; driving CDP would need a WebSocket
  // global that older Node builds do not have.
  assert.match(renderer, /--print-to-pdf=/);
  assert.doesNotMatch(renderer, /new WebSocket|webSocketDebuggerUrl/);
  // One Chrome that will not start must not end the attempt: try every browser
  // present — Playwright's cached Chromium counts — then Playwright itself.
  assert.match(renderer, /playwrightChromiums/);
  assert.match(renderer, /printWithPlaywright/);
  // A failure names every renderer it tried and why. Chrome's stderr is kept
  // for that reason, so an exit code alone is never the whole report.
  assert.match(renderer, /child\.stderr/);
  assert.match(renderer, /attempts/);
  // No renderer must leave the HTML behind rather than failing with nothing.
  assert.match(renderer, /HTML 预览/);
  assert.match(renderer, /CHROME_PATH/);
});

test("browser writes only auto-merge on a standalone local runtime", async () => {
  const provider = await readFile(join(browserRoot, "js", "providers", "busabase-provider.js"), "utf8");
  assert.match(provider, /isStandaloneLocalRuntime\(\)/);
  assert.doesNotMatch(provider, /autoMerge:\s*true/);
  assert.match(provider, /bases\.createChangeRequest/);
  assert.match(provider, /records\.changeRequest/);
});

test("the demo provider never reaches Busabase", async () => {
  const demo = await readFile(join(browserRoot, "js", "providers", "demo-provider.js"), "utf8");
  assert.doesNotMatch(demo, /createRuntimeClient|records\.list|changeRequest/);
});

test("trusted scripts carry their own credentials and default to a dry run", async () => {
  const lib = await readFile(join(skillRoot, "scripts", "lib.mjs"), "utf8");
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");
  const importLeads = await readFile(join(skillRoot, "scripts", "import_leads.mjs"), "utf8");

  assert.match(lib, /BUSABASE_API_KEY/);
  assert.doesNotMatch(lib, /window\./);
  for (const source of [send, importLeads]) {
    assert.match(source, /parseFlags\(process\.argv\.slice\(2\)\)/);
    assert.match(source, /if \(!apply/);
  }
  // A bulk import has no autoMerge flag on the server, so it must be reviewed
  // and merged explicitly rather than left pending forever.
  assert.match(importLeads, /mergeChangeRequest/);
  assert.match(lib, /changeRequests\.review/);
  assert.match(lib, /changeRequests\.merge/);
});

test("setup provisions the workspace and is safe to re-run", async () => {
  const setup = await readFile(join(skillRoot, "scripts", "setup.mjs"), "utf8");
  assert.match(setup, /parseFlags\(process\.argv\.slice\(2\)\)/);
  assert.match(setup, /if \(!apply/);
  // Reuses the app's declarations rather than a second copy of the schema, so a
  // Base added to config.js cannot be missed here.
  assert.match(setup, /provisionDeclaredResources/);
  assert.match(setup, /inspectProvisionedResources/);
  assert.doesNotMatch(setup, /slug: "jobhunt-/);
  // Reads back after writing: "created" without a verify is how a half-merged
  // structure ChangeRequest gets reported as success.
  assert.match(setup, /provisioned\.missing\.length/);
});

test("a test send routes the mail without touching the research", async () => {
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");
  assert.match(send, /--test-to/);
  // The recipient is swapped at send time only. Rehearsing by rewriting 25
  // contact rows to a test address is what destroyed an hour of research.
  assert.match(send, /const to = testTo \|\| company\.fields\.sent_to/);
  assert.match(send, /\[测试\]/);
  // No company was contacted, so none may be marked sent: the row belongs in
  // the queue it is still in.
  assert.match(send, /if \(!testTo\) \{\s*await client\.records\.changeRequest/);
});

test("a dry run never requires the resume attachment to exist", async () => {
  // The point of a dry run is to print the plan; crashing on a missing PDF
  // hides the very list the operator asked for.
  const send = await readFile(join(skillRoot, "scripts", "send_emails.mjs"), "utf8");
  assert.match(send, /if \(!resumeReady\)/);
  assert.match(send, /if \(apply\) fail\(/);
});

test("the resume directory ships empty and stays untracked", async () => {
  const gitignore = await readFile(join(skillRoot, ".gitignore"), "utf8");
  assert.match(gitignore, /^resume\/\*$/m);
  assert.match(gitignore, /^!resume\/\.gitkeep$/m);
});
