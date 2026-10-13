import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const skillRoot = join(repoRoot, "skills", "kelly-dog-walk");
const appRoot = join(skillRoot, "content", "kelly-dog-walk-app");
const browserRoot = join(appRoot, "app");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const read = (path) => readFile(path, "utf8");

const { appConfig } = await import(join(browserRoot, "js", "config.js"));
const { parseJudgeRules, parsePlaybookHistory, parseRuleCard } = await import(join(browserRoot, "js", "walk-model.js"));

test("has the canonical app project and deterministic commands", async () => {
  for (const path of [
    "package.json",
    "pnpm-lock.yaml",
    "server.js",
    "_node.json",
    ".busabaseignore",
    "scripts/check.mjs",
    "app/index.html",
    "app/app.js",
    "app/demo-data.json",
    "app/js/config.js",
    "app/js/walk-model.js",
    "app/js/view-model.js",
    "app/js/providers/index.js",
    "app/js/providers/busabase-provider.js",
    "app/js/providers/demo-provider.js",
  ]) {
    await readFile(join(appRoot, path));
  }
  const pkg = await readJson(join(appRoot, "package.json"));
  assert.equal(pkg.engines.node, ">=24.18.0");
  assert.equal(pkg.scripts.dev, "node server.js");
  assert.equal(pkg.scripts.start, "node server.js");
  assert.match(pkg.scripts.check, /node --test/);
  assert.match(pkg.dependencies["busabase-sdk"], /^\d+\.\d+\.\d+$/);
  const skillPkg = await readJson(join(skillRoot, "package.json"));
  assert.equal(skillPkg.dependencies["busabase-sdk"], pkg.dependencies["busabase-sdk"], "one SDK version per skill");
});

test("manifest, SKILL.md and the app declaration agree on identity and resources", async () => {
  const manifest = await readJson(join(skillRoot, "busabase.json"));
  assert.equal(manifest.format, "busabase-package@1");
  assert.equal(manifest.name, appConfig.appId);
  assert.equal(manifest.template.schemaVersion, appConfig.schemaVersion);
  assert.equal(manifest.template.airapp, appConfig.airApp.slug);
  for (const shot of manifest.template.screenshots) await readFile(join(skillRoot, shot));

  const skill = await read(join(skillRoot, "SKILL.md"));
  assert.match(skill, /^name: kelly-dog-walk$/m);
  assert.match(skill, /^\s*template: true$/m);
  assert.match(skill, /^ {2}category: platform$/m);
  assert.match(skill, /^ {4}- risk:local-write$/m);
  const resources = [...skill.matchAll(/^\s{6}- (\S+)$/gm)].map((match) => match[1]);
  assert.deepEqual(resources.sort(), appConfig.bases.map((base) => base.key).sort());
  for (const base of appConfig.bases) {
    assert.equal(base.slug, `kelly-dog-walk-${base.key}`);
    assert.equal("nodeId" in base || "baseId" in base, false, `${base.key} must not pin ids`);
    const declared = await readJson(join(skillRoot, "content", base.key, "base.json"));
    assert.equal(declared.name, base.name);
    assert.deepEqual(
      declared.fields.map((field) => field.slug),
      base.fields.map((field) => field.slug),
    );
  }
});

