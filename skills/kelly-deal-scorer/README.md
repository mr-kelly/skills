# Deal Scoring Desk (kelly-deal-scorer)

Deal Scoring Desk is a Busabase App-in-Skill review queue for underwriting
candidate SME financing deals (private-credit / revenue-based financing
style). It is a generic, brand-free tool — it does not reference any specific
real lender or company. For each candidate it computes a deterministic, fully
auditable composite score (0-100) from a rule-based weighted rubric — **plain
arithmetic in `content/kelly-deal-scorer-app/app/js/scorer-model.js`, never an LLM or API call** — so
every number can be recomputed by hand.

## What It Shows

- Queue-level summary header: score distribution (high-confidence / needs
  review / low-confidence) and workflow counts (needs review, approved, done,
  blocked).
- Per-candidate composite score (0-100) with a full breakdown: each
  sub-factor's raw score, weight, contribution, and a human-readable
  arithmetic trace.
- Five scored sub-factors: revenue stability/volatility, growth trend,
  category risk tier, requested-principal-to-revenue ratio, and track
  record/scale.
- A monthly revenue history chart and any red flags on file (e.g. recent
  revenue decline).
- A suggested revenue-share rate range derived from the composite score.
- A human decision row — approve for term sheet / send back for more data /
  reject — written directly onto the candidate's Busabase record.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Deal Scoring Desk overview"></td>
    <td width="50%"><img src="assets/screenshots/candidate-detail.webp" alt="Deal Scoring Desk candidate detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Queue-level summary header — score distribution, counts needing review vs. high-confidence — plus the ranked candidate list.</td>
    <td><strong>Candidate detail</strong><br>Revenue history chart, red flags, requested principal, and the decision row.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/score-breakdown.webp" alt="Deal Scoring Desk score breakdown"></td>
    <td width="50%"></td>
  </tr>
  <tr>
    <td><strong>Score breakdown</strong><br>Per-factor raw score, weight, and contribution with an arithmetic trace for every sub-factor, plus the suggested revenue-share rate range.</td>
    <td></td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-deal-scorer/content/kelly-deal-scorer-app dev
```

Use the printed URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=1&lang=en#/candidates/cand-001
/?demo=1&lang=zh#/candidates/cand-004
```

Demo mode never reads or writes Busabase.

## Seeding And Executing A Real (Mock) Queue

```bash
node scripts/generate_batch.mjs --apply     # seed 8 mock candidates, scored, into Busabase
node scripts/execute_decisions.mjs --apply  # mark approved candidates "done" (no external side effect)
```

Both scripts default to a dry run — pass `--apply` to actually write.

## Busabase Resources

Two Bases (`candidates`, `settings`) under one application Folder,
provisioned lazily on first run. See `references/scoring-schema.md` for the
full field-slug schema and the rubric formulas.
