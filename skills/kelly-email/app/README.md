# Kelly Email UI

Personal email assistant review desk for the `kelly-email` skill. `/kelly-email` uses this UI by default unless the user explicitly asks for chat-only email handling.

The app is intentionally not an email client:

- `/kelly-email` generates provider email records: local mode uses `.agents/skills/kelly-email/app/.data/email_records.json`; Busabase mode uses Emails Base `review_item` rows.
- The UI reads provider batch state derived from those records, shows summaries, original text, attachments, and drafts.
- The UI only writes provider decisions: local mode updates `email_records.json`; Busabase mode updates `review_item.decision_*` Base columns. Compatibility `current_batch.json` / `decisions.json` snapshots may also be refreshed.
- Contact rows are derived from the same batch: local mode writes `email_contacts.json`; Busabase mode writes the Email Contacts Base.
- `/kelly-email` later reads provider decisions and performs approved email actions.

The UI has no IMAP/SMTP behavior, no scan button, and no direct archive/send action.

If no Kelly Email provider config exists, the UI shows onboarding guidance instead of pretending the example config is active. In Busabase mode, configure `busabase:drive/config/config.json` and put secret values in `busabase:vault/kelly-email`; in local mode, configure `~/.config/kelly-email/config.json` and `~/.config/kelly-email/.env`.

`Help & Settings` shows safe read-only summaries of the current email accounts, user profile, brands, official URLs, reply style, and knowledge-base sources. It never shows secret values or the full contents of private local reference files.

The local server is Node.js and uses only built-in modules. Server code lives under `app/server/`.

Run:

```bash
.agents/skills/kelly-email/app/start.sh
```

Open:

```text
http://127.0.0.1:3000
```

Demo recording URLs:

```text
http://127.0.0.1:3000/?demo=needs-review&lang=en
http://127.0.0.1:3000/?demo=approved&lang=en
http://127.0.0.1:3000/?demo=done&lang=en
http://127.0.0.1:3000/?demo=needs-review&lang=zh-CN
http://127.0.0.1:3000/?demo=approved&lang=zh-CN
http://127.0.0.1:3000/?demo=done&lang=zh-CN
```

Use `needs-review` to show the inbox before decisions, `approved` to show approved actions waiting for `/kelly-email`, and `done` to show everything already executed.

Local provider batch and decision files are ignored by git.

Typical workflow:

1. Ask `/kelly-email` to generate the next provider review batch.
2. Open or refresh the URL printed by `app/start.sh`, usually `http://127.0.0.1:3000`.
3. Review each item, edit drafts/comments, and approve provider decisions.
4. Ask `/kelly-email` to execute approved UI decisions.

If the user says "纯聊天", "chat only", or "不要打开 UI", `/kelly-email` can skip this app and handle the numbered review queue directly in chat.
