# Kelly Feedback

Kelly Feedback is a Busabase-backed App-in-Skill voice-of-customer desk. It
aggregates raw user feedback from every channel — support email, Discord,
Slack, X replies, app-store reviews, in-app surveys, interviews — lets the
agent cluster it into feature requests with frequency and user weight, and
gives Kelly a roadmap decision queue.

## What It Shows

- **Overview**: what needs a decision, feedback inflow this week by channel, sentiment split, top clusters by momentum, and source freshness.
- **Inbox**: the raw feedback stream with channel badges, sentiment, and triage state; detail pages carry full text, user context, and triage actions that write straight to Busabase.
- **Requests**: clustered feature requests with frequency, weighted score (frequency × user revenue weight, always recomputed client-side), trend, and status; detail pages carry the agent-drafted problem statement, spec summary, representative quotes, and decision history.
- **Roadmap**: the decision queue — agent-proposed changes (promote to Now/Next/Later, decline with a drafted reply, merge duplicates) with reason, evidence, editable drafts, review notes, and Approve / Request changes / Block buttons that write directly to Busabase — plus the current roadmap lanes read-only.
- **Help & Settings**: sanitized config summary (products, sources, scoring weights, env readiness) and the sync log.
- The AirApp never calls a feedback platform, posts a reply, or publishes a changelog. Every outbound action is approval-required and executed by the agent via other skills, only after the matching proposal is approved.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Feedback overview"></td>
    <td width="50%"><img src="assets/screenshots/inbox.webp" alt="Kelly Feedback inbox"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Voice-of-customer desk with weekly inflow by channel, sentiment split, top clusters, and source freshness.</td>
    <td><strong>Inbox</strong><br>Raw feedback stream across email, Discord, Slack, X, and app-store reviews with triage controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/requests.webp" alt="Kelly Feedback requests"></td>
    <td width="50%"><img src="assets/screenshots/roadmap.webp" alt="Kelly Feedback roadmap decisions"></td>
  </tr>
  <tr>
    <td><strong>Requests</strong><br>Clustered feature requests with frequency, weighted scores, trend, and representative quotes.</td>
    <td><strong>Roadmap decisions</strong><br>Agent-proposed promote/decline/merge proposals with drafted changelog notes and user replies for approval.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir app install
pnpm --dir app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock desk (PulseBoard/Formora, invented SaaS
products) without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=inbox&lang=en#/inbox
/?demo=requests&lang=en#/requests
/?demo=roadmap&lang=en#/roadmap
/?demo=detail&lang=en#/requests/req-csv-export
```

Demo mode never reads or writes Busabase; demo decisions are in-memory only.

## How Feedback Flows In

Kelly Feedback sits downstream of the other kelly skills. kelly-email
(support threads), kelly-messenger (Discord/Slack posts), and kelly-social
(X replies) hand payload JSON files to the single write path:

```bash
node skills/kelly-feedback/scripts/ingest_feedback.mjs payload.json --apply
```

The agent then clusters new items (`scripts/apply_clusters.mjs --apply`),
drafts roadmap proposals directly into Busabase, and — only after Kelly
approves in the app — executes decisions
(`scripts/execute_decisions.mjs --apply`, dry-run by default). Outbound
replies and changelog posts are handed back to the messaging/email skills;
the app and the execute script never touch remote systems themselves.

## Data

All state — products, sources, feedback, clustered requests, roadmap lanes,
proposals, the sync log, and scoring config — lives in eight Busabase Bases
under one application Folder. See `SKILL.md` and
`references/feedback-schema.md` for the resource map. Request
`frequency`/`weighted_score` and every snapshot metric are computed
client-side on every read, never stored. The three trusted scripts
(`scripts/ingest_feedback.mjs`, `scripts/apply_clusters.mjs`,
`scripts/execute_decisions.mjs`) connect with their own credentials
(`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`);
`execute_decisions.mjs` performs no external send itself even with
`--apply` — outbound operations are always left `handoff_ready` for the
agent.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
