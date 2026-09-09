import assert from "node:assert/strict";
import test from "node:test";
import {
  episodeRenderAgentPrompt,
  generationCapability,
  requestAgentAction,
} from "../content/kelly-drama-app/app/js/agent-bridge.js";

test("requestAgentAction emits the versioned Buda protocol only when embedded", () => {
  const messages = [];
  const parent = { postMessage: (...args) => messages.push(args) };
  globalThis.window = { parent };
  assert.equal(
    requestAgentAction({ requestId: "drama:image:1", label: "Generate", prompt: "Run the exact image job." }),
    true,
  );
  assert.deepEqual(messages[0], [
    {
      type: "buda:agent-action-request",
      version: 1,
      requestId: "drama:image:1",
      label: "Generate",
      prompt: "Run the exact image job.",
    },
    "*",
  ]);
  globalThis.window = undefined;
});

test("generationCapability accepts either local or API TTS", () => {
  const capability = generationCapability(
    { providers: { qwen_tts: { available: false }, api_tts: { available: true } } },
    "voice",
  );
  assert.equal(capability.available, true);
});

test("episode render prompt is project and episode specific", () => {
  const prompt = episodeRenderAgentPrompt({ projectId: "drama-a", episodeId: "ep-003" });
  assert.match(prompt, /--project drama-a --episode ep-003 --apply/);
});
