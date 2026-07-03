# Kelly Social

Kelly Social is a local App-in-Skill dashboard that aggregates Twitter/X, Facebook, and Instagram accounts (extensible to LinkedIn, YouTube, Threads, TikTok, and Xiaohongshu) into one social command desk.

## What It Shows

- Overview: per-platform KPI cards with 7d/28d deltas, cross-platform follower trends, top posts this week, and collection freshness.
- Timeline: one reverse-chronological feed across all platforms with platform filters and per-post metrics.
- Post detail: full text, metrics breakdown, permalink, and agent notes.
- Accounts: handle inventory with followers, growth, engagement rate, and collection method.
- Account detail: profile summary, follower sparkline, top posts, traffic sources, and sync history.

## Collection Philosophy

Most social platforms have hostile or expensive APIs, so collection is agent-driven: the AI agent gathers data using the method configured per account — browsing with the user's own logged-in session, parsing analytics exports the user downloads, or an official API when a token is configured — then writes everything through `scripts/ingest_snapshot.mjs`. The app itself only renders local snapshot files and never touches any network beyond `127.0.0.1`. Own accounts only, no password storage, no fake engagement.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-social/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=timeline&lang=en#/timeline
/?demo=accounts&lang=en#/accounts
/?demo=detail&lang=en#/accounts/x-kelly
```

Demo mode never reads live platform data or local private snapshot files.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-social/config.json`, then put any API tokens in local env files only. Never commit real handles' tokens, exports, or files under `app/.data/`.
