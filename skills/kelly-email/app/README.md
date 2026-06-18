# Kelly Email UI

Local file-only approval desk for the `kelly-email` skill. `/kelly-email` uses this UI by default unless the user explicitly asks for chat-only email handling.

The app is intentionally not an email client:

- `/kelly-email` generates a local batch file at `.agents/skills/kelly-email/app/.data/current_batch.json`.
- The UI reads that batch, shows summaries, original text, attachments, and drafts.
- The UI only writes local decisions to `.agents/skills/kelly-email/app/.data/decisions.json`.
- `/kelly-email` later reads the decisions file and performs approved email actions.

The UI has no IMAP/SMTP behavior, no scan button, and no direct archive/send action.

If no private Kelly Email config exists, the UI shows onboarding guidance instead of pretending the example config is active. Configure `~/.config/kelly-email/config.json` and `~/.config/kelly-email/.env`, then ask `/kelly-email` to test config or generate a batch.

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

Local batch and decision files are ignored by git.

Typical workflow:

1. Ask `/kelly-email` to generate the next local review batch.
2. Open or refresh the URL printed by `app/start.sh`, usually `http://127.0.0.1:3000`.
3. Review each item, edit drafts/comments, and approve local decisions.
4. Ask `/kelly-email` to execute approved UI decisions.

If the user says "纯聊天", "chat only", or "不要打开 UI", `/kelly-email` can skip this app and handle the numbered review queue directly in chat.
