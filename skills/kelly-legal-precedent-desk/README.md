# Legal Precedent Desk

Finds and packages internal precedents for a new legal question: similar facts, local court tendencies, decisive evidence, holdings, citations, and a reviewer-approved research memo.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.png" alt="Legal Precedent Desk overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.png" alt="Legal Precedent Desk review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Precedent command desk with packs awaiting review, high-match cases, approved packs, and recent activity.</td>
    <td><strong>Review queue</strong><br>Similar-case packs with local court-pattern notes, citations, evidence, and approval controls.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.png" alt="Legal Precedent Desk checks"></td>
    <td width="50%"><img src="assets/screenshots/workbench.png" alt="Legal Precedent Desk workbench"></td>
  </tr>
  <tr>
    <td><strong>Checks</strong><br>Quality checks for citation traceability, similarity rationale, jurisdiction fit, and confidentiality limits.</td>
    <td><strong>Workbench</strong><br>Detail view for precedent reasoning, decisive facts, internal citations, draft memo, and review note.</td>
  </tr>
</table>

## Local App

```bash
skills/kelly-legal-precedent-desk/app/start.sh
```

Views: overview, review queue, workbench, checks, entities, and settings. The app reads/writes local handoff files only.

## Safety

- Do not present internal precedent findings as final legal advice or guaranteed outcomes.
- Keep client names and privileged strategy out of exported packs unless expressly approved.
- Every quoted snippet must trace to an approved case record and respect the configured quote policy.
- If the internal casebase does not contain enough similar cases, say so and route to external legal research instead of inventing support.
