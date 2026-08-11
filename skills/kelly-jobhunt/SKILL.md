---
name: kelly-jobhunt
description: Run a Busabase-backed job-search outreach desk with a bundled Hono App-in-Skill deployable to AirApp. Use when the user invokes $kelly-jobhunt or /kelly-jobhunt, wants to turn a resume into a structured profile and a typeset PDF, wants to find target companies and their contact addresses instead of applying through a job board, wants one tailored application email drafted per company, or wants to review and approve each send. Three subcommands - profile, research, send - plus the desk itself. One company receives exactly one email; mailbox credentials live in the Busabase Vault and never reach browser code.
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

## Subcommands

The desk shows state and takes decisions. Everything it cannot do itself is one
of three subcommands, and **the desk always names the next one on screen** — the
operator never has to remember which is which.

| Invocation | What you do |
| --- | --- |
| `/kelly-jobhunt profile` | Take the user's resume or raw notes, extract a structured profile, ask which job channels to search, and build a typeset PDF resume |
| `/kelly-jobhunt research` | Find target companies and their contact addresses, draft one email each, import them |
| `/kelly-jobhunt send` | Put the user's own SMTP credentials in the Busabase Vault, then send what they approved |
| `/kelly-jobhunt` (no argument) | Open the desk and report where things stand |

Run them in that order the first time. Afterwards `research` is the one that
repeats.

## Mandatory Dependencies

Before designing, creating, or changing the app:

1. Read and follow `$kelly-app-skill-creator` for product behavior, visual quality, responsive layout, and the complete local `app/` artifact.
2. Read and follow `$busabase` for connection, target Space, API, ChangeRequest, review, merge, and Vault behavior.
3. Read and follow `$busabase-app-creator` for resource modeling, AirApp runtime limits, security, validation, and deployment.
4. Read `references/jobhunt-schema.md` before changing any Base, field slug, status value, or Vault key.
5. Read `references/research-playbook.md` before running `/kelly-jobhunt research` for the first time — it is the working method behind the boundaries stated here.

If a required skill is unavailable, continue safe local app work but stop before
the unavailable Busabase or deployment operation and report the missing
dependency. Never replace Busabase persistence with local JSON, browser storage,
SQLite, or a file-backed provider.

## Product Boundary

- **One company, one email.** A company row is the unit of outreach. Extra
  addresses stay in the pool as fallbacks for a bounce; they are never a reason
  to mail the same company twice. Sending three near-identical letters to `hr@`,
  `jobs@`, and a department head reads as harassment and gets the whole domain
  filtered.
- **The human approves every send.** The app records a verdict; it never sends
  on its own initiative and never batch-sends without an explicit click.
- **Every address carries its source.** Record the exact page each address came
  from. An address with no source is a guess, and a guess is not allowed —
  write `未找到邮箱` instead and let the desk disable the send button.
- **No secret ever reaches the browser.** SMTP host, user, and app password live
  in the Busabase Vault, written by `scripts/configure_smtp.mjs` and read only
  by `scripts/send_emails.mjs`. Browser code has no mail transport, never calls
  `vault.get`, and never displays a credential value — only whether one exists.
- **Never ask the user to paste a password into chat.** Take it through the
  script's `--pass` flag or the `SMTP_PASS` environment variable.

## `/kelly-jobhunt profile`

Goal: turn whatever the user has into a profile the other two commands can rely
on, plus a resume PDF worth attaching.

1. **Take their material as it comes.** A PDF, a Word file, a LinkedIn export, a
   few paragraphs pasted into chat — all fine. Read it; do not make them fill a
   form first.
2. **Extract, do not invent.** Fill `name`, `target-role`, `locations`,
   `industries`, `highlights`, and `resume-source`. `highlights` is the two or
   three sentences the emails will quote, so it must be concrete: "把跨部门审批
   链路从 3.4 天压到 9 小时" beats "负责用户增长". If the material is vague, ask
   for one specific number rather than writing something generic.
3. **Ask which channels to search**, and offer a sensible default rather than an
   open question. If the user writes in Simplified Chinese, they are most likely
   job-hunting in mainland China — propose BOSS 直聘 / 拉勾 / 猎聘 / 脉脉 plus
   company career pages, and ask them to confirm or edit. Traditional Chinese →
   104 / 1111 / CakeResume. English → LinkedIn / Indeed / Wellfound / company
   career pages. Always let them add their own. Store the answer in
   `job-boards`; `research` reads it.
4. **Write the profile**, then build the resume:
   ```bash
   node scripts/build_resume.mjs           # dry run: writes an HTML preview
   node scripts/build_resume.mjs --apply   # renders resume/<name>.pdf
   ```
   The dry run exists so the user can look at the layout before committing.
   Layout is HTML + CSS printed by headless Chrome; edit the template in
   `scripts/build_resume.mjs` if they want a different look. If Chrome is
   missing, the script says so and leaves the HTML for them to print manually —
   it does not fail silently.
5. Never put a claim in the PDF that was not in their material. Degrees, titles,
   dates, and numbers must survive a reference check.

## `/kelly-jobhunt research`

Goal: a queue of companies worth writing to, each with a real address and a
letter that could only have been written for it.

**Use whatever actually works to find them** — the channels in `job-boards`,
search engines, company career pages, public job aggregators, browser
automation. Depth beats politeness about method here. Three rules do hold:

- **record the source URL for every company and every address** — that is what
  makes the result checkable, and it is the only defence against a hallucinated
  address;
