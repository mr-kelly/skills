// Shared plumbing for the trusted scripts: argv, where a playbook or judge comes from, and output.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `--name value`, `--name=value`, and bare `--flag`. Names listed in `repeatable` collect an array
 * (and also split on commas, so `--month 2026-06,2026-05` works too).
 */
export const parseArgs = (argv, { flags = [], values = [], repeatable = [] } = {}) => {
  const out = { _: [] };
  for (const name of repeatable) out[name] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const [rawName, inline] = arg.slice(2).split(/=(.*)/s);
    if (flags.includes(rawName)) {
      out[rawName] = true;
      continue;
    }
    if (!values.includes(rawName) && !repeatable.includes(rawName)) throw new Error(`不认识的参数 --${rawName}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${rawName} 后面要跟一个值`);
    if (repeatable.includes(rawName))
      out[rawName].push(
        ...value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    else out[rawName] = value;
  }
  return out;
};

export const run = (main) =>
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

const STORY_PLAYBOOKS = new Set(["v1", "v2", "v3", "v4"]);
const STORY_JUDGES = { v1: "content/judge-rules.md", v2: "references/judge-rules-v2.md" };

/**
 * Where a 遛狗手册 comes from:
 *   busabase   the live 遛狗手册 skill node (needs a Busabase connection)
 *   v1 … v4    the course's four versions, references/playbooks/vN.md
 *   <path>     any markdown file with a ```规则卡 block
 */
export const loadPlaybookSource = async (spec, busabase) => {
  if (spec === "busabase") {
    const { client, ws, readPlaybook } = await busabase();
    const file = await readPlaybook(client, ws);
    return { ...file, label: "Busabase 里的遛狗手册" };
  }
  if (STORY_PLAYBOOKS.has(spec)) {
    const file = path.join(SKILL_ROOT, "references", "playbooks", `${spec}.md`);
    return { content: await readFile(file, "utf8"), label: `课程手册 ${spec}`, file };
  }
  return { content: await readFile(path.resolve(spec), "utf8"), label: spec, file: path.resolve(spec) };
};

/** Same idea for the 裁判规则 Doc: busabase | v1 | v2 | <path>. */
export const loadJudgeSource = async (spec, busabase) => {
  if (spec === "busabase") {
    const { client, ws, readJudge } = await busabase();
    return { ...(await readJudge(client, ws)), label: "Busabase 里的裁判规则" };
  }
  if (STORY_JUDGES[spec]) {
    const file = path.join(SKILL_ROOT, STORY_JUDGES[spec]);
    return { content: await readFile(file, "utf8"), label: `课程裁判规则 ${spec}`, file };
  }
  return { content: await readFile(path.resolve(spec), "utf8"), label: spec, file: path.resolve(spec) };
};

/** Lazily connect once, only when a source actually says "busabase". */
export const lazyBusabase = (folderId) => {
  let pending;
  return () => {
    pending ||= (async () => {
      const lib = await import("./busabase.mjs");
      const client = lib.connect();
      const ws = await lib.resolveWorkspace(client, { folderId });
      return { client, ws, ...lib };
    })();
    return pending;
  };
};

export const padCells = (cells, widths) => cells.map((cell, i) => String(cell).padStart(widths[i])).join("");
