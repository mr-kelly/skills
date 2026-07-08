---
name: kelly-email
license: MIT
description: Configurable email inbox-zero operator for clearing unread email through AI triage, draft replies, local UI review, human approval, and approved execution across configured email accounts. Use when the user invokes $kelly-email, asks to process unread email, generate or execute an email approval batch, review mail in the local App-in-Skill UI, draft replies, archive/mark-read approved messages, or reach email/support inbox zero.
---

# Kelly Email

## Overview

Use this skill as a configurable email approval desk across configured email accounts. The primary goal is email inbox zero: process all unread in-scope threads until no unreviewed unread items remain. Work in explicit user-approved batches, preserve account/source provenance, classify each request, draft helpful replies, and ask before sending or making external changes.

Default interaction mode: App UI. Unless the user explicitly asks for chat-only handling, generate/update the local App-in-Skill batch, ensure the UI is running, and tell the user to review the batch at the actual started URL, preferring `http://127.0.0.1:3000/` and the `3000-4000` port range unless a port env override is set. If the user says "纯聊天", "chat only", "不要打开 UI", "直接在这里处理", or similar, use chat message mode instead: present numbered items and drafts in the conversation, then execute only explicitly approved actions.

UI language: the local app supports multilingual interface chrome. Default language mode is `Auto`, following the browser language; the user can also set English or Chinese explicitly in `Help & Settings`. Internal suggestions, explanations, and "recommended next step" copy should be shown in the user's preferred language when known, especially Chinese for Chinese-speaking operators. Keep inbound email bodies, customer names, configured account data, and domain content in their original language; for cross-language mail, preserve the original text and add a separate translation/summary for the operator instead of replacing the original. Draft customer replies in the customer's language when clear unless the user asks otherwise.

First-run behavior: if no private config exists or required secret env vars are missing, enter onboarding mode before any mailbox scan. Greet the user, explain that this skill needs local config, show the recommended config/env paths, and tell them to store secrets only in local env files. Onboarding should also invite the user to configure their role, brands/products, official URLs, reply style, and knowledge sources so drafts match their business context. Do not ask the user to paste passwords, tokens, app passwords, or OAuth secrets into chat.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Email overview"></td>
    <td width="50%"><img src="assets/screenshots/inbox-approval.webp" alt="Kelly Email inbox approval desk"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Inbox-zero command desk with account context, queue metrics, and review workflow controls.</td>
    <td><strong>Inbox approval desk</strong><br>Mock inbox queue with approvals, sender context, reply drafts, and status filters.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly Email needs review"></td>
    <td width="50%"><img src="assets/screenshots/blocked-security.webp" alt="Kelly Email blocked security request"></td>
  </tr>
  <tr>
    <td><strong>Needs review</strong><br>Human-in-the-loop review scene for a partnership reply that needs tone and timing judgment.</td>
    <td><strong>Blocked security request</strong><br>Risk-heavy email scenario where the assistant blocks a suspicious request instead of drafting a reply.</td>
  </tr>
</table>

## Operating Rules

- Prefer IMAP mailbox access when the local Kelly Email config provides IMAP settings. Use Spark only when the user explicitly asks for Spark or when IMAP is unavailable and Spark is already authorized.
- Require explicit user approval before starting any email-processing batch. Do not treat invocation of the skill as approval to process mail.
- Process email in review-quota batches with a declared scope, such as accounts, labels/folders, time window, search query, review quota, and intended actions.
- If the user approves "process until account done", continue proposing and processing bounded batches for that account until no in-scope threads remain, but still require separate approval before any send or mailbox-changing action.
- Treat "done" as: every unread in-scope support thread is either replied/drafted, escalated, waiting on user, waiting on customer, or approved for no-reply cleanup. Do not count a thread as done just because it was seen.
- Treat every message as sensitive. Quote only what is necessary, avoid exposing unrelated thread contents, and never store secrets, tokens, cookies, or private attachments in this repository.
- Read IMAP/SMTP passwords from environment variables only. Never ask the user to paste secrets into chat or commit them into files.
- Support multiple inboxes by always tracking `account`, `from`, `thread_id` or message URL/identifier when available, `received_at`, `customer`, `topic`, `status`, `priority`, and `next_action`.
- Separate physical mailbox accounts from outbound identities. One mailbox can have many aliases, brands, names, signatures, and reply rules.
- Do not send replies, mark messages, archive, delete, unsubscribe, change labels, or create calendar/contact changes unless the user explicitly approves that exact action. The user may grant a standing approval for low-risk notification cleanup within an approved batch.
- When multiple configured addresses point to the same underlying mailbox, deduplicate by message-id/thread headers and account group so the same unread thread is not processed twice.
- If a request depends on product, billing, legal, or policy facts that are not in context, search existing docs or ask the user before giving a definitive answer.
- Keep customer-facing drafts concise, warm, specific, and honest. Use compressed copy: lead with the answer, cut filler, prefer short paragraphs, and keep most replies under 180 words unless complexity truly requires more.
- For Chinese user-facing work, communicate with the user in Chinese unless the customer thread uses another language. Keep UI recommendations and operator notes in Chinese when that is the user's preference; keep the email original visible, and add translation as a separate helper field when needed.

