# Kelly Email

Busabase AirApp-first inbox-zero workflow with human approval.

Kelly Email scans configured IMAP mailboxes from the trusted skill process, writes structured review rows to Busabase, and presents the approval queue in its AirApp. The AirApp never accesses mailbox credentials or performs mailbox side effects.

## Storage

- Email Reviews Base: review items, drafts, decisions, execution outcomes.
- Email Contacts Base: derived contacts.
- Email Settings Base: non-secret account config, Vault references, lock, scan state.
- Email Files Drive: HTML and attachment artifacts.
- Busabase Vault namespace `kelly-email`: IMAP/SMTP secret values.

The canonical resource IDs are in `app/resource-map.json`. Missing declared resources are provisioned lazily with ownership checks; users do not create nodes or copy IDs manually.

When an explicitly requested `pnpm dev` preview runs on loopback, it connects with browser OAuth and then asks the operator to choose among accessible Busabase Spaces. A single Space, including open-source `local`, is selected automatically. Resource discovery and initialization begin only after this step. Deployed AirApp uses the ambient current Space and shows no OAuth selector.

## Workflow

1. Ask `$kelly-email` to propose the next bounded email batch.
2. Approve the batch scope before any live mailbox read.
3. The skill scans and classifies mail into Busabase review rows.
4. Review decisions in the Kelly Email AirApp.
5. Ask `$kelly-email` to execute the approved decisions.

AirApp decisions are reviewable Busabase ChangeRequests. The app does not approve or merge them. The trusted skill executes only materialized explicit decisions and writes an execution report.

## Configuration

Use `config.example.json` as the payload template for the `kelly-email-config` record in Email Settings. Store Vault reference names in the payload and actual secret values only in Busabase Vault.

The screenshots under `assets/screenshots/` document the list/detail approval UI and its responsive behavior.
