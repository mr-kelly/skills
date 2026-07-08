# Kelly PR Review

GitHub pull request review desk for `/kelly-pr-review`.

It uses the GitHub CLI for real GitHub access, but the browser UI is file-only:

- `scripts/generate_review_batch.mjs` reads PRs with `gh` and writes `app/.cache/current_batch.json`.
- The UI lets you approve, comment, request changes, block, or leave notes.
- The UI writes `app/.cache/decisions.json`.
- `scripts/execute_decisions.mjs` reads approved decisions and submits reviews with `gh pr review`.

Live execution is intentionally separate from UI clicks. The default `npm run execute` is dry-run; use `npm run execute:live` only after reviewing the report.


## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly PR Review overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly PR Review needs review"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pull request review desk with repository filters, status counts, and reviewer configuration.</td>
    <td><strong>Needs review</strong><br>Mock pull request review with findings, confidence signals, test notes, and suggested actions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/ready.webp" alt="Kelly PR Review ready to approve"></td>
    <td width="50%"><img src="assets/screenshots/blocked-security.webp" alt="Kelly PR Review blocked review"></td>
  </tr>
  <tr>
    <td><strong>Ready to approve</strong><br>Approval-focused review where checks pass and the final recommendation is ready to send.</td>
    <td><strong>Blocked review</strong><br>Security-sensitive PR scenario with unresolved risk, blocking rationale, and reviewer handoff details.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/needs-test.webp" alt="Kelly PR Review merged PR needs test"></td>
    <td width="50%"><img src="assets/screenshots/tested.webp" alt="Kelly PR Review tested verification"></td>
  </tr>
  <tr>
    <td><strong>Needs test</strong><br>Merged pull request waiting for human verification with a required test note or screenshot evidence.</td>
    <td><strong>Tested</strong><br>Post-merge verification record showing the local test note that proves a human checked the change.</td>
  </tr>
</table>

## Setup

```bash
gh auth login
cp skills/kelly-pr-review/config.example.json skills/kelly-pr-review/config.local.json
```

Edit `config.local.json` with the repositories you want in the desk.

## Run

```bash
node skills/kelly-pr-review/scripts/generate_review_batch.mjs
skills/kelly-pr-review/app/start.sh
```

Open the printed local URL, usually `http://127.0.0.1:3001`.