## Private Configuration

Keep the skill generic. Do not hardcode personal accounts, aliases, product names, passwords, risk keywords, or reply style in the skill code. Read them from private config files that are ignored by git.

Config file priority:

1. `KELLY_EMAIL_CONFIG=/absolute/path/to/config.json`
2. `.agents/skills/kelly-email/config.local.json`
3. `~/.config/kelly-email/config.json`
4. `.agents/skills/kelly-email/config.example.json`

Env file priority:

1. Existing system environment variables
2. `KELLY_EMAIL_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `.agents/skills/kelly-email/.env.local`
5. `~/.config/kelly-email/.env`

Data provider selection:

```text
KELLY_EMAIL_DATA_PROVIDER=local
```

Configuration is read through `lib/data-provider/` (selector `KELLY_EMAIL_DATA_PROVIDER`, default `local`; the old `KELLY_EMAIL_DATA_READER` is still honored). The current provider is `local`, which reads local JSON/env files with the priority above. Keep app server code, scripts, onboarding, and UI summaries dependent on the data-provider interface rather than local files directly, so a future provider can supply the same config contract from a remote store.

The config file defines mailbox accounts, aliases, outbound identities, user profile, brands/products, official URLs, knowledge sources, reply style, CTA URLs, approval policy, and user-editable risk keywords. The env file stores secret values referenced by `password_env`; never store secret values in JSON.

Treat `.agents/skills/kelly-email/config.example.json` as a template only. It must not count as a configured mailbox. If only the example config is present, stop and show onboarding instructions.

For each real email account, add one `mailboxes` entry with IMAP/SMTP settings. For alternate receiving addresses on the same physical mailbox, add `aliases` under that mailbox and reuse the same `mailbox_group_id`. For each outbound persona, add one `identities` entry and map it to the mailbox with `mailbox_id`; choose the identity by `recipient_addresses`, customer domains, or keywords.

For archive/cleanup actions, configure `archive_routing` per mailbox. Do not assume a universal `Archive` folder. Approved archive means: move the message to the configured target folder for its category/risk and mark it read. If no target folder is configured, block execution and ask for the folder mapping instead of guessing.

When the user asks to add or change an email account, update the private JSON config or explain the exact JSON/env changes needed. Ask for non-secret details only: mailbox email, IMAP/SMTP host/port/security, username, folders, aliases, outbound identities, display names, and routing rules. Never ask for the actual password or app token in chat; create or name the `password_env` variables and tell the user to put the secret values in the private env file. After config changes, offer to test readiness and report missing env vars.

Good user prompts to support:

```text
/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新本地 config，但不要让我在聊天里贴密码。

