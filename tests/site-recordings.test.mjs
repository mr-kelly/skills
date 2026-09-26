import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// The demo-recording cards on the skill pages depend on three facts that live in
// three different places — the file names, .gitattributes, and which GitHub host
// serves what — and every way of getting one wrong fails silently (a black
// player, a broken poster, a card that never appears). These read the committed
// docs/ rather than re-running the build, because docs/ is what ships.

const ROOT = path.resolve(import.meta.dirname, "..");
const RECORDINGS = path.join(ROOT, "docs", "demo-recordings");
const MEDIA_HOST = "https://media.githubusercontent.com/media/mr-kelly/skills/main/";
const PLAIN_HOST = "https://raw.githubusercontent.com/mr-kelly/skills/main/";

const recordings = fs
  .readdirSync(RECORDINGS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((dir) =>
    fs
      .readdirSync(path.join(RECORDINGS, dir.name))
      .filter((file) => file.endsWith(".mp4"))
      .map((file) => ({ skill: dir.name, file, rel: `docs/demo-recordings/${dir.name}/${file}` })),
  );

const filterOf = (rel) =>
  execFileSync("git", ["check-attr", "filter", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim().split(": ").pop();

test("there are recordings to check", () => {
  assert.ok(recordings.length > 0, "docs/demo-recordings/ has no .mp4 — these tests would pass vacuously");
});

test("every recording is named <skill>-<slug>-<zh-CN|en>.mp4, or the build cannot place it", () => {
  for (const { skill, file } of recordings) {
    assert.match(file, new RegExp(`^${skill}-.+-(zh-CN|en)\\.mp4$`), `${skill}/${file}`);
  }
});

test("recordings are LFS and posters are not — the host each one is fetched from depends on it", () => {
  // media.githubusercontent.com serves only LFS objects (a plain file 404s) and
  // raw.githubusercontent.com serves the pointer text for an LFS object. So the
  // video goes through one and the poster through the other, and a poster that
  // quietly became LFS would break in repository-mode docs with no build error.
  for (const { rel } of recordings) {
    assert.equal(filterOf(rel), "lfs", `${rel} must be tracked by Git LFS`);
    const poster = rel.replace(/\.mp4$/, ".webp");
    if (fs.existsSync(path.join(ROOT, poster))) {
      assert.notEqual(filterOf(poster), "lfs", `${poster} is a poster and must be a plain object`);
    }
  }
});

test("each skill page has a card per recording, wired to the right hosts", () => {
  for (const { skill, file, rel } of recordings) {
    const html = fs.readFileSync(path.join(ROOT, "docs", "s", `${skill}.html`), "utf8");
    assert.ok(html.includes('class="shot shot-video"'), `${skill}: page has no video card`);
    assert.ok(
      html.includes(`data-video-en="${MEDIA_HOST}${rel}"`) || html.includes(`data-video-zh="${MEDIA_HOST}${rel}"`),
      `${skill}: no video attribute points at ${MEDIA_HOST}${rel}`,
    );
    const poster = rel.replace(/\.mp4$/, ".webp");
    if (fs.existsSync(path.join(ROOT, poster))) {
      assert.ok(html.includes(`src="${PLAIN_HOST}${poster}"`), `${skill}: poster is not served from the plain host`);
    }
  }
});

test("a page with no recording has no video card, and the player is not on the page as a <video>", () => {
  const withVideo = new Set(recordings.map((r) => r.skill));
  for (const page of fs.readdirSync(path.join(ROOT, "docs", "s")).filter((f) => f.endsWith(".html"))) {
    const skill = page.replace(/\.html$/, "");
    const html = fs.readFileSync(path.join(ROOT, "docs", "s", page), "utf8");
    // The player's markup is built by script on click; a <video> in the HTML would
    // fetch the file on page load, which is exactly what the poster card avoids.
    const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    assert.ok(!/<video\b/i.test(markup), `${page}: contains a <video> element on load`);
    if (!withVideo.has(skill))
      assert.ok(!html.includes('class="shot shot-video"'), `${page}: has a video card but no recording`);
  }
});
