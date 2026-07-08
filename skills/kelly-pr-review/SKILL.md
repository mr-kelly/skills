---
name: kelly-pr-review
license: MIT
description: GitHub pull request review desk using gh CLI, local App-in-Skill UI, AI review notes, human approval, and approved gh pr review execution. Use when the user invokes /kelly-pr-review, asks to review GitHub PRs, generate a PR review batch, approve/comment/request changes through a local UI, or execute approved GitHub reviews.
---

# Kelly PR Review

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

## Overview

Use this skill as a GitHub pull request review desk backed by the `gh` CLI. The skill gathers PRs, prepares review notes and proposed review actions, writes a local batch, launches the App-in-Skill UI for human approval, then later executes only approved decisions with `gh pr review`.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, generate or update the local batch, ensure the UI is running, and send the user to the actual local URL, preferring `http://127.0.0.1:3001/` and the `3000-4000` port range unless `KELLY_PR_REVIEW_UI_PORT` is set. Use chat-only review only when the user says "纯聊天", "chat only", "不要打开 UI", or similar.

The app is file-only. It never calls GitHub, submits reviews, merges, closes, comments, or mutates repositories. It reads `app/.cache/current_batch.json` and writes `app/.cache/decisions.json`. The skill scripts perform all GitHub reads and approved executions.

## Private Configuration

Private config is optional. By default this skill uses the current `gh` authenticated account and searches open PRs requesting `@me` across accessible repositories. Use private config only for repo filters, reviewers, default review policy, and risk rules. Do not hardcode personal repositories or tokens into committed files.

Config priority:

1. `KELLY_PR_REVIEW_CONFIG=/absolute/path/to/config.json`
2. `skills/kelly-pr-review/config.local.json`
3. `~/.config/kelly-pr-review/config.json`
4. `skills/kelly-pr-review/config.example.json`

Env priority:

1. Existing system environment variables
2. `KELLY_PR_REVIEW_ENV_FILE=/absolute/path/to/.env`
3. repository root `.env`
4. `skills/kelly-pr-review/.env.local`
5. `~/.config/kelly-pr-review/.env`

Secrets should live in env files only. Usually `gh auth login` is enough, so this skill does not require a token in config.

Treat `config.example.json` as a template for optional preferences. If no private config exists, do not block real data; use `gh` defaults. Use `--sample` only when the user explicitly wants to preview the UI with fake data. This skill has no npm dependencies; keep runtime config in JSON and do not add YAML parsing packages.

## Workflow

1. Check `gh auth status`. If not authenticated, stop and ask the user to authenticate with `gh auth login`.
2. Load optional config through `lib/data-reader/`.
3. Generate a bounded PR batch using `gh search prs --review-requested=@me --state=open`; add repository filters only when configured.
4. For each PR, gather metadata and changed files with `gh pr view` and `gh pr diff --name-only`. Skip patch excerpts by default for speed; fetch compact patches only when `include_patch_excerpt` is enabled or a specific PR needs deeper review.
5. Classify status:
   - `needs_review`: user or agent needs to inspect before deciding.
   - `to_approve`: agent proposes a concrete review action.
   - `approved`: user approved an action in the UI.
   - `done`: review action already executed or intentionally no-op.
   - `blocked`: missing access, too risky, failing preconditions, or too large to review safely.
6. In App UI mode, write `app/.cache/current_batch.json`, start or reuse the UI, then ask the user to review there.
7. Execute later only when the user asks to execute approved decisions. Default execution script mode is dry-run; live execution requires explicit live mode.

## Review Actions

Supported approved actions:

- `approve`: `gh pr review <number> --approve -b <body>`
- `comment`: `gh pr review <number> --comment -b <body>`
- `request_changes`: `gh pr review <number> --request-changes -b <body>`
- `no_action`: write execution report only; no GitHub call.
- `needs_review` or `block`: do not execute.

Never merge, close, push, edit branches, rerun workflows, or dismiss reviews from this skill.

## Safety Rules

- Require explicit UI or chat approval before any `gh pr review` call.
- Re-read `decisions.json` and validate it immediately before execution.
- Create `app/.cache/agent.lock` during generation and execution.
- Write execution results to `app/.cache/execution_report.json`.
- Keep review bodies user-editable and quote only necessary source excerpts.
- Mark security, auth, billing, schema migration, destructive data, generated-code-heavy, and large-diff PRs as risky.
- If the review confidence is low, propose `comment` or `needs_review`, not approval.

## Useful Commands

```bash
node skills/kelly-pr-review/scripts/generate_review_batch.ts
skills/kelly-pr-review/app/start.sh
node skills/kelly-pr-review/scripts/validate_ui_schema.ts
node skills/kelly-pr-review/scripts/execute_decisions.ts --dry-run
node skills/kelly-pr-review/scripts/execute_decisions.ts --live
```

In normal use, invoke `/kelly-pr-review` and let the skill generate the batch and start the UI.
