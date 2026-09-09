import assert from "node:assert/strict";
import test from "node:test";
import { targetVideoBitrate } from "../scripts/lib/media-preflight.mjs";
import { inspectCapabilities } from "../scripts/preflight.mjs";

test("targetVideoBitrate reserves headroom and audio inside the asset limit", () => {
  const limitBytes = 25 * 1024 * 1024;
  const bitrate = targetVideoBitrate({ durationSeconds: 120, limitBytes });
  assert.ok(bitrate > 250_000);
  assert.ok(((bitrate + 128_000) * 120) / 8 < limitBytes);
});

test("preflight never exposes credential values", () => {
  const result = inspectCapabilities({
    KELLY_DRAMA_IMAGE_API_KEY: "super-secret-image-key",
    KELLY_DRAMA_ARK_API_KEY: "super-secret-video-key",
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.providers.image.available, true);
  assert.equal(result.providers.seedance.available, true);
  assert.doesNotMatch(serialized, /super-secret/);
});
