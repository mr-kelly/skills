# Kelly Education Intel

Kelly Education Intel is a Busabase App-in-Skill cockpit for turning exam, admissions, policy, and parent-question movement into enrollment and parent-service decisions. It is built for education center owners, admissions consultants, tutoring operators, and course marketers.

## What It Shows

- Overview: the enrollment or parent-service trigger worth acting on today, top source-backed signals, ready actions, blocked claims, and source freshness.
- Signals: exam, admissions, visa, scholarship, school-calendar, competitor, and parent-question movement with evidence links, buyer-intent interpretation, confidence, and risk badges.
- Actions: approved, watch-only, or blocked parent FAQ updates, course launch angles, webinar topics, and advisor scripts tied to a specific trigger.
- Drafts: editable parent WhatsApp, WeChat post, and course pitch drafts that stay behind a review gate until approved.
- Sources: monitored education-bureau/exam-board/competitor/trend source categories, freshness, missing coverage, and config readiness.

## How It Flows

1. The agent browses current public sources and writes only business-relevant movement directly into Busabase as signal/action/draft/source records.
2. The app lets Kelly review signals, approve or block actions, and request changes to drafts — every decision writes straight onto the item's own Busabase record.
3. `scripts/execute_decisions.mjs` dry-runs approved handoffs, then marks approved items done with `--apply` after the agent performs the real handoff outside the script.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Education Intel overview"></td>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Education Intel signals"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Education-intelligence desk with enrollment triggers, ready actions, blocked claims, and source freshness.</td>
    <td><strong>Signals</strong><br>Exam, admissions, visa, school-calendar, and parent-question movement interpreted as purchase anxiety.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/actions.webp" alt="Kelly Education Intel actions"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Education Intel drafts"></td>
  </tr>
  <tr>
    <td><strong>Actions</strong><br>Parent FAQ, webinar, advisor, and course-launch actions with approval status.</td>
    <td><strong>Drafts</strong><br>Editable parent memos and enrollment copy held behind the review gate.</td>
  </tr>
</table>

## Demo Mode

```bash
pnpm --dir skills/kelly-education-intel/app dev
```

Open the printed URL and use `?demo=overview&lang=en#/overview`, `?demo=signals&lang=en#/signals`, `?demo=actions&lang=en#/actions`, or `?demo=drafts&lang=en#/drafts`.

## Boundary

The AirApp reads and writes its own Busabase Bases only. It may prepare evidence-backed drafts and review decisions, but it never publishes, sends messages, mutates CRMs, spends money, or stores private customer data without explicit approval. The skill blocks admission guarantees, grade promises, immigration/legal advice, and claims about schools or credentials that lack a source.
