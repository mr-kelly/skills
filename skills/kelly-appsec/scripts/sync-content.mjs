#!/usr/bin/env node
/**
 * Regenerate a template package's `content/` from the app's own declaration,
 * or verify it is current.
 *
 *   node scripts/sync-content.mjs           # rewrite content/
 *   node scripts/sync-content.mjs --check   # exit non-zero if stale (use in CI)
 *
 * Copy this into `<package>/scripts/` and run it from the package root.
 *
 * The app declaration is canonical because the app must be able to provision
 * its own resources at runtime, and it cannot read `content/` from inside the
 * installed node. Deriving the package sidecars from it is what keeps the two
 * provisioning routes — `busabase-cli install` reading `base.json`, and the app
 * calling `provisionDeclaredResources` — from landing on different Bases.
 *
 * Hand-editing `content/**\/base.json` is therefore never correct: the next run
 * of this script overwrites it, and until then the two routes disagree.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

/**
 * Which `content/` directory holds the app. Declared by a template
 * (`template.airapp`, or the `primary` of `template.airapps`); a plain package
 * does not declare one, so fall back to the single directory that looks like an
 * app. Ambiguity is reported rather than guessed — picking the wrong app here
 * would silently regenerate `content/` from another app's schema.
 */
async function resolveAppDirectory() {
  const manifest = await readJson("busabase.json").catch(() => ({}));
  const declared =
    manifest.template?.airapp ?? manifest.template?.airapps?.find((entry) => entry.role === "primary")?.slug;
  if (declared) return declared;

  const entries = await readdir(path.join(root, "content"), { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const config = path.join(root, "content", entry.name, "app", "js", "config.js");
    if (
      await readFile(config, "utf8")
        .then(() => true)
        .catch(() => false)
    ) {
      candidates.push(entry.name);
    }
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error(
    candidates.length
      ? `Several content/ directories look like apps (${candidates.join(", ")}). Declare template.airapp in busabase.json.`
      : "No content/<name>/app/js/config.js found. Run this from the package root.",
  );
}

const appDirectory = await resolveAppDirectory();
const { appConfig } = await import(path.join(root, "content", appDirectory, "app", "js", "config.js"));

const stale = [];
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const baseBySlug = new Map((appConfig.bases ?? []).map((base) => [base.slug, base]));

/**
 * A relation names its target twice, in two forms, and this translates between
 * them from the single declaration on the field.
 *
 * The app config uses the target's own `slug`, because that is what
 * `provisionDeclaredResources` resolves when the app builds its Bases in a live
 * Space. The package uses the target's `content/` directory name, because that
 * is what install resolves — it adds the package prefix itself.
 *
 * Declaring it only in the package (the old `templateRelations` map) is the
 * failure this replaces: install produced a working relation, provisioning
 * produced `options: {}` — a field that exists, is named, and links to nothing.
 * Only the second route runs in a live Space, so the package looked correct
 * everywhere except where it mattered. Hence the throw rather than a default:
 * a relation with no target is not a relation.
 */
const packageRelationOptions = (base, field) => {
  const options = { ...(field.options ?? {}) };
  if (field.type !== "relation") return options;
  const target = options.targetBaseSlug;
  if (!target) {
    throw new Error(
      `${base.key}.${field.slug} is a relation with no options.targetBaseSlug. Declare the target Base's slug on the field; provisioning reads it from there.`,
    );
  }
  const sibling = baseBySlug.get(target);
  if (!sibling) {
    throw new Error(`${base.key}.${field.slug} targets ${target}, which is not a Base in this package.`);
  }
  return { ...options, targetBaseSlug: sibling.key };
};

const emit = async (relativePath, contents) => {
  const target = path.join(root, relativePath);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== contents) stale.push(relativePath);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
};

let position = 0;
for (const base of appConfig.bases ?? []) {
  await emit(
    `content/${base.key}/base.json`,
    json({
      name: base.name,
      description: base.description ?? "",
      position: position++,
      agentPrompts: base.agentPrompts ?? [],
      fields: (base.fields ?? []).map((field, index) => ({
        slug: field.slug,
        name: field.name,
        type: field.type,
        required: Boolean(field.required),
        position: index,
        options: packageRelationOptions(base, field),
      })),
      views: (base.views ?? []).map((view) => ({
        slug: view.key,
        name: view.name,
        type: view.type,
        config: view.config,
      })),
    }),
  );
}

if (appConfig.drive) {
  await emit(
    `content/${appDirectory.replace(/-app$/, "")}-files/_node.json`,
    json({
      type: "drive",
      name: appConfig.drive.name,
      description: appConfig.drive.description ?? "",
      position: position++,
      agentPrompts: [
        {
          key: "export",
          label: "导出脱敏核查报告",
          body: "阅读此文件夹中的 kelly-appsec skill。导出带证据引用和覆盖限制的脱敏报告。",
        },
        {
          key: "verify",
          label: "检查报告的证据与限制",
          body: "阅读此文件夹中的 kelly-appsec skill。检查报告是否明确区分规则违反、证据缺口与人工结论，并绑定具体源码/部署版本。",
          intent: "read-only",
        },
      ],
    }),
  );
}

await emit(
  "content/_folder.json",
  json({
    name: appConfig.folder.name,
    description: appConfig.folder.description ?? "",
    agentPrompts: [
      {
        key: "investigate",
        label: "审计选中项目的接口与业务权限",
        body: "阅读此文件夹中的 kelly-appsec skill。在当前会话授权范围内审计选中项目的接口、身份和业务规则，列出证据与未覆盖项。",
      },
      {
        key: "explain",
        label: "解释最值得先查的线索",
        body: "阅读此文件夹中的 kelly-appsec skill。解释当前最值得先查的线索与证据缺口。",
        intent: "read-only",
      },
    ],
  }),
);

if (check && stale.length > 0) {
  console.error(
    `content/ is out of date with ${appDirectory}'s config.js:\n${stale
      .map((item) => `  ${item}`)
      .join("\n")}\n\nRun: node scripts/sync-content.mjs`,
  );
  process.exit(1);
}
console.log(check ? "content/ is up to date." : "content/ regenerated from config.js.");