test("content/ is generated, and current", () => {
  execFileSync(process.execPath, ["scripts/sync-content.mjs", "--check"], { cwd: skillRoot, stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/build-demo.mjs", "--check"], { cwd: skillRoot, stdio: "pipe" });
});

test("the template ships 遛狗手册 at v1 as a skill node, and 裁判规则 v1 as a doc", async () => {
  const node = await readJson(join(skillRoot, "content", "walk-playbook", "_node.json"));
  assert.equal(node.type, "skill");
  assert.equal(node.name, "遛狗手册");
  const playbook = await read(join(skillRoot, "content", "walk-playbook", "SKILL.md"));
  assert.equal(playbook, await read(join(skillRoot, "references", "playbooks", "v1.md")));
  const card = parseRuleCard(playbook);
  assert.equal(card.version, "v1");
  assert.deepEqual(card.hours, [7, 8, 17, 18, 19, 20, 21]);
  assert.equal(card.defaultHour, 18);
  assert.equal(card.switchRule.kind, "never");
  assert.equal(card.skipRule.kind, "none");
  for (const heading of ["## 生效规则", "## 规则卡", "## 不要做", "## 版本记录", "## 已退休"]) {
    assert.ok(playbook.includes(heading), heading);
  }
  assert.match(playbook, /^当前版本：v1$/m);

  const judgeDoc = await read(join(skillRoot, "content", "judge-rules.md"));
  assert.match(judgeDoc, /^name: 裁判规则$/m);
  const judge = parseJudgeRules(judgeDoc);
  assert.deepEqual([judge.version, judge.wetMm, judge.hotC, judge.guardrails], ["v1", 0.2, 32, null]);
  assert.deepEqual(judge.ownerHours, [7, 8, 17, 18, 19, 20, 21]);
  assert.match(judgeDoc, /## v2 会加什么/);
  const v2 = parseJudgeRules(await read(join(skillRoot, "references", "judge-rules-v2.md")));
  assert.deepEqual(v2.guardrails, { hot: 0, off: 0 });
});

test("each course playbook keeps human rules and rule card in step, and history only grows", async () => {
  let previous = null;
  for (const version of ["v1", "v2", "v3", "v4"]) {
    const text = await read(join(skillRoot, "references", "playbooks", `${version}.md`));
    const card = parseRuleCard(text);
    const history = parsePlaybookHistory(text);
    assert.equal(card.version, version);
    assert.equal(history.current, version);
    assert.equal(history.versions.at(-1).version, version);
    if (previous) {
      for (const entry of previous.versions) {
        assert.ok(
          history.versions.some((other) => other.version === entry.version && other.change === entry.change),
          `${version} lost ${entry.version}`,
        );
      }
      for (const entry of previous.retired) assert.ok(history.retired.some((other) => other.rule === entry.rule));
    }
    previous = history;
  }
  assert.equal(previous.retired.length, 1, "v4 retires P5 and keeps it");
});

test("node agent prompts: natural zh, {target} on its own line, intents declared", async () => {
  const sidecars = [
    join(skillRoot, "content", "_folder.json"),
    join(skillRoot, "content", "walk-playbook", "_node.json"),
    join(skillRoot, "content", "decisions", "base.json"),
    join(skillRoot, "content", "weather", "base.json"),
    join(appRoot, "_node.json"),
  ];
  const labels = [];
  for (const file of sidecars) {
    const { agentPrompts } = await readJson(file);
    assert.ok(agentPrompts?.length, `${file} has prompts`);
    for (const prompt of agentPrompts) {
      assert.match(prompt.body, /^\{target\}\n\n/, `${prompt.key}: {target} on its own first line`);
      assert.ok(["read-only", "change"].includes(prompt.intent), prompt.key);
      assert.ok(prompt.label.length <= 80);
      labels.push(prompt.label);
    }
  }
  for (const label of ["抓取天气", "回放一个月", "复盘并提议改手册", "今天几点遛狗"]) {
    assert.ok(labels.includes(label), label);
  }
  const judgeDoc = await read(join(skillRoot, "content", "judge-rules.md"));
  assert.match(judgeDoc, /intent: read-only/);
  assert.doesNotMatch(judgeDoc, /intent: change/, "the judge is read-only to the agent");
});

test("the calendar and kanban views are declared for setup.mjs (the package carries only table views)", async () => {
  const views = await readJson(join(skillRoot, "references", "native-views.json"));
  assert.deepEqual(
    views.map((view) => [view.resourceKey, view.type, view.config.dateFieldSlug || view.config.stackByFieldSlug]),
    [
      ["decisions", "calendar", "date"],
      ["decisions", "kanban", "verdict"],
    ],
  );
});

test("the AirApp only reads: no write procedures, no approve button, no change-request calls", async () => {
  assert.equal(appConfig.readOnly, true);
  assert.deepEqual(appConfig.permissions.writeProcedures, []);
  const sources = [];
  for (const dir of [browserRoot, join(browserRoot, "js"), join(browserRoot, "js", "providers")]) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".js")) sources.push(await read(join(dir, entry.name)));
    }
  }
  const source = sources.join("\n");
  assert.doesNotMatch(source, /createChangeRequest|createBulkChangeRequest|changeRequests\.(merge|review)|updateMetadata/);
  assert.doesNotMatch(source, /BUSABASE_API_KEY|Authorization:\s*[`'"]Bearer/i);
  assert.doesNotMatch(source, /node:fs|child_process/);
  assert.doesNotMatch(await read(join(browserRoot, "js", "walk-model.js")), /fetch\(|XMLHttpRequest/);
});

test("trusted scripts: env credentials only, never ~/.busabase/.env, proposals never auto-merge", async () => {
  const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lib = code(await read(join(skillRoot, "scripts", "lib", "busabase.mjs")));
  assert.match(lib, /process\.env\.BUSABASE_BASE_URL/);
  assert.doesNotMatch(lib, /\.busabase\/\.env|homedir/);
  const propose = await read(join(skillRoot, "scripts", "propose.mjs"));
  assert.match(propose, /autoMerge: false/);
  assert.match(propose, /baseContentHash: current\.contentHash/);
  assert.match(propose, /--despite/);
  assert.doesNotMatch(propose, /changeRequests\.(merge|review)/, "the agent never merges its own proposal");
  for (const script of ["weather.mjs", "replay.mjs", "today.mjs", "propose.mjs", "setup.mjs"]) {
    const source = await read(join(skillRoot, "scripts", script));
    assert.doesNotMatch(source, /judge-rules\b.*update|updateContent/, `${script} must never edit the judge`);
  }
});
