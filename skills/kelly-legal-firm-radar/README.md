# Legal Firm Radar

Uses anonymized internal casebase metadata to prepare management insights: practice mix, local court outcomes, lawyer capability profiles, quality indicators, and approved brand or staffing reports.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Legal Firm Radar overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Legal Firm Radar review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Firm radar command desk with partner review load, approved reports, blocked insights, and management activity.</td>
    <td><strong>Review queue</strong><br>Approval-gated management insights for practice mix, lawyer profiles, and brand proof points.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Legal Firm Radar checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.webp" alt="Legal Firm Radar workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Analytics QA for anonymization, sample size, attribution, bias caveats, and external-use restrictions.</td>
    <td><strong>Workbench</strong><br>Detail pane for practice analytics, talent signals, quality indicators, and approved management report text.</td>
  </tr>
</table>

## Local App

```bash
skills/kelly-legal-firm-radar/app/start.sh
```

Views: overview, review queue, workbench, checks, entities, and settings. The app reads/writes local handoff files only.

## Safety

- Do not rank lawyers or publish brand claims from small samples without caveats and partner approval.
- Use anonymized metadata for analytics; keep client names, raw documents, private financials, and privileged notes out of the dashboard.
- Treat talent, compensation, hiring, and external marketing claims as approval-required.
- If metrics are incomplete or biased, mark the insight as needing more data rather than overstating conclusions.
