---
name: kelly-jobhunt
description: Run a Busabase-backed job-search outreach desk with a bundled Hono App-in-Skill deployable to AirApp. Use when the user invokes $kelly-jobhunt or /kelly-jobhunt, wants to find target companies and their contact addresses instead of applying through a job board, wants one tailored application email drafted per company, or wants to review and approve each send. One company receives exactly one email; SMTP credentials stay in trusted execution and never reach browser code.
metadata:
  category: comms
  tags:
    - risk:gated-write
    - surface:busabase
    - surface:smtp
---

# Kelly JobHunt

Replace board-and-pray applications with a short, inspectable loop: find the
companies worth writing to, find one address that will actually be read, write
one email per company, and let the human approve each send.

## Mandatory Dependencies

Before designing, creating, or changing the app:

1. Read and follow `$kelly-app-skill-creator` for product behavior, visual quality, responsive layout, and the complete local `app/` artifact.
2. Read and follow `$busabase` for connection, target Space, API, ChangeRequest, review, and merge behavior.
3. Read and follow `$busabase-app-creator` for resource modeling, AirApp runtime limits, security, validation, and deployment.
4. Read `references/jobhunt-schema.md` before changing any Base, field slug, or status value.

If a required skill is unavailable, continue safe local app work but stop before
the unavailable Busabase or deployment operation and report the missing
dependency. Never replace Busabase persistence with local JSON, browser storage,
SQLite, or a file-backed provider.

## Product Boundary

- **One company, one email.** A company row is the unit of outreach. Extra
  addresses stay in the pool as fallbacks for a bounce; they are never a reason
  to mail the same company twice. Sending three near-identical letters to
  `hr@`, `jobs@`, and a department head reads as harassment and gets the whole
  domain filtered.
- **The human approves every send.** The app records a verdict; it never sends
  on its own initiative and never batch-sends without an explicit click.
- **Only real, published addresses.** Take addresses from the company's own
  pages, its job postings, or public professional profiles, and record the
  source URL for each. Never guess a pattern, scrape a private database, or buy
  a list.
- **No secret ever reaches the browser.** SMTP host, user, and app password are
  read only by `scripts/send_emails.mjs` from its own environment. Browser code
  has no mail transport and no credential of any kind.
- **The resume is the operator's file.** It is placed by hand in `resume/`; the
  app stores only the file name. Nothing generates or edits the PDF.

## Operating Loop

### Research — find companies and addresses

Read the profile (target role, cities, industries, self-introduction), search
the web, and write findings to `scripts/import_leads.mjs`'s input format. For
each company record why it matches in concrete terms — a real posting, a real
product direction, a real team size — not a generic compliment. For each
address record its role and where it came from, and mark confidence:

- `high` — printed on the company's own careers or contact page;
- `medium` — from a job posting or an aggregator that names the company;
- `low` — an individual's public profile, or a general-purpose inbox.

The import is idempotent: it skips any company key that already exists and any
`company + address` pair already recorded, so re-running a widened search never
resets an approved or sent row.

### Plan — one drafted email per company

Draft `email-subject` and `email-body` at import time so the queue is reviewable
immediately. Tailor the opening paragraph to that specific company's evidence;
keep the rest of the letter consistent with the profile's self-introduction.
Plain text, no HTML, no images, no tracking pixel.

### Action — approve, then send

The operator reviews each row in the AirApp, edits the subject and body if
needed, picks an address from the pool, and clicks approve. That writes
`status: queued`, `sent-to`, and `approved-at`. The trusted
`scripts/send_emails.mjs` then sends over SMTP with the resume attached and
writes `status: sent` plus `sent-at`. A send that fails leaves the row `queued`
so another address can be tried.

### Retrospective — out of scope here

Reply detection, reply-rate attribution, and follow-up sequencing belong to a
Pro variant. Do not add a reply column, a funnel chart, or a scheduler to this
skill; keep the MVP a queue the operator can finish in one sitting.

## App Artifact

- Keep the complete canonical project under `<skill-root>/app/` and provide a
  working `pnpm --dir <skill-root>/app dev` command.
- Follow the UI and product contract from `$kelly-app-skill-creator`; delegate
  the runtime, SDK, security, validation, and deployment contract to
  `$busabase-app-creator` rather than defining another runtime here.
- Read and write every persistent value through `busabase-sdk`. The browser
  writes exactly two things: profile fields, and a company's approval verdict
  plus its edited draft.
- Writes auto-merge only on a standalone loopback preview. A deployed AirApp
  submits each write as a ChangeRequest for review.
- Keep deterministic Demo data explicit and non-persistent. Demo may mirror the
  same three-resource shape but must never become the backend, send mail, or
  claim a successful Busabase connection.

## Core Resources

Three application-owned Bases under one Folder. Field slugs and status values
are fixed by `references/jobhunt-schema.md`.

| Base | Purpose |
| --- | --- |
| `jobhunt-profile-v1` | One row. Target role, cities, industries, self-introduction, resume file name, sender address. |
| `jobhunt-companies-v1` | One row per company: match evidence, drafted email, outreach status, the address actually used. |
| `jobhunt-leads-v1` | Several rows per company: candidate addresses with role, source URL, and confidence. |

`company-key` is a plain text foreign key, not a Busabase relation field. Two
mutually referencing Bases cannot be created in one ChangeRequest, and the
browser's lazy-provisioning flow cannot perform that two-phase creation.

Vault holds the SMTP credentials. The app surfaces readiness only, never values.

## Screens

Two screens plus Help & Settings, routed by hash:

- `#/profile` — the profile form. Missing items are named, not implied.
- `#/all`, `#/to-send`, `#/sent` — one list of companies with a detail pane;
  `#/<view>/<id>` selects a row. Rows carry a stable `#n` reference so a
  conversation can say "change #3" unambiguously.
- `#/settings/<tab>` — guide, resources, connection.

The sidebar shows brand, then what the human must do now, then navigation, then
Help & Settings. When the profile is incomplete, the attention panel points at
the profile instead of a send count the operator cannot act on yet.

## Trusted Scripts

Both live at the skill root with their own `package.json`, carry their own
credentials, and are the only paths that touch the outside world.

```bash
node scripts/import_leads.mjs findings.json        # dry run
node scripts/import_leads.mjs findings.json --apply
node scripts/send_emails.mjs                       # dry run
node scripts/send_emails.mjs --apply
```

Both default to a dry run and print exactly what they would do. `--apply` is the
operator's approval; bulk imports are approved and merged explicitly because
`bases.createBulkChangeRequest` has no auto-merge.

Required environment: `BUSABASE_BASE_URL`, `BUSABASE_API_KEY`,
`BUSABASE_SPACE_ID`, and for sending `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`. The sender address comes from the profile, not the environment, so
the letter always comes from the job seeker's own mailbox.

## Stop Conditions

Stop and report rather than proceeding when: the profile is incomplete; a
company has no address; a send would go to a guessed address; SMTP credentials
are missing; or an import would overwrite a company already approved or sent.
