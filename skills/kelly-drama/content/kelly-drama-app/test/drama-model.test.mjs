import assert from "node:assert/strict";
import test from "node:test";
import {
  attention,
  completeness,
  countBy,
  dialogueCps,
  findActiveAssetId,
  framesForDuration,
  hasGeneratedRef,
  hasSoundBed,
  listToArray,
  shotCharacters,
  shotIsSilent,
  shotReadiness,
  slug,
  storyboardPrompt,
  storyboardPromptPreview,
  voiceInstruct,
  voiceScript,
} from "../app/js/drama-model.js";

// A fully video-ready shot per references/drama-workflow.md's Definition of
// Done: identity/timing, camera spec, motion, prompts, sound design, timed
// dialogue.
function readyShot(overrides = {}) {
  return {
    id: "shot-001-04",
    episode_id: "ep-001",
    title: "The correction",
    duration_seconds: 5,
    emotion: "tense",
    shot_size: "two-shot",
    camera_movement: "none",
    composition: "Tight two-shot at the altar",
    setting: "Hotel wedding hall, noon",
    lighting: "spotlight, cool rim",
    action: "He corrects one word and steps back",
    prompt: "Tight two-shot, altar, spotlight",
    negative_prompt: "watermark, extra fingers",
    video_prompt: "camera holds, subject leans in then withdraws",
    transition_in: "cut",
    transition_out: "cut",
    audio: { dialogue: [{ speaker: "Gu Chenzhou", line: "The name is Lin Wan.", tone: "flat" }] },
    srt: [{ time: "00:00:01,000 --> 00:00:03,400", text: "顾沉舟：新娘的名字，是林晚。" }],
    continuity: { anchors: ["rimless glasses"] },
    characters: ["char-gu-chenzhou"],
    ...overrides,
  };
}

// Worked example mirroring the shipped starter/demo project: a character
// missing a three-view (only front set), a relationship without evidence, an
// episode without a cliffhanger, and shots at varying completeness.
function sampleProject() {
  return {
    project_id: "kelly-drama-demo",
    series: {
      title: "Walking Against the Light",
      logline: "A disinherited heiress dismantles the family that erased her mother.",
      visual_bible: { realism_target: "live-action premium feel", color_palette: "amber / steel blue" },
    },
    characters: [
      {
        id: "char-lin-wan",
        name: "Lin Wan",
        role: "protagonist",
        visual: { front: "porcelain complexion", side: "", back: "" },
        reference_card: {},
      },
      {
        id: "char-gu-chenzhou",
        name: "Gu Chenzhou",
        role: "male lead",
        visual: { front: "tall, sharp jawline", side: "faint scar", back: "broad shoulders" },
        reference_card: { image_asset: "https://busabase.example/asset/gu" },
      },
    ],
    relationships: [{ id: "rel-1", from: "char-lin-wan", to: "char-gu-chenzhou", evidence: [] }],
    episodes: [
      { id: "ep-001", number: 1, title: "The Substitute Bride", cliffhanger: "he whispers a secret" },
      { id: "ep-002", number: 2, title: "A Paper Marriage", cliffhanger: "" },
    ],
    shots: [readyShot(), { id: "shot-002-01", episode_id: "ep-002", title: "Terms across the table" }],
    tasks: [
      { id: "task-1", status: "needs_review" },
      { id: "task-2", status: "approved" },
      { id: "task-3", status: "blocked" },
    ],
  };
}

test("completeness: worked example counts missing three-views/evidence/cliffhanger/prompt", () => {
  const c = completeness(sampleProject());
  assert.equal(c.characters_missing_views, 1); // char-lin-wan has no side/back
  assert.equal(c.relationships_missing_evidence, 1);
  assert.equal(c.episodes_missing_cliffhanger, 1); // ep-002
  assert.equal(c.shots_missing_prompt, 1); // shot-002-01 has no prompt/negative_prompt
});

test("attention tallies status across tasks/characters/episodes/shots", () => {
  const project = {
    tasks: [{ status: "needs_review" }, { status: "approved" }, { status: "blocked" }],
    characters: [{ status: "changes_requested" }],
    episodes: [{ status: "approved" }],
    shots: [{ status: "needs_review" }],
  };
  const a = attention(project);
  assert.equal(a.needs_review, 3); // 1 task + 1 character + 1 shot
  assert.equal(a.approved, 2); // 1 task + 1 episode
  assert.equal(a.blocked, 1);
  assert.deepEqual(countBy(project.tasks), { needs_review: 1, approved: 1, blocked: 1 });
});

test("shotReadiness: a fully specced shot is ready with no missing fields", () => {
  const r = shotReadiness(readyShot());
  assert.deepEqual(r.missing, []);
  assert.equal(r.ready, true);
  assert.equal(r.silent, false);
});

test("shotReadiness: a thin shot is missing camera/audio/transition/continuity/duration; with no dialogue it's classified silent and needs a sound bed", () => {
  const thin = { id: "shot-bare", title: "x", composition: "x" };
  assert.equal(shotIsSilent(thin), true); // no audio.dialogue/narration at all => silent by default
  const r = shotReadiness(thin);
  assert.ok(r.missing.includes("Camera spec"));
  assert.ok(r.missing.includes("Sound design"));
  assert.ok(r.missing.includes("Transition"));
  assert.ok(r.missing.includes("Continuity anchors"));
  assert.ok(r.missing.includes("Duration"));
  assert.ok(r.missing.includes("Sound bed"));
  assert.ok(!r.missing.includes("Dialogue SRT"));
  assert.equal(r.ready, false);
});

