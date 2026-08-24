import assert from "node:assert/strict";
import test from "node:test";

import {
  buildState,
  normalizeShotRow,
  normalizeVideoRow,
  shotCounts,
  shotsForVideo,
  withShotRollup,
} from "../app/js/video-model.js";

test("normalizeVideoRow defaults status to idea and fills every field", () => {
  const video = normalizeVideoRow({ __recordId: "rec-1", title: "Video 1" });
  assert.equal(video.id, "rec-1");
  assert.equal(video.title, "Video 1");
  assert.equal(video.status, "idea");
  assert.equal(video.owner, "");
});

test("normalizeShotRow defaults recording_status to pending and code_reference to an em dash", () => {
  const shot = normalizeShotRow({ __recordId: "shot-1", video: "rec-1", shot_number: "2" });
  assert.equal(shot.id, "shot-1");
  assert.equal(shot.shot_number, 2);
  assert.equal(shot.recording_status, "pending");
  assert.equal(shot.code_reference, "—");
});

test("shotsForVideo filters by video id and sorts by shot_number", () => {
  const shots = [
    normalizeShotRow({ __recordId: "s3", video: "rec-1", shot_number: 3 }),
    normalizeShotRow({ __recordId: "s1", video: "rec-1", shot_number: 1 }),
    normalizeShotRow({ __recordId: "s2", video: "rec-2", shot_number: 1 }),
  ];
  const mine = shotsForVideo(shots, "rec-1");
  assert.deepEqual(
    mine.map((s) => s.id),
    ["s1", "s3"],
  );
});

test("shotCounts rolls up per recording_status", () => {
  const shots = [
    normalizeShotRow({ __recordId: "s1", video: "rec-1", recording_status: "recorded" }),
    normalizeShotRow({ __recordId: "s2", video: "rec-1", recording_status: "recorded" }),
    normalizeShotRow({ __recordId: "s3", video: "rec-1", recording_status: "needs_reshoot" }),
    normalizeShotRow({ __recordId: "s4", video: "rec-2", recording_status: "pending" }),
  ];
  const counts = shotCounts(shots, "rec-1");
  assert.equal(counts.total, 3);
  assert.deepEqual(counts.byStatus, { recorded: 2, needs_reshoot: 1 });
});

test("shotCounts returns an empty rollup for a video with no shots", () => {
  const counts = shotCounts([], "rec-1");
  assert.deepEqual(counts, { total: 0, byStatus: {} });
});

test("withShotRollup attaches shots.{total,byStatus} to every video", () => {
  const videos = [normalizeVideoRow({ __recordId: "rec-1", title: "V1" })];
  const shots = [normalizeShotRow({ __recordId: "s1", video: "rec-1", recording_status: "pending" })];
  const [video] = withShotRollup(videos, shots);
  assert.deepEqual(video.shots, { total: 1, byStatus: { pending: 1 } });
});

test("buildState reports videoCount and joins shots onto every video", () => {
  const videos = [normalizeVideoRow({ __recordId: "rec-1", title: "V1" })];
  const shots = [normalizeShotRow({ __recordId: "s1", video: "rec-1", recording_status: "recorded" })];
  const state = buildState(videos, shots, { demo: true });
  assert.equal(state.app, "kelly-demo-video-factory");
  assert.equal(state.videoCount, 1);
  assert.equal(state.demo, true);
  assert.equal(state.videos[0].shots.total, 1);
  assert.equal(state.shots.length, 1);
});
