import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { analyze } from "./analysis.mjs";
import { CATALOG_VERSION, buildRecipe, buildSshArgs } from "./catalog.mjs";

export const parseTransport = (text) => {
  const sources = [];
  const gaps = [];
  let frame;
  let ended = false;
  const valid64 = (value) =>
    value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
  for (const line of text.split("\n")) {
    if (!line && !frame) continue;
    if (line.startsWith("KELLY_FRAME ")) {
      if (frame) gaps.push("incomplete-source-frame");
      const name = line.slice(12);
      if (!valid64(name)) {
        gaps.push("invalid-source-frame");
        frame = null;
        continue;
      }
      frame = { source: Buffer.from(name, "base64").toString("utf8"), encoded: "" };
    } else if (line === "KELLY_FRAME_END") {
      if (!frame || !valid64(frame.encoded)) {
        gaps.push("invalid-source-frame");
        frame = null;
        continue;
      }
      const payload = Buffer.from(frame.encoded, "base64").toString("utf8");
      const status = payload.match(/\n(\d{1,3})\n$/);
      if (!status || Number(status[1]) > 255) gaps.push("missing-source-command-status");
      else sources.push({ source: frame.source, text: payload.slice(0, status.index), code: Number(status[1]) });
      frame = null;
    } else if (line === "KELLY_COLLECTION_END") {
      if (frame) gaps.push("incomplete-source-frame");
      ended = true;
    } else if (frame && /^[A-Za-z0-9+/=]*$/.test(line)) frame.encoded += line;
    else gaps.push("unframed-collection-data");
  }
  if (frame) gaps.push("incomplete-source-frame");
  if (!ended) gaps.push("collection-did-not-finish");
  return { sources, gaps: [...new Set(gaps)] };
};

// The only subprocess boundary. No shell, no arbitrary command option, and no remote writes.
export const runSsh = (alias, recipe, { timeoutMs = 60000, outputLimit = 20971520, spawnProcess = spawn } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess("ssh", buildSshArgs(alias), { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    const errors = [];
    let size = 0;
    let errorSize = 0;
    let limited = false;
    let settled = false;
    const finish = (error, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardKill);
      if (error) reject(error);
      else
        resolve({
          stdout: Buffer.concat(chunks).toString("utf8"),
          stderr: Buffer.concat(errors).toString("utf8"),
          code: code ?? 255,
          limited,
        });
    };
    let hardKill;
    const stop = () => {
      limited = true;
      child.kill("SIGTERM");
      hardKill ??= setTimeout(() => child.kill("SIGKILL"), 1000);
    };
    const timer = setTimeout(stop, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const left = Math.max(0, outputLimit - size);
      if (left) chunks.push(Buffer.from(chunk).subarray(0, left));
      size += chunk.length;
      if (size > outputLimit) stop();
    });
    child.stderr.on("data", (chunk) => {
      if (errorSize < 65536) errors.push(Buffer.from(chunk).subarray(0, 65536 - errorSize));
      errorSize += chunk.length;
      if (errorSize > 65536) stop();
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => finish(null, code));
    child.stdin.on("error", () => {}); // A rejected SSH connection closes stdin early.
    child.stdin.end(recipe);
  });

export const collectCheck = async ({ alias, check, window, directory, runId, attempt = 1, ssh = runSsh }) => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(runId) || !Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error("INVALID_ARTIFACT_ID");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error("EVIDENCE_DIRECTORY_MUST_BE_REAL_DIRECTORY");
  await chmod(directory, 0o700);
  const startedAt = new Date().toISOString();
  const recipe = buildRecipe(check.id, window);
  const result = await ssh(alias, recipe);
  const collectedAt = new Date().toISOString();
  const artifact = `${runId}-${check.id}-${attempt}.json`;
  const payload = JSON.stringify(
    {
      version: 1,
      runId,
      checkId: check.id,
      alias,
      window,
      attempt,
      startedAt,
      collectedAt,
      catalogVersion: CATALOG_VERSION,
      command: { executable: "ssh", args: buildSshArgs(alias), stdin: recipe },
      ...result,
    },
    null,
    2,
  );
  const bytes = Buffer.from(`${payload}\n`);
  const handle = await open(path.join(directory, artifact), "wx", 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const transport = parseTransport(result.stdout);
  return {
    artifact,
    sha256,
    startedAt,
    collectedAt,
    code: result.code,
    analysis: analyze({ check, window, ...result, sources: transport.sources, collectionGaps: transport.gaps }),
  };
};
