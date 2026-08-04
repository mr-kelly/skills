# Kelly Radar

Kelly Radar is a Busabase App-in-Skill market-intelligence desk. One app merges competitor monitoring (Radar), agent-run deep research (Research), and demand signals (Trends) over a shared Busabase snapshot, watchlist, and review model.

## What It Shows

- Overview: what needs Kelly's attention (signals to triage, briefs to approve, reports to read, follow-ups running), watchlist freshness, top signals, top trend movers, and the research pipeline.
- Signals: the radar feed — pricing/changelog/launch/review/news/hiring changes per watch target, with severity, before→after diff highlights, evidence links, and Act / Watch / Ignore / Needs-info triage.
- Watchlist: monitored competitors, categories, keywords, and communities, with per-source method and last-check freshness.
- Research: questions moving through brief approval → researching → cited report → annotations, confidence ratings, and follow-up questions.
- Trends: rising keywords/topics with momentum sparklines and opportunity cards that hand off to kelly-writer (content briefs) or kelly-feedback (roadmap candidates).
- Help & Settings: sanitized config summary — watchlist, research defaults, trend sources.

## How It Flows

1. The agent collects (browser automation, web search, or manual payloads) and files everything through the trusted skill-root scripts `scripts/ingest_signals.mjs`, `scripts/ingest_trends.mjs`, and `scripts/file_report.mjs`, each writing to Busabase with its own credentials. The AirApp itself only reads and writes Busabase — it never touches the network beyond the configured Busabase Space.
2. Kelly triages signals, approves research briefs, rates report confidence, and approves opportunity cards in the app; verdicts write directly onto the item record through `busabase-sdk`.
3. `scripts/execute_decisions.mjs` (dry-run by default) prints the concrete handoff operation for every approved signal/brief/opportunity; the agent performs it, then `--apply` marks the approved signals/opportunities done.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Radar overview"></td>
    <td width="50%"><img src="assets/screenshots/research.webp" alt="Kelly Radar research desk"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Market-intelligence desk with signals to triage, watchlist freshness, top trend movers, and the research pipeline.</td>
    <td><strong>Research desk</strong><br>Research questions moving through brief approval, deep research, and cited report review.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/signals.webp" alt="Kelly Radar competitor signals"></td>
    <td width="50%"><img src="assets/screenshots/trends.webp" alt="Kelly Radar trends"></td>
  </tr>
  <tr>
    <td><strong>Signals</strong><br>Competitor pricing, changelog, launch, review, and hiring signals with severity badges and Act/Watch/Ignore triage.</td>
    <td><strong>Trends</strong><br>Rising keywords and community topics with momentum sparklines and opportunity cards for content or roadmap handoff.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/watchlist.webp" alt="Kelly Radar watchlist"></td>
  </tr>
  <tr>
    <td><strong>Watchlist</strong><br>Tracked competitors with pricing and positioning change signals, review status, and last-monitored timestamps.</td>
  </tr>
</table>

## Demo Mode

Run the app locally:

```bash
pnpm --dir skills/kelly-radar/app dev
```

Open the printed URL, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=signals&lang=en#/signals
/?demo=detail&lang=en#/signals/sig-formora-pricing
/?demo=research&lang=en#/research
/?demo=trends&lang=en#/trends
```

Demo mode never reads or writes Busabase; decisions are not persisted.

## Boundary

Collection and research are read-only over public pages and Kelly's own analytics — respect robots.txt and terms of service, throttle politely, and never scrape private or personal data. Handoffs and any outbound artifacts require Kelly's approval in the app first.
