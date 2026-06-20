# MV Workflow

Turn an existing MP3 into a pure-visual music video. Four steps, kept deliberately simple.

## 1. 概括 (Concept)

One line on what the MV is and its tonality, one line on the visual `look`, and the aspect
ratio. That's the whole concept — it sets the mood and feeds every image prompt. Don't expand
it into a multi-field treatment.

## 2. Song

Upload an existing MP3. Duration is detected automatically. Optionally set title/artist. The MV
is built around this track; you don't generate or analyze it (creating songs is a future,
opt-in capability — see SKILL.md → Song Generation).

## 3. 角色 (Cast)

Add the people who appear on screen — same as kelly-drama. Fill three-view visual notes,
wardrobe, anchors, and forbidden drift, then **generate each character's reference card before
storyboarding**. Storyboard image generation feeds these cards as real input pixels, so without
them the likeness drifts shot to shot.

## 4. 分镜 (Storyboard)

An ordered list of shots — the sequence you'll cut to the song. For each shot:

- Write a **画面描述 (scene description)**: what we see and what moves. This is also the image
  prompt. Optionally add a negative prompt and an image-to-video motion hint.
- Pick the **on-screen characters** (drives image-to-image consistency) and a **duration**
  (4/5/6/8/10/12s for AI generation; uploaded clips can be any length).
- Give the shot an **image** and a **video**, each either:
  - **Generated** — image via image-to-image on the character cards; draft video via local LTX.
  - **Uploaded** — your own image/video file.
  Both append as candidates; pick which one is active.

Use 「查看提示词」 to see exactly what the image model will receive, including the character
reference cards fed in as pixels.

## Assembling the MV

The final MV is the shots' active videos (or images) played in order over the uploaded song —
picture only, no added audio besides the track.

## Pure-visual rule

Never add dialogue audio, narration, TTS, or burned-in subtitles/lyrics. The only audio is the
song. If a project needs spoken dialogue or voice, that is `kelly-drama`, not `kelly-mv`.
