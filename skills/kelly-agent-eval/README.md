# Agent Eval & Regression Board

Agent Eval & Regression Board is a Busabase App-in-Skill review board for teams
shipping multiple LLM-agent workflows who need to catch quality regressions
before a release. It runs a fixed suite of ~18 mock test cases against a
**baseline** agent version and a **candidate** agent version, scores every
transcript on a four-part rubric (helpfulness, correctness, safety, tone), and
surfaces every case where the candidate scored meaningfully lower as a
**regression** for a human to triage.

The rubric scores are deterministic mock values presented as if produced by an
eval rubric — this is **not** a real LLM-judge call, and the app never
deploys, publishes, or modifies anything. It only reads and writes Busabase
records.

## What It Shows

- **Overview**: baseline vs candidate pass-rate comparison, case-count metrics
  (total, regressions, improvements, pending review), and a release
  `Approve release` / `Block release` panel with a required note.
- **Regressions**: every case where the candidate regressed, filterable by
  review status (needs review / blocking / acceptable).
- **All Cases**: the full 18-case suite, filterable by category.
- **Case detail**: a rubric bar comparison (helpfulness/correctness/safety/tone,
  baseline vs candidate) plus a side-by-side transcript diff, and the
  `Mark blocking` / `Mark acceptable` review-note action for regressions.
- **Help & Settings**: sanitized config summary — data provider, team name,
  baseline/candidate version labels, minimum pass-rate policy, onboarding
  state, and the accent-color picker.

Human actions — marking a regression blocking/acceptable with a note, and the
overall approve/block release decision — write directly onto the `cases` /
`settings` Busabase records (see `references/eval-schema.md`). A separate
trusted export script merges everything into a local `release_report.json`
handoff file and refuses to run while any regression is still undecided.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Agent Eval Board overview"></td>
    <td width="50%"><img src="assets/screenshots/regressions.webp" alt="Agent Eval Board regressions list"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Baseline vs candidate pass-rate comparison, case-count metrics, and the release approve/block panel.</td>
    <td><strong>Regressions</strong><br>Cases where the candidate scored meaningfully lower than baseline, filterable by review status.</td>
  </tr>
  <tr>
    <td colspan="2"><img src="assets/screenshots/case-detail.webp" alt="Agent Eval Board case detail"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Case detail</strong><br>Rubric bar comparison (helpfulness/correctness/safety/tone) plus a side-by-side transcript diff and the mark-blocking / mark-acceptable review note.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview-zh-CN.webp" alt="Agent Eval Board overview, Chinese UI"></td>
    <td width="50%"><img src="assets/screenshots/regressions-zh-CN.webp" alt="Agent Eval Board regressions, Chinese UI"></td>
  </tr>
  <tr>
    <td><strong>Overview (中文)</strong></td>
    <td><strong>Regressions (中文)</strong></td>
  </tr>
</table>

## Demo Mode

Start the local preview and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-agent-eval/app dev
```

Use the URL printed by the launcher, then add a demo path:

```text
/?demo=1&lang=en#/overview
/?demo=1&lang=en#/regressions
/?demo=1&lang=en#/cases/support-ticket-triage
/?demo=1&lang=zh#/overview
```

Demo mode never reads or writes Busabase — it generates the same
deterministic mock suite in memory (with case titles/categories localized for
`lang=zh`) purely for documentation and screenshots.

## Trusted Scripts

```bash
node skills/kelly-agent-eval/scripts/generate_eval_run.mjs --apply     # (re)seed the fixed mock suite into Busabase, clearing prior decisions
node skills/kelly-agent-eval/scripts/export_release_report.mjs --apply # merge cases + release verdict into a local release_report.json
```

Both scripts are dry runs by default (print what they would do) and connect
with their own Busabase credentials (`BUSABASE_BASE_URL`, `BUSABASE_API_KEY`,
`BUSABASE_SPACE_ID`), never the AirApp's ambient session. `generate_eval_run.mjs`
accepts `--team`, `--baseline`, `--candidate`, `--min-pass-rate`, and
`--allow-blocking-release` to set the team/version/policy settings row; any
flag left unset keeps the existing value, falling back to the documented
defaults on first run. See `references/eval-schema.md`.

## Private Config

Team name, baseline/candidate version labels, and release policy (minimum
candidate pass rate, whether a blocking regression blocks an "approve"
release) live on the `settings` Base's `config` row in Busabase — set them
via `scripts/generate_eval_run.mjs --team ... --baseline ... --candidate ...`.
There are no credentials for the AirApp itself — this skill never calls an
external system.

## Boundary

The AirApp reads and writes Busabase records only; it never deploys,
publishes, or modifies anything outside its own two Bases. Rubric scores are
deterministic mock values, never a real LLM-judge call.