test("shotReadiness: a silent shot needs a sound bed instead of dialogue SRT", () => {
  const silent = readyShot({ silent: true, audio: { ambient: "hall murmur" }, srt: [] });
  assert.equal(shotIsSilent(silent), true);
  assert.equal(hasSoundBed(silent), true);
  const r = shotReadiness(silent);
  assert.ok(!r.missing.includes("Dialogue SRT"));
  assert.equal(r.ready, true);

  const silentNoBed = readyShot({ silent: true, audio: {}, srt: [] });
  const r2 = shotReadiness(silentNoBed);
  assert.ok(r2.missing.includes("Sound bed"));
});

test("dialogueCps flags overdense Chinese dialogue (> 8 chars/second)", () => {
  const dense = readyShot({
    duration_seconds: 2,
    srt: [{ text: "顾沉舟：新娘的名字，是林晚，此事绝无更改，全场静默无声。" }], // 28 chars over 2s = 14 cps
  });
  const cps = dialogueCps(dense);
  assert.ok(cps > 8, `expected cps > 8, got ${cps}`);
  const r = shotReadiness(dense);
  assert.equal(r.pacingWarn, true);
  assert.equal(r.ready, false);
});

test("storyboardPrompt: includes visual bible target and character-consistency note only when a reference card exists", () => {
  const project = sampleProject();
  const shot = readyShot({ characters: ["char-lin-wan"] });
  const withoutRef = storyboardPrompt(project, shot);
  assert.match(withoutRef, /Visual target: live-action premium feel/);
  assert.doesNotMatch(withoutRef, /Character consistency/);

  const shotWithRef = readyShot({ characters: ["char-gu-chenzhou"] });
  const withRef = storyboardPrompt(project, shotWithRef);
  assert.match(withRef, /Character consistency/);
});

test("shotCharacters/hasGeneratedRef resolve only characters actually on the shot", () => {
  const project = sampleProject();
  const shot = readyShot({ characters: ["char-gu-chenzhou"] });
  const chars = shotCharacters(project, shot);
  assert.equal(chars.length, 1);
  assert.equal(chars[0].id, "char-gu-chenzhou");
  assert.equal(hasGeneratedRef(chars[0]), true);
  assert.equal(hasGeneratedRef(project.characters[0]), false);
});

test("storyboardPromptPreview: mode is image-edit only when an on-screen character has a generated reference card", () => {
  const project = sampleProject();
  const noRefShot = readyShot({ id: "shot-no-ref", characters: ["char-lin-wan"] });
  project.shots.push(noRefShot);
  const preview = storyboardPromptPreview(project, "shot-no-ref");
  assert.equal(preview.mode, "text-to-image");
  assert.equal(preview.references.length, 0);

  const refShot = readyShot({ id: "shot-with-ref", characters: ["char-gu-chenzhou"] });
  project.shots.push(refShot);
  const previewWithRef = storyboardPromptPreview(project, "shot-with-ref");
  assert.equal(previewWithRef.mode, "image-edit");
  assert.equal(previewWithRef.references.length, 1);
  assert.equal(previewWithRef.references[0].kind, "character");
  assert.equal(previewWithRef.references[0].name, "Gu Chenzhou");
});

test("storyboardPromptPreview throws for an unknown shot id", () => {
  assert.throws(() => storyboardPromptPreview(sampleProject(), "shot-missing"), /Unknown shot/);
});

test("findActiveAssetId matches a candidate by its resolved URL", () => {
  const candidates = [
    { assetId: "a1", path: "https://busabase.example/a1" },
    { assetId: "a2", path: "https://busabase.example/a2" },
  ];
  assert.equal(findActiveAssetId(candidates, "https://busabase.example/a2"), "a2");
  assert.equal(findActiveAssetId(candidates, "https://busabase.example/missing"), "");
  assert.equal(findActiveAssetId([], "x"), "");
});

test("voiceInstruct/voiceScript build a VoiceDesign instruct + line from voice_profile", () => {
  const character = {
    name: "Gu Chenzhou",
    role: "male lead",
    voice_profile: { type: "low baritone", pace: "slow", sample_script: "The name is Lin Wan." },
    character_card: { voice: "clipped sentences" },
  };
  assert.match(voiceInstruct(character), /Gu Chenzhou/);
  assert.match(voiceInstruct(character), /low baritone/);
  assert.equal(voiceScript(character), "The name is Lin Wan.");

  const noSample = { name: "Su Man", character_card: { voice: "sweet in public" } };
  assert.equal(voiceScript(noSample), "sweet in public");
  const bare = { name: "Zhao Ming" };
  assert.equal(voiceScript(bare), "我是Zhao Ming。");
});

test("framesForDuration rounds to (8k+1) and clamps to max_frames", () => {
  // 8s at 24fps wants round(24)*8+1 = 193 frames, clamped to the 121 draft cap.
  assert.equal(framesForDuration(8, { fps: 24, max_frames: 121 }), 121);
  // 4s at 24fps wants round(12)*8+1 = 97 frames, under the cap.
  assert.equal(framesForDuration(4, { fps: 24, max_frames: 121 }), 97);
  // Tiny durations still floor at 25 frames.
  assert.equal(framesForDuration(1, { fps: 8, max_frames: 121 }), 25);
});

test("listToArray splits on newlines/commas (incl. Chinese punctuation) and trims blanks", () => {
  assert.deepEqual(listToArray("a, b\nc，d、 e"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(listToArray(""), []);
  assert.deepEqual(listToArray(undefined), []);
});

test("slug lowercases, keeps CJK, strips punctuation, and falls back to 'item'", () => {
  assert.equal(slug("New Character!"), "new-character");
  assert.equal(slug("苏曼"), "苏曼");
  assert.equal(slug(""), "item");
});
