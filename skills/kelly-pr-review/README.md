# Kelly PR Review

GitHub pull request review desk for `/kelly-pr-review`.

It uses the GitHub CLI for real GitHub access, but the browser UI is file-only:

- `scripts/generate_review_batch.mjs` reads PRs with `gh` and writes `app/.cache/current_batch.json`.
- The UI lets you approve, comment, request changes, block, or leave notes.
- The UI writes `app/.cache/decisions.json`.
- `scripts/execute_decisions.mjs` reads approved decisions and submits reviews with `gh pr review`.

Live execution is intentionally separate from UI clicks. The default `npm run execute` is dry-run; use `npm run execute:live` only after reviewing the report.

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
