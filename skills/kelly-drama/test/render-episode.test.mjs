import assert from "node:assert/strict";
import test from "node:test";
import { episodeSrt } from "../scripts/render_episode.mjs";

test("episodeSrt offsets shot-local cues but preserves cumulative episode cues", () => {
  const srt = episodeSrt([
    {
      duration_seconds: 8,
      srt_json: JSON.stringify([{ time: "00:00:01,000 --> 00:00:03,000", text: "first" }]),
    },
    {
      duration_seconds: 12,
      srt_json: JSON.stringify([
        { time: "00:00:00,500 --> 00:00:02,000", text: "local second" },
        { time: "00:00:10,000 --> 00:00:12,000", text: "global second" },
      ]),
    },
  ]);
  assert.match(srt, /00:00:08,500 --> 00:00:10,000\nlocal second/);
  assert.match(srt, /00:00:10,000 --> 00:00:12,000\nglobal second/);
});
