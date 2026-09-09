import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MESSAGES } from "../content/kelly-drama-app/app/i18n/messages.js";

test("Chinese and English UI catalogs have matching keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.zh).sort(), Object.keys(MESSAGES.en).sort());
});

test("common canonical drama values render in Chinese and round-trip safely", async () => {
  const originals = new Map(
    ["window", "localStorage", "navigator"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  Object.defineProperty(globalThis, "window", { value: { location: { search: "?lang=zh" } }, configurable: true });
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: { languages: ["zh-CN"] }, configurable: true });
  try {
    const { canonicalValue, localizeValue } = await import("../content/kelly-drama-app/app/js/i18n.js");
    assert.equal(localizeValue("supporting continuity card"), "配角连续性参考卡");
    assert.equal(localizeValue("co-protagonist"), "共同主角");
    assert.equal(canonicalValue("配角连续性参考卡"), "supporting continuity card");
    assert.equal(canonicalValue("共同主角"), "co-protagonist");
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("primary UI modules do not reintroduce hard-coded English form labels", () => {
  const root = new URL("../content/kelly-drama-app/app/js/", import.meta.url);
  const files = ["forms.js", "episodes.js", "overview.js", "modal.js", "settings.js"];
  const forbidden = [
    'input("title", "Title"',
    '"Dramatic function"',
    '"Relationship type"',
    '"Actor / performance notes"',
    '"Supporting continuity card"',
    '>Storyboard<',
    '>Compositions<',
    'aria-label="Episode detail"',
  ];
  const source = files.map((file) => fs.readFileSync(new URL(file, root), "utf8")).join("\n");
  for (const text of forbidden) assert.ok(!source.includes(text), `hard-coded English UI text remains: ${text}`);
});
