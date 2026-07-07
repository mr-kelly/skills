# Kelly CLM Notes

Use this reference when changing `kelly-clm`.

## Scope

`kelly-clm` is intentionally light. It is a local contract operations tracker:

- contract repository
- lifecycle stage
- owner assignment
- renewal and notice dates
- obligations and milestones
- simple approval/reminder queue
- local handoff records

Do not turn it into a legal redline or clause-playbook product. Use `kelly-legal-contracts` for detailed legal review.

## Product Research Signals

Mainstream CLM products converge on a few stable patterns:

- **Ironclad**: request-to-contract workflows, approvals, execution, repository, and insights. Sources: <https://ironcladapp.com/> and <https://ironcladapp.com/journal/contract-management/contract-lifecycle-management>.
- **Icertis**: contract intelligence, obligation tracking, risk metadata, and business-system connections. Sources: <https://www.icertis.com/> and <https://www.icertis.com/products/platform/>.
- **Agiloft**: configurable CLM workflows, obligation management, milestones, renewals, and no-code process control. Sources: <https://www.agiloft.com/introduction-contract-lifecycle-management/> and <https://www.agiloft.com/best-practices-for-contract-lifecycle-management-clm/>.
- **DocuSign CLM**: workflow automation, document generation, repository, and e-signature adjacency. Sources: <https://www.docusign.com/products/clm> and <https://www.docusign.com/resources/solution-briefs/docusign-clm-datasheet>.

## Implementation Rule

Keep the app safer and simpler than SaaS CLM:

- The browser UI may write local decisions and handoff records.
- The browser UI must not update remote systems, initiate signature, contact counterparties, or mark a legal approval as complete outside the local handoff.
- Demo screenshots must not contain private counterparties, prices, or contract text.
