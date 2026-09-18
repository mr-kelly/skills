import assert from "node:assert/strict";
import test from "node:test";
import { enforceRecipientScopedReview } from "../../../skills/kelly-email/scripts/lib/support-intake.ts";

test("recipient-scoped support intake cannot silently inherit a cleanup action", () => {
  const rule = {
    category: "marketing",
    risk: [],
    status: "prepared",
    proposed_action: "archive",
    reason: "marketing rule matched",
  };
  const effective = enforceRecipientScopedReview(rule, "support@example.test");
  assert.equal(effective.status, "needs_review");
  assert.equal(effective.proposed_action, "review");
  assert.match(effective.reason, /Rule prefilter: marketing rule matched/);
  assert.equal(rule.proposed_action, "archive");
});

test("unscoped collection keeps the original rule result", () => {
  const rule = { status: "prepared", proposed_action: "archive", reason: "newsletter" };
  assert.equal(enforceRecipientScopedReview(rule), rule);
});
