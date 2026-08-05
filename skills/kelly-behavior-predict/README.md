# Predictive Recommendation Analytics Desk

Predictive Recommendation Analytics Desk is a Busabase-backed App-in-Skill
dashboard over a fixed, deterministic **mock** user-behavior dataset for a
generic, brand-free consumer booking product. It shows funnel drop-off,
per-segment predicted next actions, and a prediction-accuracy backtest — all
computed by a fixed, hand-recomputable rule, never a real ML/LLM model.

## What It Shows

- Overview: overall funnel drop-off across browse → search → compare →
  booking attempt → complete, total sessions, overall backtest accuracy, and
  how many segments still need a trust decision.
- Segments: five mock session archetypes (price-sensitive browser, repeat
  traveler, last-minute booker, deal hunter, high-intent planner) with their
  own funnel, dominant predicted action, and backtest accuracy/F1.
- Segment detail: funnel, predicted-action distribution, sample sessions
  (predicted vs. mock actual outcome), the exact rule triggers that drove the
  prediction, and a review panel to mark the segment's rule "trusted" or
  "needs recalibration" with a note.
- Backtest: precision/recall/F1 confusion-matrix-style summary comparing
  predicted vs. mock actual next action, overall and per segment.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Analytics Desk overview"></td>
    <td width="50%"><img src="assets/screenshots/funnel.webp" alt="Analytics Desk segments"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Overall funnel drop-off, total sessions, overall backtest accuracy, and how many segments still need a trust decision.</td>
    <td><strong>Segments</strong><br>Per-segment cards: session count, dominant predicted action, backtest accuracy/F1, and the current trusted / needs-recalibration badge.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/segment-detail.webp" alt="Analytics Desk segment detail"></td>
    <td width="50%"></td>
  </tr>
  <tr>
    <td><strong>Segment detail</strong><br>Segment funnel, predicted-action distribution, sample sessions (predicted vs. mock actual), matched/unmatched rule triggers, and the trusted / needs-recalibration review panel.</td>
    <td></td>
  </tr>
</table>

## Demo Mode

Open a safe, fully offline demo scene (never reads or writes Busabase):

```text
/?demo=1&lang=en#/overview
/?demo=segments&lang=en#/segments
/?demo=detail&lang=en#/segments/price_sensitive_browser
/?demo=backtest&lang=en#/backtest
```

Add `lang=zh` for the Chinese UI chrome, e.g.
`/?demo=1&lang=zh#/overview`. Demo mode regenerates the same fixed,
deterministic 100-session mock sample in the browser — there is no live
source to switch away from.

## The Rule (not a model)

Every "predicted next action" comes from a short, explicit, ordered list of
if/else rules over four mock session signals in
`app/app/js/behavior-model.js` — not a real ML/LLM model. Given the same
session features it always returns the same prediction, which is what makes
the backtest's precision/recall/F1 summary reproducible. See
`references/ui-schema.md` for the full schema and `SKILL.md` for the review
workflow.

## Busabase Resources

Three Bases under one application Folder (`kelly-behavior-predict`):
`sessions` (the fixed 100-row mock sample), `segments` (one row per
archetype, holding the human trust decision), and `settings` (one row with
the sanitized product profile and dataset seed). Regenerate the sample any
time with:

```bash
node skills/kelly-behavior-predict/scripts/generate_batch.mjs --apply
```

No credentials or live connection are needed beyond the Busabase Space
itself — this skill only ever reads/writes its own three Bases.