- **do not buy, sell, or import purchased contact lists;**
- **do not use someone's credentials, or bypass a paywall or anti-bot control,
  to reach data you are not entitled to.**

For each address record its role and where it came from, and grade confidence:

- `high` — printed on the company's own careers or contact page;
- `medium` — from a job posting or an aggregator that names the company;
- `low` — an individual's public profile, or a general-purpose inbox.

Draft `email-subject` and `email-body` at import time so the queue is reviewable
immediately. Tailor the opening paragraph to that company's specific evidence —
a real posting line, a real product direction — and keep the rest consistent
with `highlights`. Plain text, no HTML, no tracking pixel.

`references/research-playbook.md` has the full method: where addresses actually
come from and how to grade them, what separates a usable match reason from
filler, how to calibrate `matchScore` so the sort keeps meaning something, and
the six ways this step usually goes wrong.

Then import:

```bash
node scripts/import_leads.mjs findings.json           # dry run
node scripts/import_leads.mjs findings.json --apply
```

The import is idempotent: it skips any company key that already exists and any
`company + address` pair already recorded, so widening a search never resets an
approved or sent row. Re-run it freely.

Aim for twenty to thirty companies per round. A longer list does not get read
carefully, and a list that is not read carefully is just slower board-and-pray.

## `/kelly-jobhunt send`

Goal: the user's own mailbox sends the letters they approved.

1. Get the SMTP settings for **their** mailbox — the letters must come from
   their own address, not a shared one. For QQ/163/Gmail this means an app
   password or authorization code, not the account password. Point them at their
   mail provider's settings page; do not walk them through disabling security.
2. Store it:
   ```bash
   node scripts/configure_smtp.mjs --host smtp.qq.com --port 465 --user me@qq.com --pass <授权码> --apply
   # or, to keep it out of shell history:
   SMTP_PASS=xxx node scripts/configure_smtp.mjs --host smtp.qq.com --user me@qq.com --apply
   ```
   This writes four Vault items and records only their **reference names** on
   the profile. The Vault API is a full-document PUT, so the script reads the
   existing Vault and merges — never call `vault.update` with a partial set.
3. Send what was approved:
   ```bash
   node scripts/send_emails.mjs           # dry run: prints sender, attachment, and the exact list
   node scripts/send_emails.mjs --apply
   ```
   A failed send leaves the row `queued` so another address from the pool can be
   tried. Report failures per company; never silently drop one.

## Operating Loop

- **Research** — `/kelly-jobhunt research` collects companies and addresses with
  their sources and drafts one letter each.
- **Plan** — the desk sorts by match score and gives each row a stable `#n`, so
  a conversation can say "改第 3 条" unambiguously.
- **Action** — the operator reviews, edits, picks an address, and approves;
  `status: queued` plus `sent-to` and `approved-at` are written. The trusted
  sender then sends and writes `status: sent` plus `sent-at`.
- **Retrospective** — out of scope. Reply detection, reply-rate attribution, and
  follow-up sequencing belong to a Pro variant. Do not add a reply column, a
  funnel chart, or a scheduler here.

## App Artifact

- Keep the complete canonical project under `<skill-root>/app/` and provide a
  working `pnpm --dir <skill-root>/app dev` command.
- Follow the UI and product contract from `$kelly-app-skill-creator`; delegate
  the runtime, SDK, security, validation, and deployment contract to
  `$busabase-app-creator`.
- Read and write every persistent value through `busabase-sdk`. The browser
  writes exactly two things: profile fields, and a company's approval verdict
  plus its edited draft.
- Transport pagination is owned by the provider, not declared per Base. Follow
  `nextCursor` to exhaustion — `research` routinely produces more than one page
  of contact addresses, and a desk that stops at one page silently hides them.
- Writes auto-merge only on a standalone loopback preview. A deployed AirApp
  submits each write as a ChangeRequest for review.
- Keep deterministic Demo data explicit and non-persistent. Demo may mirror the
  same three-resource shape but must never become the backend, send mail, read
  the Vault, or claim a successful Busabase connection.

## Core Resources

Three application-owned Bases under one Folder, plus four Vault items. Field
slugs, status values, and Vault keys are fixed by `references/jobhunt-schema.md`.

| Resource | Purpose |
| --- | --- |
| `jobhunt-profile-v1` | One row. Identity, target role, channels, resume source text, resume file name, sender address, and the SMTP Vault reference names. |
| `jobhunt-companies-v1` | One row per company: match evidence, drafted email, outreach status, the address actually used. |
| `jobhunt-leads-v1` | Several rows per company: candidate addresses with role, source URL, and confidence. |
| Vault `SMTP_*` | Host, port, user, app password. Values readable only by the trusted sender. |

`company-key` is a plain text foreign key, not a Busabase relation field. Two
mutually referencing Bases cannot be created in one ChangeRequest, and the
browser's lazy-provisioning flow cannot perform that two-phase creation.

## Screens

Two screens plus Help & Settings, routed by hash:

- `#/profile` — the profile form, including which channels to search and whether
  SMTP is configured (readiness only, never a value).
- `#/all`, `#/to-send`, `#/sent` — one list of companies with a detail pane;
  `#/<view>/<id>` selects a row.
- `#/settings/<tab>` — guide, resources, connection.

The sidebar shows brand, then what the human must do now, then **the next
subcommand to run**, then navigation, then Help & Settings.

## Stop Conditions

Stop and report rather than proceeding when: the profile is incomplete; a
company has no address; a send would go to a guessed address; the Vault has no
SMTP credentials; or an import would overwrite a company already approved or
sent.
