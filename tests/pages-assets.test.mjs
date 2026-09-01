import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const CHECKER = path.resolve("scripts/check-pages-assets.mjs");

async function fixture(html, image = Buffer.from("RIFF-real-image-content")) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kelly-pages-assets-"));
  await mkdir(path.join(root, "skills", "demo", "assets"), { recursive: true });
  await writeFile(path.join(root, "index.html"), html);
  await writeFile(path.join(root, "skills", "demo", "assets", "shot.webp"), image);
  return root;
}

function check(root) {
  return spawnSync(process.execPath, [CHECKER, root], { encoding: "utf8" });
}

test("Pages asset check accepts staged local images and ignores script strings", async (t) => {
  const root = await fixture(`
    <img src="skills/demo/assets/shot.webp" data-shot-en="skills/demo/assets/shot.webp">
    <script>box.innerHTML = '<img src="' + current + '">'</script>
  `);
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 HTML files, 1 local images/);
});

test("Pages asset check rejects LFS pointers, missing files, and external GitHub images", async (t) => {
  const pointer = Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n");
  const root = await fixture(
    `<img src="skills/demo/assets/shot.webp"><img src="missing.webp"><img src="https://media.githubusercontent.com/media/example/repo/main/shot.webp">`,
    pointer,
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Git LFS pointer was staged/);
  assert.match(result.stderr, /missing image: missing\.webp/);
  assert.match(result.stderr, /external GitHub image URL remains/);
});
