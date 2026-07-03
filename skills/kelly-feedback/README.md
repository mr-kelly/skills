# Kelly Feedback

Kelly Feedback is a local App-in-Skill voice-of-customer desk. It aggregates raw user feedback from every channel — support email, Discord, Slack, X replies, app-store reviews, in-app surveys, interviews — lets the agent cluster it into feature requests with frequency and user weight, and gives Kelly a roadmap decision queue.

## What It Shows

- Overview: what needs a decision, feedback inflow this week by channel, sentiment split, top clusters by momentum, and source freshness.
- Inbox: the raw feedback stream with channel badges, sentiment, and triage state; detail pages carry full text, user context, and triage actions.
- Requests: clustered feature requests with frequency, weighted score (frequency × user revenue weight), trend, and status; detail pages carry the agent-drafted problem statement, spec summary, representative quotes, and decision history.
- Roadmap: the decision queue — agent-proposed changes (promote to Now/Next/Later, decline with a drafted reply, merge duplicates) with reason, evidence, editable drafts, review notes, and Approve / Request changes / Block buttons — plus the current roadmap lanes read-only.
- Help & Settings: sanitized config summary (products, sources, scoring weights, env readiness) and the sync log.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-feedback/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=inbox&lang=en#/inbox
/?demo=requests&lang=en#/requests
/?demo=roadmap&lang=en#/roadmap
/?demo=detail&lang=en#/requests/req-csv-export
```

Demo mode never reads or writes local snapshot files; demo decisions are in-memory only.

## How Feedback Flows In

Kelly Feedback sits downstream of the other kelly skills. kelly-email (support threads), kelly-messenger (Discord/Slack posts), and kelly-social (X replies) hand payload JSON files to the single write path:

```bash
node skills/kelly-feedback/scripts/ingest_feedback.mjs payload.json
```

The agent then clusters new items (`scripts/apply_clusters.mjs`), drafts roadmap proposals, and — only after Kelly approves in the app — executes decisions (`scripts/execute_decisions.mjs`, dry-run by default). Outbound replies and changelog posts are handed back to the messaging/email skills; the app itself never touches remote systems.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-feedback/config.json` (products, sources, scoring weights), and put tokens in local env files only. Never commit real tokens, user feedback exports, or files under `app/.data/`.

## Boundary

Aggregation is local and covers Kelly's own products and channels only. Any outbound action — replying to users, publishing a changelog note, editing a public roadmap — requires an approved proposal in the decision queue and is executed by the agent via other skills, never by this app.
