import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const page = (name) => readFile(path.join(root, "docs", "s", `${name}.html`), "utf8");
const gallery = (html) => html.match(/<div class="shots">([\s\S]*?)<\/main>/)?.[1] ?? "";
const mediaOrder = (html) =>
  [...gallery(html).matchAll(/<figure class="shot(?: shot-video)?">/g)].map((match) => {
    const item = gallery(html).slice(match.index);
    const video = item.match(/^<figure class="shot shot-video">/);
    return video ? "video" : (item.match(/assets\/screenshots\/([^"?]+)"/)?.[1] ?? "unknown");
  });

test("template cover leads both site cards and the detail galleries", async () => {
  const index = await readFile(path.join(root, "docs", "index.html"), "utf8");
  for (const name of ["kelly-wechat-crm", "kelly-wechat-content"]) {
    const card = index.match(new RegExp(`<a class="card"[^>]+href="s/${name}\\.html">([\\s\\S]*?)<\\/a>`))?.[1];
    assert.ok(card, `${name} index card`);
    assert.match(card, /class="thumb template-cover"/);
    assert.match(card, new RegExp(`${name}/assets/screenshots/cover\\.webp`));
    assert.equal(mediaOrder(await page(name))[0], "cover.webp");
  }
});

test("manifest video follows the cover, uses the skill recording and loads on click", async () => {
  const html = await page("kelly-wechat-crm");
  assert.deepEqual(mediaOrder(html).slice(0, 3), ["cover.webp", "video", "actions.webp"]);
  assert.match(
    gallery(html),
    /data-video-en="https:\/\/media\.githubusercontent\.com\/media\/mr-kelly\/skills\/main\/skills\/kelly-wechat-crm\/assets\/recordings\/kelly-wechat-crm\.mp4"/,
  );
  assert.doesNotMatch(gallery(html), /<video\b/);
  assert.match(gallery(html), /data-label-zh="播放：演示录屏"/);
});

test("README gallery captions and existing recording pages remain available", async () => {
  const content = await page("kelly-wechat-content");
  assert.deepEqual(mediaOrder(content).slice(0, 3), ["cover.webp", "overview.webp", "sources.webp"]);
  assert.match(gallery(content), /<strong>公众号内容工作台<\/strong>/);
  assert.match(gallery(content), /<strong>总览<\/strong>/);

  const email = await page("kelly-email");
  assert.equal(mediaOrder(email)[0], "video");
  assert.match(gallery(email), /docs\/demo-recordings\/kelly-email\/kelly-email-demo-zh-CN\.mp4/);
  assert.match(gallery(email), /assets\/screenshots\/overview/);
});
