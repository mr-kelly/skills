# Inbox Accounts

Use this reference when support work spans more than one email account, alias, shared inbox, product, or brand.

## Core Model

Use two layers:

- `mailboxes`: real inboxes/accounts the email tool can search.
- `identities`: customer-facing send-as addresses, display names, brands, signatures, and reply rules.

One mailbox can own many identities. For example, one real Google Workspace or Spark account might receive and send as several addresses such as product aliases, founder aliases, or regional identities.

## Account Inventory Template

Keep actual credentials out of this file. Store only routing metadata that helps an agent search and triage.

```text
account_id:
display_name:
primary_email:
mailbox_provider:
search_names:
brand_or_product:
support_folders_or_labels:
default_language:
customer_types:
priority_senders_or_domains:
ignore_senders_or_domains:
send_identities:
escalation_owner:
notes:
```

## Identity Template

```text
identity_id:
mailbox_id:
send_as_email:
display_name:
brand_or_product:
default_language:
signature:
use_when:
avoid_when:
reply_to:
notes:
```

## Multi-Account Search

When the user says "all inboxes", search every available account unless they narrow the scope.

Even for "all inboxes", propose a bounded batch plan and wait for explicit approval before searching or reading live mail.

When `process_until_account_done` is enabled, keep each read/triage pass bounded by `max_threads`, then present results before continuing to the next pass. "Until account done" means no more in-scope threads remain; it does not grant permission to send, archive, label, delete, or mutate mailbox state.

Preserve account provenance in every summary and draft. If two accounts contain related threads from the same person or domain, merge the context in analysis but keep the recommended action tied to the account that received the latest customer message.

If search tools cannot enumerate accounts automatically, ask the user for account names or aliases. Do not guess private email addresses.

## Identity Selection

Choose the outbound identity in this order:

1. Use the exact address the customer wrote to, when that address is configured as an identity.
2. If the customer wrote to a catch-all, group alias, or forwarded address, use the identity whose `use_when` rules match the product, domain, or thread history.
3. Continue an existing thread with the same identity used earlier in that thread unless the user asks to change it.
4. If two identities both match, draft the reply and ask which identity to use before sending.

When presenting drafts, include `reply_as` so the user can review the identity:

```text
reply_as: Support <support@example.com>
```

## Routing Defaults

- Personal or founder inbox: prioritize real customers, partners, billing, VIPs, and messages addressed directly to the user.
- Support inbox: prioritize unresolved customer questions, bug reports, cancellations, and angry follow-ups.
- Sales or partnerships inbox: separate sales qualification from support resolution; do not promise technical fixes just to close a sale.
- Automated/system inbox: summarize only important failures, billing alerts, account access issues, or messages requiring human action.

## Safe Storage

It is okay to store non-secret routing rules here. Do not store passwords, app passwords, OAuth tokens, recovery codes, private API keys, session cookies, full customer exports, or large attachment contents.

Use `.agents/skills/kelly-email/config.local.yml` for the user's private account/identity inventory. It is ignored by git. Start from `.agents/skills/kelly-email/config.example.yml`.