/kelly-email 给 main 账号增加 alias：hello@example.com，并新增一个 outbound identity：display name 是 Founder，send_as 是 founder@example.com。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 env secret。
```

Example setup:

```json
{
  "mailboxes": [
    {
      "mailbox_id": "main",
      "primary_email": "me@example.com",
      "aliases": ["founder@example.com", "support@example.com"],
      "imap": { "host": "imap.example.com", "port": 993, "security": "ssl", "username": "me@example.com", "password_env": "KELLY_EMAIL_IMAP_PASSWORD_MAIN" },
      "smtp": { "host": "smtp.example.com", "port": 465, "security": "ssl", "username": "me@example.com", "password_env": "KELLY_EMAIL_SMTP_PASSWORD_MAIN" },
      "archive_routing": { "default_folder": "Processed", "by_category": { "money": "Finance" }, "by_risk": { "security": "Security" } },
      "mailbox_group_id": "main-account",
      "send_identities": ["support"]
    }
  ],
  "identities": [
    { "identity_id": "support", "mailbox_id": "main", "send_as_email": "support@example.com", "display_name": "Support", "use_when": { "recipient_addresses": ["support@example.com"] } }
  ],
  "risk_policy": {
    "review_keywords": { "money": ["invoice", "payment", "账单", "付款"], "security": ["password", "token", "privacy"] },
    "allow_override_for": ["archive", "mark_read"]
  }
}
```

See `config.example.json` for the full template (`user_profile`, `brands`, `official_urls`, `knowledge_base`, `style`, and complete `archive_routing`).

Example env:

```text
KELLY_EMAIL_IMAP_PASSWORD_MAIN=app-password-or-token
KELLY_EMAIL_SMTP_PASSWORD_MAIN=app-password-or-token
```

## Profile, Style, And Knowledge Configuration

Treat private config as the user's local operating context, not only an account list. When drafting replies or explaining recommendations, use:

- `user_profile`: who the operator is, their role/company, public contact methods, languages, and default reply persona.
- `brands`: products or brands the operator represents, including product positioning and brand-specific URLs.
- `official_urls`: homepage, docs, support, pricing, calendar, social/tutorial, and primary CTA links.
- `knowledge_base`: safe local files, public URLs, short facts, and "do not say" rules for product/support knowledge.
- `style`: language, tone, length target, paragraph style, quote behavior, signature behavior, reply rules, and CTA URLs.

Use configured knowledge before inventing product, pricing, compliance, roadmap, or support facts. If the relevant fact is not present in config, current email context, or approved docs, ask the user or leave the item in `Needs Review`.

The App UI may display these settings in `Help & Settings`, but only as a sanitized summary. Never expose env secret values, tokens, cookies, private file contents, or raw knowledge-base documents through `/api/state`, screenshots, reports, or batch files.

## Default Workflow

1. Detect interaction mode. Default to App UI mode. Use chat message mode only when the user explicitly asks for pure chat/no UI handling.
2. Check onboarding state before proposing or running mailbox scans. If no private config exists, or if required env vars are missing, stop and guide setup instead of reading mail.
3. Propose a batch plan before reading or processing mail: accounts, labels/folders, unread-only scope, time window, query, review quota, cleanup policy, and whether the batch will only triage, draft replies, or prepare send-ready actions.
4. Wait for explicit user approval, such as "同意", "approve", "go", or a direct instruction that clearly confirms the proposed batch.
5. Search inboxes only within the approved scope. If account inventory, aliases, or reply identity rules are needed, read `references/inbox-accounts.md` and the local/private config if present.
6. Build a compact support queue with one row per thread, not one row per message.
7. Classify each thread using `references/support-taxonomy.md`.
8. Look up prior context in the thread, related emails from the same sender/domain, calendar events, contacts, docs, or existing support notes, only as needed for the approved batch.
9. Select the reply identity from the original recipient address, product/domain, thread history, and customer language. If the identity is ambiguous, ask the user.
10. Draft replies or next actions. Separate customer-visible text from internal notes.
11. Localize operator-facing batch fields before handing off to the app: `review_brief.i18n`, `reason`/recommendations, and internal suggestions should match the user's preferred language when known. Preserve `body_original` exactly; if the email language differs from the user's language, add `body_translation` in the user's language as a helper while keeping the original visible.
12. In App UI mode, write the local batch, start/reuse the UI, tell the user to review it there, then wait for them to ask you to execute approved decisions. In chat message mode, present numbered actions/drafts directly in chat and ask for approval there.
13. Continue scanning and auto-cleaning low-risk notifications until the review quota is reached or the account/group has no unprocessed unread in-scope support threads.

## Onboarding Mode

Use onboarding mode when Kelly Email is invoked before setup is complete.

Onboarding checks:

- No private config found at `KELLY_EMAIL_CONFIG`, `.agents/skills/kelly-email/config.local.json`, or `~/.config/kelly-email/config.json`.
- Only `config.example.json` exists.
- A private config exists, but required IMAP/SMTP env vars are missing.

Onboarding response:

1. Greet the user briefly and say Kelly Email needs local mailbox configuration before it can scan mail.
2. Point them to `~/.config/kelly-email/config.json` for non-secret account settings.
3. Point them to `~/.config/kelly-email/.env` for app passwords or tokens.
4. Explain that JSON should contain `password_env` names only, never secret values.
5. Suggest copying `.agents/skills/kelly-email/config.example.json` as the starting template.
6. Tell them to fill in mailboxes/identities plus `user_profile`, `brands`, `official_urls`, `style`, and `knowledge_base` so the Agent can draft in the right role and voice.
7. After they configure files, offer to test configuration and then generate the first App UI batch.

Never proceed to mailbox reads in onboarding mode.

## Email Inbox Zero Goal

Default target: all unread support-related threads in approved accounts.

Classify every unread thread into exactly one outcome:

- `reply_needed`: draft a customer reply.
- `escalate`: ask the user or another owner for input before replying.
- `waiting_on_customer`: no reply needed until customer answers.
- `waiting_on_user`: user decision required.
- `no_reply_cleanup`: newsletter, notification, spam, duplicate, or irrelevant message that can be marked read/archived only after approval.
- `not_support`: unrelated unread item; summarize briefly and ask whether to ignore, archive, or leave unread.

Progress metric:

```text
unread_start | scanned | auto_cleaned | needs_review | drafted | escalated | waiting | unread_remaining
```

Never use "mark as read" as a shortcut for hard messages. Marking read is a mailbox-mutating action and requires explicit approval.

## Review-Quota Scan Mode

Use this mode when the user wants to clear large unread backlogs.

Default stop condition: keep scanning unread mail until either:

- `needs_review` reaches 5 threads, or
- no more in-scope unread mail remains.

Low-risk cleanup messages do not count toward the review quota and may be processed without an upper count limit inside the approved batch when the user has approved cleanup. Examples:

- Product onboarding form notifications that are duplicated to multiple aliases.
- Newsletters, event invites, listings, social digests, marketing email, and generic cold outreach.
- Closed alerts, routine billing receipts, completed payment notices, and system notifications with no action required.
- LinkedIn invitations, connection suggestions, and social-message digests unless the user has explicitly asked to handle LinkedIn.
- Routine internal company announcements such as holiday schedules, office notices, and non-action HR/admin broadcasts.

Stop and surface for review when a thread is:

- A customer reply or contact form with real intent.
- Course feedback, course homework, lesson feedback, survey answers with free-text learning notes, or product education submissions.
- Anything involving money: invoices, receipts, payments, payouts, charges, renewals, subscriptions, bank transactions, domain purchases/renewals, payroll, taxes, refunds, balances, or explicit amounts.
- A bug report, complaint, refund, account access, billing dispute, sales opportunity, partnership, or security/privacy issue.
- A technical/finance/security alert that appears urgent, unresolved, unusual, or not safely classifiable.
- A message from a real person where intent is unclear.

Do not classify a message as security just because a social or newsletter URL contains tracking parameters such as `otpToken`. Look at sender, subject, and visible message intent first.

Do not classify an internal announcement as security just because it mentions office safety reminders such as locking doors, closing windows, or turning off power before holidays.

For duplicated form notifications sent to multiple aliases, dedupe by survey ID or identical form body. Show one summary and mention duplicate recipients instead of counting both as separate review items.

Cache scan state locally in `.agents/skills/kelly-email/.cache/` so repeated runs avoid reprocessing the same UID/message-id. Store only non-secret metadata such as UID, message-id, subject hash or short subject, category, action, timestamp, and whether the user approved cleanup. Do not store full email bodies, attachments, secrets, or contact exports in the cache.

After every auto-cleanup run, summarize what was cleaned. Do not report only a count.

Include:

- Total auto-cleaned count.
- Counts by cleanup category.
- A compact list of cleaned messages with UID, sender/domain, short subject, and reason.
- Any broad pattern noticed, such as repeated product onboarding submissions, GitHub notifications, MongoDB alerts, newsletters, LinkedIn digests, or cold outreach.

It is acceptable to store short subject/from metadata in the local cache for audit and reporting. Do not store email bodies or attachments.

## Batch Approval Gate

Never start processing an email batch until the user approves the batch plan.

Use this approval request shape:

```text
Batch plan:
- Accounts:
- Scope: unread support threads
- Time window:
- Review quota:
- Auto-cleanup policy:
- Actions: triage only / draft only / prepare send-ready replies / execute approved actions
- Stop condition: one batch / until account done / until user stops
- Identity rules:

