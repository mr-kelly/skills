# Kelly Email

AI-assisted inbox zero with human approval.

## Default Use

Use `/kelly-email` to scan unread email, classify messages, draft replies, and prepare cleanup actions.

By default, `/kelly-email` opens the local App-in-Skill UI:

```text
http://127.0.0.1:3000/
```

The app is only an approval desk. It reads and writes local files; it does not scan mailboxes, send replies, archive mail, or mark mail read by itself.

Kelly Email is zero-dependency by default: the local app, config checks, batch files, decisions, reports, and validator all run on built-in Node.js only. IMAP/SMTP scanning and execution are not bundled as npm dependencies; use an external connector or agent step to supply email items and apply approved mailbox actions.

## First Run Setup

If Kelly Email is not configured yet, it starts in onboarding mode and will not scan mail.

Create:

```text
~/.config/kelly-email/config.json
~/.config/kelly-email/.env
```

Start from:

```text
.agents/skills/kelly-email/config.example.json
```

Put account settings, aliases, folders, identities, user profile, brands, official URLs, knowledge sources, reply style, risk keywords, and `password_env` names in JSON. Put actual IMAP/SMTP app passwords or tokens in the `.env` file only.

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

The skill then reads the local decisions file and writes an execution report. In this zero-dependency build, real mailbox actions are blocked unless an external connector applies them.

For approved archive actions, execution should move the message to the configured category folder for that mailbox and mark it read. It should not assume one universal `Archive` folder.

## Chat-Only Mode

If you do not want the UI, say so explicitly:

```text
/kelly-email 纯聊天处理
/kelly-email chat only
/kelly-email 不要打开 UI，直接在这里处理
```

In chat-only mode, `/kelly-email` shows numbered items, suggestions, and draft replies directly in the conversation. You approve or edit by number.

## Local Files

Default local files:

```text
.agents/skills/kelly-email/app/.cache/current_batch.json
.agents/skills/kelly-email/app/.cache/decisions.json
.agents/skills/kelly-email/app/.cache/agent.lock
```

Private config can live in:

```text
~/.config/kelly-email/config.json
~/.config/kelly-email/.env
```

Secrets stay in env files. The JSON config should only reference secret env variable names.

In the app, open `Help & Settings` to see the current account, profile, style, URL, and knowledge-base summaries that `/kelly-email` will use.

Kelly Email reads configuration through a data-reader layer. Today the supported reader is local files:

```text
KELLY_EMAIL_DATA_READER=local
```

The same reader interface is reserved for future Supabase/Postgres/pusa-cloud config sources.

To add or change accounts, talk to the skill instead of editing from the UI:

```text
/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新本地 config，但不要让我在聊天里贴密码。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 env secret。
```
