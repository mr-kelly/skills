import assert from "node:assert/strict";
import test from "node:test";

import { auditCompactShell } from "../../scripts/audit-compact-shell.mjs";

test("all canonical Kelly apps consume the creator-owned compact shell asset", async () => {
  const result = await auditCompactShell();
  assert.equal(result.appCount, 67);
  assert.equal(new Set(result.apps).size, 67);
});