Please approve before I process this batch.
```

Allowed before approval:

- Explain how the skill works.
- Prepare or edit configuration files.
- Propose a batch plan.
- Ask clarifying questions.

Not allowed before approval:

- Search, read, summarize, classify, or draft from live emails.
- Open attachments.
- Send messages.
- Mark, archive, delete, label, unsubscribe, or move emails.

After triage/drafting, ask for action approval using this shape:

```text
Proposed actions:
- thread_id / subject:
- reply_as:
- action:
- customer-visible draft or mailbox change:
- risk:

Reply with the action numbers you approve.
```

Only execute the numbered actions the user approves. If the user says "approve all", apply only the actions shown in the latest proposed-actions list.

## Local Review UI Workflow

When the user wants to review mail through the local UI, use a file handoff instead of asking for approval item by item in chat.

The kelly-email skill owns the approval workflow and local file contract. The zero-dependency core does not bundle IMAP/SMTP readers or senders; mailbox reads and writes must come from an external connector, Spark when explicitly requested and available, or an agent-provided batch. The local UI is only an approval surface over files. The UI must not scan mailboxes, send replies, archive, mark read, delete, or label mail directly.

Use this Local Review UI Workflow by default. If the user did not request chat-only handling, assume they want App UI mode. After the batch is generated and agent-reviewed, say clearly that the batch is ready in the UI and ask them to review/approve there. Do not continue with long chat item-by-item review unless the user asks to stay in chat.

When `/kelly-email` is generating, drafting, or executing a batch, create `.agents/skills/kelly-email/app/.data/agent.lock` before writing batch/decision files and remove it in a `finally` step. The lock file should contain JSON with `owner`, `message`, and `started_at`. The UI polls this lock, disables editing while it exists, and the server rejects decision/detail writes during the lock to prevent concurrent file edits.

Before or after generating a local review batch, ensure the UI is running by invoking `.agents/skills/kelly-email/app/start.sh` from the repository root. Prefer the `3000-4000` port range; if the service is already running on the selected port, reuse it. Tell the user to open or refresh the actual URL printed by the launcher.

For App-in-Skill batch generation, prefer running `.agents/skills/kelly-email/scripts/generate_review_batch.ts` from the repository root. In the zero-dependency core, this validates config and prepares local batch/decision files, but does not read IMAP mail. Email items must be supplied by an external connector, Spark when explicitly requested and available, or an agent-authored batch before review.

Treat the script output as a rule-based prefilter, not as the final support classification. The support agent must perform an Agent Semantic Classification Pass before telling the user the batch is ready:

1. Read the generated batch file.
2. Use the kelly-email skill instructions, inbox/account rules, taxonomy, prior user preferences, and the visible message body/subject/sender to classify each item.
3. Correct false positives from keyword matching, such as newsletters containing money words, product updates containing "roadmap", or notifications containing security-looking URL parameters.
4. Prefer conservative review for real customer intent, money, security/privacy, sales/partnership, complaints, attachments, unclear human messages, and course/homework/feedback.
5. Keep obvious newsletters, duplicated onboarding forms, social digests, routine GitHub/MongoDB/Vercel notifications, and low-risk system emails as `prepared` unless the content indicates unresolved urgency.
6. Write the agent-reviewed result back to the same batch file with `classification_method: "agent_review"` and an `agent_review` object containing concise evidence, confidence, and whether the decision changed the rule prefilter.

The UI should present agent-reviewed classifications when available. If a batch only has `classification_method: "rule_prefilter"`, tell the user it is a raw prefilter batch and run the Agent Semantic Classification Pass before asking them to approve actions.

Do not turn the Agent Semantic Classification Pass into another keyword classifier. The Node.js generator may extract evidence and conservative safety flags, but the actual semantic judgment is made by the support agent while following this skill, using the user's preferences and the current batch context.

For every `Needs Review` item, include a short review briefing for the user. The briefing should explain the background, why the item needs review, and a recommended next step such as "approve archive", "write reply direction and choose Draft reply", "check attachment first", "confirm with finance", or "leave unread". Do not make the user infer what to do from only the subject and status.

Number the current `Needs Review` queue for conversational edits. The UI should show a stable per-batch reference such as `Review #1`, `Review #2`, etc., derived from the current batch's Needs Review items in newest-first order. Show the reference in both the list row and the detail view. When the user says "改 2", "第二封", or similar, resolve that against this current Needs Review numbering before editing drafts or notes.

