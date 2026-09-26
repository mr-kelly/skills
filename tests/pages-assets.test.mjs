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

// ── Demo recordings ────────────────────────────────────────────────────────
// A recording is referenced from data-video-en / data-video-zh, not from an
// <img>, so the image scan cannot see it. Failure modes differ too: an LFS
// pointer served as video.mp4 does not 404 — the page loads, the poster
// shows, and the player opens onto a black frame. So a video is held to a
// stricter bar than an image: it must be an actual MP4 (an `ftyp` box at
// byte 4), not merely "not a pointer".

// Smallest thing that is honestly an MP4 as far as the signature goes.
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);

async function videoFixture(html, video = MP4) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kelly-pages-video-"));
  await mkdir(path.join(root, "s"), { recursive: true });
  await mkdir(path.join(root, "demo-recordings", "demo"), { recursive: true });
  await writeFile(path.join(root, "s", "demo.html"), html);
  await writeFile(path.join(root, "demo-recordings", "demo", "demo-demo-zh-CN.webp"), Buffer.from("RIFF-real-poster"));
  if (video) await writeFile(path.join(root, "demo-recordings", "demo", "demo-demo-zh-CN.mp4"), video);
  return root;
}

const VIDEO_HTML = `
  <figure class="shot shot-video">
    <button class="video-poster" data-video-en="../demo-recordings/demo/demo-demo-zh-CN.mp4" data-video-zh="../demo-recordings/demo/demo-demo-zh-CN.mp4">
      <img src="../demo-recordings/demo/demo-demo-zh-CN.webp" data-shot-en="../demo-recordings/demo/demo-demo-zh-CN.webp">
    </button>
  </figure>`;

test("Pages asset check accepts a staged recording and counts the video and its poster", async (t) => {
  const root = await videoFixture(VIDEO_HTML);
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 local images, 1 local videos/);
});

test("Pages asset check rejects a recording that is missing, a pointer, or not an MP4", async (t) => {
  const pointer = Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n");
  const cases = [
    ["missing", null, /missing video: \.\.\/demo-recordings\/demo\/demo-demo-zh-CN\.mp4/],
    ["an LFS pointer", pointer, /Git LFS pointer was staged instead of video content/],
    // e.g. an HTML error page saved under the .mp4 name — has no pointer text.
    ["not an MP4", Buffer.from("<html>404 Not Found</html>".padEnd(64)), /is not an MP4/],
  ];
  for (const [name, content, expected] of cases) {
    const root = await videoFixture(VIDEO_HTML, content);
    t.after(() => rm(root, { recursive: true, force: true }));
    const result = check(root);
    assert.notEqual(result.status, 0, `${name}: should have failed`);
    assert.match(result.stderr, expected, name);
  }
});

test("Pages asset check rejects a recording still pointing at the GitHub media host", async (t) => {
  const root = await videoFixture(
    `<button data-video-en="https://media.githubusercontent.com/media/example/repo/main/demo.mp4"></button>`,
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /external GitHub image URL remains/);
});
