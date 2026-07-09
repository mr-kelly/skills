# Kelly Email

AI-assisted inbox zero with human approval.

## Default Use

Use `/kelly-email` to scan unread email, classify messages, draft replies, and prepare cleanup actions.

By default, `/kelly-email` opens the local App-in-Skill UI:

```text
http://127.0.0.1:3000/
```

The app is only an approval desk. It reads and writes through the selected data provider; mailbox scanning and approved actions are performed by the CLI scripts.

Kelly Email bundles IMAP/SMTP connector scripts: `scripts/generate_review_batch.ts` scans unread IMAP mail into the active provider batch, and `scripts/execute_ui_decisions.ts` applies explicit UI-approved archive/mark-read/send actions. The UI itself still never scans mailboxes, sends replies, archives mail, or marks mail read directly.

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

## First Run Setup

If Kelly Email is not configured yet, it starts in onboarding mode and will not scan mail.

Local provider mode uses:

```text
~/.config/kelly-email/config.json
~/.config/kelly-email/.env
```

Busabase provider mode uses:

```text
busabase:drive/config/config.json
busabase:vault/kelly-email
```

Start from:

```text
.agents/skills/kelly-email/config.example.json
```

Put account settings, aliases, folders, identities, user profile, brands, official URLs, knowledge sources, reply style, risk keywords, and secret reference names in JSON. In Busabase mode, use `vault_ref` and put actual IMAP/SMTP app passwords or tokens in Busabase Vault.

Never paste email passwords or tokens into chat.

The useful non-secret config blocks are:

- `user_profile`: your name, role, company, public contact methods, and languages.
- `brands` and `official_urls`: product names, homepage/docs/support/calendar/tutorial links, and CTA URLs.
- `knowledge_base`: public URLs, local reference files, short product facts, and claims the agent should not make.
- `style`: tone, length, quote behavior, signature behavior, and reply rules.

## App UI Flow

1. Ask `/kelly-email` to generate the next email batch.
2. Review the batch in the local UI.
3. Edit suggested replies or review notes.
4. Approve archive, mark read, draft reply, or send actions.
5. Return to chat and ask `/kelly-email` to execute approved decisions.

The skill then reads provider decisions, applies approved mailbox actions through the bundled IMAP/SMTP connector, and writes an execution report.

For approved archive actions, execution moves the message to the configured category/risk folder for that mailbox and marks it read. It does not assume one universal `Archive` folder.

## Chat-Only Mode

If you do not want the UI, say so explicitly:

```text
/kelly-email 纯聊天处理
/kelly-email chat only
/kelly-email 不要打开 UI，直接在这里处理
```

In chat-only mode, `/kelly-email` shows numbered items, suggestions, and draft replies directly in the conversation. You approve or edit by number.

## Provider Storage

Local provider files:

```text
.agents/skills/kelly-email/app/.data/email_records.json
.agents/skills/kelly-email/app/.data/email_contacts.json
.agents/skills/kelly-email/app/.data/agent.lock
.agents/skills/kelly-email/app/.data/current_batch.json     # compatibility snapshot
.agents/skills/kelly-email/app/.data/decisions.json         # compatibility snapshot
```

Busabase provider paths:

```text
busabase:base/review_item
busabase:base/email_contact
busabase:base/execution_report
busabase:drive/config/config.json
busabase:drive/state/lock.json
busabase:drive/state/scan_state.json
busabase:drive/state/current_batch.json     # compatibility snapshot
busabase:drive/state/decisions.json         # compatibility snapshot
busabase:drive/batches/<batch_id>.json
busabase:drive/attachments/<batch_id>/...
busabase:vault/kelly-email
```

Secrets stay out of JSON. Local mode references env variable names; Busabase mode references Vault keys with `vault_ref`.

In the app, open `Help & Settings` to see the current account, profile, style, URL, and knowledge-base summaries that `/kelly-email` will use.

Kelly Email reads configuration through a data-provider layer (`lib/data-provider/`). Supported providers:

```text
KELLY_EMAIL_DATA_PROVIDER=local
KELLY_EMAIL_DATA_PROVIDER=busabase
```

To add or change accounts, talk to the skill instead of editing from the UI:

```text
/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新当前 provider config，但不要让我在聊天里贴密码。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 secret ref。
```