The review UI should keep human input lightweight. Prefer a single `Review note` field for the user's instruction to `/kelly-email`; show an editable reply draft only when an actual draft exists or the user is approving a send action. Treat the note as the user's natural-language decision context, for example "ask Casper", "ok to archive", "draft a short reply", or "paid invoice; leave unread". Provide a `Draft reply` decision for messages where the user wants `/kelly-email` to compose a reply from the review note without sending it. Treat `draft_reply` as an approved next support action and show it under `Approved` only until the agent creates the draft; it is not a mailbox mutation and must not send email. After the draft is created, set the item to `status=drafted` and return it to `Needs Review` so the user can inspect the final wording before choosing `Approve send`.

The review UI should auto-refresh local batch files on a timer and should not need a manual refresh button. Do not redraw the batch while the user is actively editing a textarea or non-search input; in that case poll only the lock state so the user's draft/note is not interrupted.

Keep the UI sidebar focused on workflow state, not message category. Put a prominent "what needs the human" summary at the top of the sidebar, before the view filters, and separate it from the filters with a divider. Use the workflow filters `All`, `Needs Review`, `Approved`, `Done`, and `Blocked`, and give each sidebar filter a hover explanation. Do not put category filters such as `Money` or `Course` in the primary sidebar; show categories as badges on each message instead.

