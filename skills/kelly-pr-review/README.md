# Kelly PR Review

Kelly PR Review is a Busabase-backed App-in-Skill desk for **GitHub pull
request review**: the `gh` CLI gathers PRs and diffs, the agent scores risk
and proposes a review action, a human approves/comments/requests
changes/blocks in the AirApp, and a trusted script submits only approved
decisions with the real `gh pr review` command.

Both `gh` directions are trusted-process-only — the AirApp browser can't
shell out to a local CLI:

- `scripts/generate_review_batch.mjs` reads PRs with `gh` and writes the
  review queue into Busabase.
- The AirApp lets you approve, comment, request changes, block, or leave
  review notes — writes go straight to Busabase, never to GitHub.
- `scripts/execute_decisions.mjs` reads approved decisions and submits real
  reviews with `gh pr review`.

Live execution is intentionally separate from AirApp clicks. Both scripts
default to a dry run; pass `--apply` after reviewing the dry-run output.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly PR Review overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly PR Review needs review"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pull request review desk with repository filters, status counts, and reviewer configuration.</td>
    <td><strong>Needs review</strong><br>Pull request review with findings, risk signals, and suggested actions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/ready.webp" alt="Kelly PR Review ready to approve"></td>
    <td width="50%"><img src="assets/screenshots/blocked-security.webp" alt="Kelly PR Review blocked review"></td>
  </tr>
  <tr>
    <td><strong>Ready to approve</strong><br>Approval-focused review where checks pass and the final recommendation is ready to send.</td>
    <td><strong>Blocked review</strong><br>Security-sensitive PR scenario with unresolved risk and blocking rationale.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/needs-test.webp" alt="Kelly PR Review merged PR needs test"></td>
    <td width="50%"><img src="assets/screenshots/tested.webp" alt="Kelly PR Review tested verification"></td>
  </tr>
  <tr>
    <td><strong>Needs test</strong><br>Merged pull request waiting for human verification.</td>
    <td><strong>Tested</strong><br>Post-merge verification record showing the test note.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-pr-review-app install
pnpm --dir content/kelly-pr-review-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

```text
/?demo=1#/needs_review
/?demo=ready#/to_approve
/?demo=needs_test#/needs_test
/?demo=tested#/tested
/?demo=blocked#/blocked
```

Demo mode never reads or writes Busabase.

## Generating And Executing A Batch

```bash
gh auth login
node scripts/generate_review_batch.mjs --apply
node scripts/execute_decisions.mjs
node scripts/execute_decisions.mjs --apply
```

Both scripts connect with their own credentials
(`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`), never the
AirApp's ambient session.

## Data

All state — the PR review queue and the reviewer/repo profile — lives in
two Busabase Bases under one application Folder. See `SKILL.md` and
`references/ui-schema.md` for the resource map.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
