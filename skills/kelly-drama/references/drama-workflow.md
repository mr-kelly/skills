# Short-Drama Workflow Notes

## What "Good" Looks Like

A strong short-drama workspace separates planning canon from final motion production. Canon lives in the story bible, character cards, relationships, episode beats, storyboard notes, and review state. Final animation, captions, audio timing, render, and publish live in the paired HyperFrame project. Generated text, images, videos, or HyperFrame renders are candidates until accepted back into canon.

## Information Architecture

Use six connected layers:

1. Series bible: title, premise, genre, audience, platform, episode length, tone, commercial hook, world rules, taboo constraints.
2. Characters and actors: stable ids, role function, biography, motivation, secret, arc, visual anchors, three-view notes, voice, wardrobe, props, forbidden drift.
3. Relationships: source character, target character, relationship type, power dynamic, emotional temperature, public status, hidden truth, active conflict, evidence episodes.
4. Episodes: episode number, title, promise, A/B plot, beat list, reveals, reversals, cliffhanger, continuity updates.
5. Storyboard shots: shot id, episode/beat link, composition, camera, setting, lighting, character ids, prompt, negative prompt, image status, notes.
6. HyperFrame links: project-level `hyperframe_project_path`; episode-level `hyperframe_composition` and `hyperframe_video_asset`; shot-level source scene/time/frame references when importing from an existing composition.

## HyperFrame Production Model

Default mapping:

- One Kelly Drama project maps to one explicit HyperFrame project path.
- One episode maps to one HyperFrame composition within that project.
- Kelly Drama manages planning and review; HyperFrame is the final video workbench.

Do not infer or relocate a HyperFrame project when the user gives a path. Store the absolute path in `series.hyperframe_project_path` and treat it as the source of truth for final-cut work.

For an existing HyperFrame project:

1. Read `index.html` or the requested composition, plus `design.md` and changelog notes if present.
2. Extract the scene list, timing, on-screen copy, narration/audio tracks, visual system, and key UI objects.
3. Mirror each scene as a Kelly Drama beat/shot, preserving source scene id and source time ranges.
4. Copy or extract rendered reference frames and the rendered video into `app/.data/generated/hyperframes/<project-episode>/`.
5. Set `episode.hyperframe_composition` and `episode.hyperframe_video_asset`.

For a new episode planned in Kelly Drama first:

1. Plan beats and shots in Kelly Drama.
2. Decide the composition path before final production, such as `compositions/ep-002-blog-cms.html`.
3. Build/refine the composition in HyperFrame.
4. Re-import rendered frames/video to Kelly Drama when the composition becomes the reviewable or final version.

## Character Library Best Practices

- Give every character a stable `character_id` and short display name.
- Keep actor notes separate from character facts: age range, performance type, casting constraints, voice, body language.
- Use three-view references for image consistency:
  - Front: face, hairline, eyes, distinguishing marks, default expression.
  - Side: profile, nose/chin, posture, hairstyle silhouette.
  - Back: hair length, shoulders, signature clothing, silhouette.
- Add "continuity anchors" that should appear often: necklace, scar, suit color, phone case, ring, etc.
- Add "forbidden drift" for common mistakes: age change, hair color change, missing scar, wrong wardrobe, softened villain energy.
- Update the card whenever a plot reveal changes identity, wealth, family ties, trauma, legal status, or public reputation.
- Give each character a voice as well as a face: a `voice_profile` (timbre/type, pace, accent, signature delivery, casting reference, sample audition line) plus a `voice_reference` asset slot for a generated reference voice (reserved placeholder until a TTS provider is wired). Keep shot `audio.dialogue[].tone` and `srt` speakers consistent with the character's voice profile, the same way image prompts stay consistent with the reference card.

## Relationship Map Best Practices