Keep setup/tutorial details out of the always-visible sidebar. Provide a small `Help & Settings` button that opens a modal with tabs such as `Guide`, `Files`, `Accounts`, `Profile`, `Style`, `Knowledge`, and `Config`. Put usage notes, batch file path, decisions file path, config source, recommended config/env locations, configured email-account summaries, and sanitized profile/style/knowledge summaries inside that modal. The sidebar should stay focused on workflow filters and should not show long paths, account setup details, or how-to text.

If onboarding is required, the UI should show a setup card in the list/detail area and in `Help & Settings`, with recommended config/env paths and missing env vars. Disable any implication that mail can be scanned until setup is complete.

Generate a batch file at `.agents/skills/kelly-email/app/.data/current_batch.json`, one row per thread. See `references/batch-schema.md` for the full batch-file and decisions-file schema — per-item fields, the classification pipeline stages, and how UI workflow state (`All`/`Needs Review`/`Approved`/`Done`/`Blocked`) is derived.

After the user reviews in the UI, read `.agents/skills/kelly-email/app/.data/decisions.json`. Treat it as the user's approval/comment layer, but still execute only decisions that are explicit (`archive`, `mark_read`, `send_reply`, `draft_reply`, `keep_unread`, `no_action`, `needs_review`, `revise`; see `references/batch-schema.md`):

For `send_reply`, use the edited draft from the decisions file or current batch file, preserve threading headers, include a short quote, then archive only if the decision or batch item says so. When archiving after send, use the same configured category/risk target folder and mark the message read; never hardcode `Archive`. In the zero-dependency core, this is prepared and reported but not sent; an external SMTP connector must apply the approved send.

For App-in-Skill decision execution, prefer `.agents/skills/kelly-email/scripts/execute_ui_decisions.ts`. It reads `current_batch.json` and `decisions.json`, validates explicit UI-approved actions, blocks real mailbox side effects because IMAP/SMTP execution is not bundled, and writes a JSON report under `.agents/skills/kelly-email/app/.data/execution_reports/`. Use `--dry-run` for validation when unsure.

