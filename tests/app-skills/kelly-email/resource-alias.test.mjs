import assert from "node:assert/strict";
import test from "node:test";
import { chooseOwnedResourceCandidate } from "../../../skills/kelly-email/content/kelly-email-app/lib/data-provider/busabase-client.ts";

test("legacy populated Email Base wins over an empty replacement", () => {
  const selected = chooseOwnedResourceCandidate(
    [
      { node: { slug: "kelly-email-settings-v3" }, count: 3 },
      { node: { slug: "kelly-email-settings" }, count: 0 },
    ],
    "kelly-email-settings",
    "settings",
  );
  assert.equal(selected.slug, "kelly-email-settings-v3");
});

test("the declared Email Base wins when every owned candidate is empty", () => {
  const selected = chooseOwnedResourceCandidate(
    [
      { node: { slug: "kelly-email-settings-v3" }, count: 0 },
      { node: { slug: "kelly-email-settings" }, count: 0 },
    ],
    "kelly-email-settings",
    "settings",
  );
  assert.equal(selected.slug, "kelly-email-settings");
});

test("multiple populated owned Email Bases fail closed", () => {
  assert.throws(
    () =>
      chooseOwnedResourceCandidate(
        [
          { node: { slug: "kelly-email-settings-v3" }, count: 3 },
          { node: { slug: "kelly-email-settings" }, count: 1 },
        ],
        "kelly-email-settings",
        "settings",
      ),
    /multiple populated Kelly Email settings Bases/,
  );
});
