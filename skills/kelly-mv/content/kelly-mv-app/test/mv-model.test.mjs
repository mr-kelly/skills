import assert from "node:assert/strict";
import test from "node:test";
import {
  attention,
  completeness,
  countBy,
  hasGeneratedRef,
  listToArray,
  nextStep,
  shotCharacters,
  storyboardPrompt,
  storyboardPromptPreview,
} from "../app/js/mv-model.js";

// Worked example mirroring the shipped starter project (静夜思): a song
// uploaded, a concept set, one character without a reference card, and 6
// shots — 2 missing a description, 3 missing an image, all missing video.
function sampleProject() {
  return {
    project_id: "kelly-mv-jingyesi",
    song: { title: "静夜思", audio_asset: "https://busabase.example/asset/song" },
    treatment: { summary: "一位游子客居异乡", look: "写实电影感古风", aspect_ratio: "16:9" },
    characters: [
      { id: "char-poet", name: "游子", role: "主角", status: "approved", reference_card: {} },
      { id: "char-extra", name: "配角", role: "配角", status: "draft", reference_card: { image_asset: "x" } },
    ],
    shots: [
      { id: "shot-001", title: "夜空明月", description: "", duration_seconds: 8, characters: [] },
      { id: "shot-002", title: "床前明月光", description: "月光洒落", duration_seconds: 8, characters: ["char-poet"] },
      { id: "shot-003", title: "疑是地上霜", description: "", duration_seconds: 10, characters: ["char-poet"] },
      {
        id: "shot-004",
        title: "举头望明月",
        description: "抬头望月",
        duration_seconds: 8,
        characters: ["char-poet"],
        image_asset: "https://busabase.example/asset/img4",
      },
    ],
  };
}

test("completeness: worked example counts missing refs/desc/image/video and sums duration", () => {
  const c = completeness(sampleProject());
  assert.equal(c.song_ready, true);
  assert.equal(c.concept_ready, true);
  assert.equal(c.characters_missing_refs, 1); // char-poet has no reference_card.image_asset
  assert.equal(c.shots_missing_desc, 2); // shot-001, shot-003
  assert.equal(c.shots_missing_image, 3); // all but shot-004
  assert.equal(c.shots_missing_video, 4); // none have video_asset
  assert.equal(c.shots_total_seconds, 34); // 8+8+10+8
});

test("completeness: song without audio_asset and empty treatment are not ready", () => {
  const c = completeness({ song: {}, treatment: {}, shots: [] });
  assert.equal(c.song_ready, false);
  assert.equal(c.concept_ready, false);
  assert.equal(c.shots_total_seconds, 0);
});

test("nextStep walks the dependency order: song -> concept -> cast -> refs -> shots -> images -> videos -> review", () => {
  assert.equal(nextStep({ song: {}, treatment: {}, characters: [], shots: [] }), "upload_song");
  assert.equal(nextStep({ song: { audio_asset: "a" }, treatment: {}, characters: [], shots: [] }), "set_concept");
  assert.equal(
    nextStep({ song: { audio_asset: "a" }, treatment: { summary: "s" }, characters: [], shots: [] }),
    "add_cast",
  );
  assert.equal(
    nextStep({
      song: { audio_asset: "a" },
      treatment: { summary: "s" },
      characters: [{ id: "c1", reference_card: {} }],
      shots: [],
    }),
    "generate_cast_refs",
  );
  assert.equal(
    nextStep({
      song: { audio_asset: "a" },
      treatment: { summary: "s" },
      characters: [{ id: "c1", reference_card: { image_asset: "x" } }],
      shots: [],
    }),
    "add_shots",
  );
  // sampleProject()'s char-poet has no reference card yet, so the next step
  // is still generating cast refs, not filling shot images.
  assert.equal(nextStep(sampleProject()), "generate_cast_refs");

  const castReady = {
    ...sampleProject(),
    characters: sampleProject().characters.map((c) => ({ ...c, reference_card: { image_asset: "x" } })),
  };
  assert.equal(nextStep(castReady), "fill_shot_images");
  const allImaged = {
    ...castReady,
    shots: castReady.shots.map((s) => ({ ...s, description: "d", image_asset: "img" })),
  };
  assert.equal(nextStep(allImaged), "fill_shot_videos");
  const allDone = {
    ...castReady,
    shots: castReady.shots.map((s) => ({ ...s, description: "d", image_asset: "img", video_asset: "vid" })),
  };
  assert.equal(nextStep(allDone), "review");
});

test("attention/countBy tally status across characters and shots", () => {
  const project = {
    characters: [
      { id: "c1", status: "needs_review" },
      { id: "c2", status: "approved" },
    ],
    shots: [
      { id: "s1", status: "needs_review" },
      { id: "s2", status: "approved" },
      { id: "s3", status: "blocked" },
    ],
  };
  const a = attention(project);
  assert.equal(a.needs_review, 2);
  assert.equal(a.approved, 2);
  assert.equal(a.blocked, 1);
  assert.deepEqual(countBy(project.shots), { needs_review: 1, approved: 1, blocked: 1 });
});

test("storyboardPrompt: worked example includes concept, look, scene, and character-consistency note only when a reference card exists", () => {
  const project = sampleProject();
  const shot = project.shots.find((s) => s.id === "shot-002");
  const withoutRef = storyboardPrompt(project, shot);
  assert.match(withoutRef, /MV concept: 一位游子客居异乡/);
  assert.match(withoutRef, /Visual style: 写实电影感古风/);
  assert.match(withoutRef, /Scene: 月光洒落/);
  assert.doesNotMatch(withoutRef, /Character consistency/);

  const withRef = storyboardPrompt(
    { ...project, characters: [{ ...project.characters[0], reference_card: { image_asset: "x" } }] },
    shot,
  );
  assert.match(withRef, /Character consistency/);
});

test("shotCharacters/hasGeneratedRef resolve only characters actually on the shot", () => {
  const project = sampleProject();
  const shot = project.shots.find((s) => s.id === "shot-002");
  const chars = shotCharacters(project, shot);
  assert.equal(chars.length, 1);
  assert.equal(chars[0].id, "char-poet");
  assert.equal(hasGeneratedRef(chars[0]), false);
  assert.equal(hasGeneratedRef(project.characters[1]), true);
});

test("storyboardPromptPreview: mode is image-edit only when an on-screen character has a generated reference card", () => {
  const project = sampleProject();
  const preview = storyboardPromptPreview(project, "shot-002");
  assert.equal(preview.mode, "text-to-image");
  assert.equal(preview.references.length, 0);

  const withRef = {
    ...project,
    characters: [{ ...project.characters[0], reference_card: { image_asset: "x" } }, project.characters[1]],
  };
  const previewWithRef = storyboardPromptPreview(withRef, "shot-002");
  assert.equal(previewWithRef.mode, "image-edit");
  assert.equal(previewWithRef.references.length, 1);
  assert.equal(previewWithRef.references[0].kind, "character");
  assert.equal(previewWithRef.references[0].name, "游子");
});

test("storyboardPromptPreview throws for an unknown shot id", () => {
  assert.throws(() => storyboardPromptPreview(sampleProject(), "shot-missing"), /Unknown shot/);
});

test("listToArray splits on newlines/commas (incl. Chinese punctuation) and trims blanks", () => {
  assert.deepEqual(listToArray("a, b\nc，d、 e"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(listToArray(""), []);
  assert.deepEqual(listToArray(undefined), []);
});