Treat the UI approval as the user's final approval for `archive` and `mark_read` by default, including messages that were originally classified as money, billing, account/security, technical alerts, attachments, or unclear real-person intent. Do not add another default safety block for those cleanup actions after the user approves them in the UI; the zero-dependency executor will still report them as connector-blocked until an external mailbox connector applies them.

Allow users to opt back into cleanup blocking through private config: `risk_policy.block_by_default` may include `archive` or `mark_read`, and the configured `risk_policy.review_keywords` categories such as `money`, `security`, `attachments`, or `course_feedback` should then block matching approved cleanup actions until the user overrides them.

For `send_reply`, keep a stricter final safety check: require an explicit UI-approved `send_reply` decision and a non-empty approved draft. Never send replies because of a broad cleanup approval.

Typical user flow:

1. User asks `/kelly-email` to generate the next approval batch.
2. Kelly Email skill or an external connector prepares `.agents/skills/kelly-email/app/.data/current_batch.json`, then starts the UI.
3. User reviews locally in the UI. The UI writes `.agents/skills/kelly-email/app/.data/decisions.json`.
4. User asks `/kelly-email` to execute UI-approved decisions.
5. Kelly Email validates only explicit decisions and writes an execution report; an external connector is required for real mailbox mutations or sends.

## Chat Message Mode

Use chat message mode only when the user explicitly asks to handle email without the App UI.

In chat message mode:

1. Keep the same batch approval gate and mailbox safety rules.
2. Present the review queue directly in chat with stable numbered items, concise context, proposed action, and any suggested reply.
3. For messages that likely need replies, include the short draft or reply outline immediately instead of waiting for the user to ask.
4. Ask the user to approve item numbers or give edits by number.
5. Execute only explicitly approved actions, preserving send safety, threading, and quote rules.
6. Summarize cleaned/executed items and remaining unread/review items after each batch.

## Queue Format

Use this shape for triage summaries:

```text
account | customer | subject | category | priority | status | next_action | draft_ready | notes
```

Priority:

- `urgent`: payment outage, locked account, angry customer, deadline today, security/privacy issue, refund threat, executive/VIP, legal risk.
- `high`: customer blocked, paid user cannot use core feature, repeated follow-up, time-sensitive sales/support issue.
- `normal`: ordinary question, feature request, onboarding help, mild bug.
- `low`: FYI, newsletter, automated notification, low-intent inquiry.

Status:

- `needs_reply`
- `drafted`
- `waiting_on_user`
- `waiting_on_customer`
- `escalate`
- `resolved`
- `ignore_or_archive`

## Reply Draft Pattern

For each review item where a reply is likely useful, include:

- A short `suggested_reply` draft or reply outline in the batch item.
- A `review_brief.recommendation` that says why that reply direction is recommended.
- Enough context in `review_brief.background` so the user can approve, edit, or reject the reply without rereading the entire thread.
- A visible `Review #n` reference in the UI so the user can ask for edits by number in chat.

For each send-ready draft, include:

- Suggested subject if useful.
- `reply_as` identity.
- Customer-facing reply.
- Original-message quote preview to include when sending a customer reply.
- Internal note with why this response is safe and what evidence was used.
- Any assumptions or questions for the user.
- Whether the message is safe to send as-is.

Default tone: clear, calm, human, and compact. Prefer direct answers and one concrete next step.

### Reply-Draft Review (optional Busabase backend)

Triage (archive / mark-read) is *approve-an-action* work and stays on the local handoff. The **reply draft** is the one *edit-to-canonical* slice: a reply is written, reviewed, revised ("make it warmer"), and approved before sending — the canonical review loop. That slice has its own small store, `lib/reply-review/`, selected by `KELLY_EMAIL_REPLY_PROVIDER`:

- `local` (default): `app/.data/reply_reviews.json`. Single operator, zero-dependency.
- `busabase`: a shared Busabase base, so a **team** sees one reply-review queue and an audit of who approved which reply. Configure `config.busabase.{base_url,base_id}` (busabase-cloud needs `KELLY_EMAIL_BUSABASE_API_KEY`; the single-tenant open-source `apps/busabase` does not).

