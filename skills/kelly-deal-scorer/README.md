# Deal Scoring Desk (kelly-deal-scorer)

Deal Scoring Desk is a local, file-backed App-in-Skill review queue for
underwriting candidate SME financing deals (private-credit / revenue-based
financing style). It is a generic, brand-free tool — it does not reference any
specific real lender or company. For each candidate it computes a
deterministic, fully auditable composite score (0-100) from a rule-based
weighted rubric — **plain arithmetic in `lib/scoring.ts`, never an LLM or API
call** — so every number can be recomputed by hand.

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
  reject — written to local handoff files (`app/.data/decisions.json`,
  `app/.data/current_batch.json`).

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
    <td width="50%"><img src="assets/screenshots/overview-zh-CN.webp" alt="Deal Scoring Desk overview (Chinese)"></td>
  </tr>
  <tr>
    <td><strong>Score breakdown</strong><br>Per-factor raw score, weight, and contribution with an arithmetic trace for every sub-factor, plus the suggested revenue-share rate range.</td>
    <td><strong>Overview (中文)</strong><br>Full Chinese UI chrome via <code>lang=zh</code>.</td>
  </tr>
</table>

Additional Chinese-locale screenshots: `candidate-detail-zh-CN.png`,
`score-breakdown-zh-CN.png`.

## Demo Mode

Run the app and open a safe, fully offline mock queue:

```bash
skills/kelly-deal-scorer/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=1&lang=en#/candidates/cand-001
/?demo=1&lang=zh#/candidates/cand-004
```

Demo mode never reads or writes the real local batch/decision files.

## Seeding A Real (Mock) Queue

```bash
node scripts/generate_batch.ts     # seed 8 mock candidates, scored
node scripts/validate_ui_schema.ts # validate app/.data/current_batch.json
node scripts/execute_decisions.ts  # apply approved/rejected decisions
```

## Private Config

Copy `config.example.json` to `config.local.json` or
`~/.config/kelly-deal-scorer/config.json` to tune the rubric weights,
category risk tiers, and decision thresholds to your fund's underwriting
policy. Never commit real candidate financials, exports, or files under
`app/.data/`.
