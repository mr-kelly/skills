import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const appUrl = new URL("../app/", import.meta.url);

test("connect gate isolation loads last and constrains radio controls", async () => {
  const [index, integrations] = await Promise.all([
    readFile(new URL("index.html", appUrl), "utf8"),
    readFile(new URL("styles/integrations.css", appUrl), "utf8"),
  ]);

  const accentIndex = index.indexOf("./accent-theme.css");
  const integrationsIndex = index.indexOf("./styles/integrations.css?v=0.1.1");

  assert.ok(accentIndex >= 0, "accent theme stylesheet should be present");
  assert.ok(integrationsIndex > accentIndex, "gate isolation must load after app theme styles");
  assert.match(integrations, /\.bb-gate-server-card input\[type="radio"\]/);
  assert.match(integrations, /max-width:\s*16px/);
  assert.match(integrations, /\.bb-gate-footer\s*\{[\s\S]*?flex-direction:\s*column/);
});
