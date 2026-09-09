import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { MESSAGES } from "../app/i18n/messages.js";

test("Chinese and English catalogs expose the same UI keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.zh).sort(), Object.keys(MESSAGES.en).sort());
});

test("Chinese mode covers forms, readiness details, settings, and the Busabase gate", () => {
  assert.equal(MESSAGES.zh.field_character_id, "人物 ID");
  assert.equal(MESSAGES.zh.readiness_camera, "镜头规格");
  assert.equal(MESSAGES.zh.image_config_base_url, "服务地址");
  assert.equal(MESSAGES.zh.gate_connect_title, "连接 Busabase");
});

test("primary UI modules use catalog keys instead of known English fallbacks", async () => {
  const sources = await Promise.all(
    ["forms.js", "episodes.js", "overview.js", "settings.js", "shots.js", "connect-gate.js"].map((file) =>
      fs.readFile(new URL(`../app/js/${file}`, import.meta.url), "utf8"),
    ),
  );
  const combined = sources.join("\n");
  for (const text of [
    'input("title", "Title"',
    'input("id", "Character ID"',
    ">Storyboard</h3>",
    ">Connect Busabase</h1>",
    ">Custom server</strong>",
    ">No rendered videos found.</p>",
  ]) {
    assert.equal(combined.includes(text), false, text);
  }
});
