# Short-Drama Workflow Notes

## What "Good" Looks Like

A strong short-drama workspace separates canon from generation. Canon lives in the story bible, character cards, relationships, episode beats, and storyboard notes. Generated text or images are candidates until accepted back into canon.

## Information Architecture

Use five connected layers:

1. Series bible: title, premise, genre, audience, platform, episode length, tone, commercial hook, world rules, taboo constraints.
2. Characters and actors: stable ids, role function, biography, motivation, secret, arc, visual anchors, three-view notes, voice, wardrobe, props, forbidden drift.
3. Relationships: source character, target character, relationship type, power dynamic, emotional temperature, public status, hidden truth, active conflict, evidence episodes.
4. Episodes: episode number, title, promise, A/B plot, beat list, reveals, reversals, cliffhanger, continuity updates.
5. Storyboard shots: shot id, episode/beat link, composition, camera, setting, lighting, character ids, prompt, negative prompt, image status, notes.

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

## AI Collaboration Pattern

When a user asks the agent to continue:

- Read the current project JSON.
- Identify missing or weak fields before generating.
- Ask for approval only when changing canon or creating irreversible exports.
- Draft changes in the same schema as the app.
- Run validation after edits.
- If comments contain `@ai`, treat them as revision tasks and return updates to the relevant object.