- Track direction. "Controls", "owes", "protects", and "blackmails" are directional.
- Separate public relationship from hidden relationship. Example: public employer/assistant, hidden ex-spouses.
- Record the current emotional temperature: cold, tense, unstable, warm, obsessive, indebted, betrayed.
- Attach evidence episodes so relationship changes can be audited.
- Use the map to catch missing scenes: if a key betrayal exists only in summary, add a beat where the audience sees its consequence.

## Episode Ladder Best Practices

Short-drama episodes usually need a click reason every 45-90 seconds. For each episode:

- Start with a visible problem, not exposition.
- Move status: humiliation, power reversal, secret clue, public slap, rescue, betrayal, proof, forced choice.
- End with an unresolved image or line that creates the next click.
- Avoid "setup-only" episodes. If an episode must set up, include a mini-payoff.
- Keep each beat tied to a character decision or reveal.

Recommended beat fields:

- `hook`: what catches attention immediately.
- `conflict`: what blocks the protagonist.
- `turn`: what changes the situation.
- `emotion`: humiliation, desire, fear, satisfaction, dread, tenderness, rage.
- `canon_update`: what becomes true after this beat.
- `cliffhanger`: what remains open.

## Storyboard and Image Prompt Best Practices

Create prompts from structured continuity:

1. Characters: include character ids and stable visual anchors.
2. Shot: shot size, camera angle, lens feel, movement, composition.
3. Scene: place, time, props, weather, lighting.
4. Performance: expression, gesture, power relationship.
5. Style: vertical short-drama frame, cinematic realism, platform taste.
6. Negative prompt: wrong age, changed hair, extra fingers, logo text, unrelated costumes, face drift.

Write prompts as production instructions, not literary prose. Keep one shot to one clear visual action.

## Shot Definition of Done (video-ready)

A shot that only describes a still frame is image-ready, not video-ready. Generating video from thin shot data wastes generations. Before generating a shot's image or video, complete the full production sheet and run `scripts/validate_shot_readiness.mjs`:

1. Timing: float `duration_seconds` to information density (4-6s reactions/close-ups, 8-12s establishing/ceremony/action); never exceed 12s. Set `emotion`.
2. Camera spec: structured `shot_size`, `camera_angle`, `camera_movement`, `lens` in addition to freeform `camera`/`composition`/`setting`/`lighting`.
3. Motion: write `action` — what moves over the seconds (subject action, blocking, eyelines, prop/environment motion).
4. Prompts: `prompt` (still keyframe, with character anchors + forbidden drift), `negative_prompt`, and a separate `video_prompt` (image-to-video motion: camera move + subject action + environment motion).
5. Sound design: `audio` with `dialogue` (speaker/line/tone), `narration`, `sfx`, `ambient`, `music`.
6. Timed dialogue: `srt` with cumulative episode timecodes matching durations, split into multiple short cues (~1.5-4s, ≤18 chars each) — not one block per shot; keep Chinese dialogue ≤ ~8 chars/second (ideal 5-7) so it can actually be delivered. Some shots should be intentionally silent (`silent: true`, empty `srt`): montage, atmosphere, and action beats often read better as pure visuals carried by sound design. Don't caption every shot.
7. Editorial & continuity: `transition_in`/`transition_out`; `continuity` with wardrobe, props, what carries from the previous shot, and forbidden-drift anchors.

## Character Consistency via Image-to-Image

Text descriptions alone do not lock a character's face or costume across shots. Generate character reference-card images first, then feed those images (plus the visual background reference) to the image API's `/images/edits` endpoint as real input images when generating each storyboard frame. A path mentioned only in the prompt text is invisible to the model. Shots whose characters lack reference cards fall back to text-to-image and will drift — create the cards before generating those shots.

## AI Collaboration Pattern

When a user asks the agent to continue:

- Read the current project JSON.
- Identify missing or weak fields before generating.
- Ask for approval only when changing canon or creating irreversible exports.
- Draft changes in the same schema as the app.
- Run validation after edits.
- If comments contain `@ai`, treat them as revision tasks and return updates to the relevant object.
