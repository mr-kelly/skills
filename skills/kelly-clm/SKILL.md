---
name: kelly-clm
description: Lightweight contract lifecycle management App-in-Skill for contract inventory, lifecycle status, owners, obligations, renewal notices, and simple approval reminders. Use when the user invokes $kelly-clm or /kelly-clm, mentions CLM, contract lifecycle management, 合同管理, 合同台账, contract repository, obligation tracking, renewal reminders, notice deadlines, contract owners, signature readiness, or wants a simple local UI to review contract status without doing detailed legal redlines.
---

# Kelly CLM

## Overview

Use this skill as a lightweight contract lifecycle desk. It tracks contract records, lifecycle stage, owner, renewal/notice dates, obligations, and approval reminders in a local browser UI.

This skill is intentionally simpler than `kelly-legal-contracts`: use `kelly-clm` for contract operations and reminders; use `kelly-legal-contracts` when the user needs detailed legal clause review, fallback language, redline positions, or legal issue lists.

## Product Pattern

Read `references/clm-notes.md` before changing scope. The app borrows only common CLM patterns: central repository, lifecycle status, owner assignment, obligation tracking, renewal reminders, simple workflow approvals, and handoff records.

## Local App

Start the app with:

```bash
skills/kelly-clm/app/start.sh
```

The app runs on `127.0.0.1`, defaults to port `3000` through `4000`, and accepts `KELLY_CLM_UI_PORT`.

Views:

- `#/overview`: lifecycle pipeline, key metrics, upcoming renewals, at-risk obligations.
- `#/contracts`: searchable contract inventory.
- `#/contracts/<id>`: contract detail with dates, owners, obligations, and reminders.
- `#/obligations`: obligation tracker by owner, due date, and status.
- `#/renewals`: renewal and notice-deadline board.
- `#/approvals`: simple approval/reminder queue; decisions write local handoff records only.
- `#/settings`: boundary and demo/config summary.

Demo routes:

```text
/?demo=overview&lang=en#/overview
/?demo=contracts&lang=en#/contracts
/?demo=obligations&lang=en#/obligations
/?demo=renewals&lang=en#/renewals
/?demo=approvals&lang=en#/approvals
```

Use `lang=zh` for Chinese UI screenshots.

## Boundary

- This skill is an operations tracker, not legal advice.
- The app never sends emails, starts e-signature, updates a remote CLM, accepts terms, signs contracts, or contacts counterparties.
- Approval buttons write local decision records only; any external action must happen through the user or a separate explicitly approved connector.
- Keep contract text, counterparties, prices, and notes out of committed files. Use demo data for screenshots.

## Workflow

1. Collect or import contract summary fields: counterparty, contract type, owner, stage, value, start/end date, renewal date, notice deadline, and key obligations.
2. Populate the local app snapshot or use demo mode when no private data is available.
3. Send the user to the app for review of upcoming renewals, at-risk obligations, and pending approvals.
4. Treat approved items as handoffs only. Do not perform external side effects from the app.

## Screenshot Scenes

Screenshots live in `assets/screenshots/`:

- `overview.png`: lifecycle dashboard.
- `contracts.png`: contract inventory.
- `obligations.png`: obligation tracker.
- `renewals.png`: renewal board.