Both expose the same interface and review verbs: `openReplyDraft` → `reviewReply(reply_id, {verdict})` with `approve | request_changes | revise | block` → `getApprovedReply` → the skill sends → `markSent`. `request_changes` moves the reply to `changes_requested` and enqueues an agent task (`listAgentTasks`); after the agent revises, it returns for re-review.

This stays a **single-machine skill** — no standing service. Going team-wide just means pointing the reply store (and, when the triage handoff itself moves, the whole handoff including `agent.lock`) at a shared Busabase base instead of local files; the shared lock serializes the team's writes, so no per-item claim or optimistic concurrency is needed.

Drive this loop with `scripts/reply_review.ts` (it selects the provider from `KELLY_EMAIL_REPLY_PROVIDER`):

```
node scripts/reply_review.ts open --email-id <id> --to <addr> --subject <s> --draft -   # creates a reply draft for review
node scripts/reply_review.ts list                                                       # see all reply drafts + status
node scripts/reply_review.ts tasks                                                       # drafts the reviewer sent back (changes_requested) — revise these
node scripts/reply_review.ts review <reply_id> --verdict approve                         # (usually done by the human in the UI)
node scripts/reply_review.ts approved <reply_id>                                         # the skill reads the approved reply, then SENDS it
node scripts/reply_review.ts sent <reply_id>                                             # after sending, mark merged/done
```

When you propose a reply, `open` it as a draft instead of only inlining `suggested_reply`; poll `tasks` to pick up requested revisions; and only `send` what `approved` returns.

Boundary: Busabase and the UI never send mail. Only the skill — run by an operator, holding the SMTP credentials — performs the send, after the reply is approved. A reply record's fields are `kind:"email_reply"`, `to`, `subject`, `body`.

## Reply Threading And Quotes

When sending a customer reply:

- Set email threading headers when available: `In-Reply-To` and `References`.
- Include a short standard quoted excerpt from the customer's latest message below the new reply body.
- Keep the quote short: usually sender/date line plus the first relevant 3-8 lines or the specific part being answered.
- Trim signatures, tracking blocks, newsletters, long prior threads, legal footers, and repeated quoted history.
- Use a conventional quote format such as:

```text
On <date>, <sender> wrote:
> <short relevant excerpt>
```

- If the user asks for a clean reply, omit the quoted body but still preserve threading headers.

## Compressed Copy Rules

Write customer replies as if the user will send them with minimal editing:

- Start with the conclusion or useful answer.
- Use 1-2 sentence paragraphs.
- Use bullets only when they reduce reading effort.
- Prefer 3-6 bullets; avoid long numbered essays.
- Remove meta commentary such as "I looked carefully" unless it reassures the customer.
- Avoid repeating the customer's request back unless needed for clarity.
- Include only links, contacts, caveats, and next steps that matter.
- End with a simple next action.
- If the user asks for a shorter version, cut by at least 30%.

Default length targets:

- Routine support: 60-120 words.
- Sales/customer reply: 100-180 words.
- Complex technical explanation: 180-300 words, with a short summary first.
- Escalation or angry customer: short acknowledgement plus next step; do not over-explain.

## Coupon/CTA Reply Rule

When replying to missing coupon-code or broken merge-tag messages:

- Include the working coupon code from the user, local config, or thread context.
- Include the relevant CTA URL from the user, local config, or product context.
- If the coupon code or CTA URL is unavailable, ask before sending.
- Keep it short and apologetic.
- Preserve threading headers and include a short quoted excerpt.

## Escalation Rules

Escalate or ask before drafting a definitive answer when a thread involves:

- Refunds, cancellations, chargebacks, invoices, or pricing exceptions.
- Security incidents, privacy requests, account access, or data deletion.
- Legal threats, compliance questions, contracts, NDAs, or employment issues.
- Commitments about roadmap, release dates, uptime credits, custom work, or enterprise terms.
- Angry customers where a careless reply could make the situation worse.

## References

- Read `references/inbox-accounts.md` when account routing, aliases, labels, or per-account handling rules matter.
- Read `references/support-taxonomy.md` when classifying messages, deciding priority, or writing reusable support notes.
- Use `config.example.json` as the template for a private `config.local.json` or `~/.config/kelly-email/config.json` file. Never commit private config or env files.
