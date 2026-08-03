# Busabase Setup And Product Onboarding

Use this reference when designing first-run setup, recovery, product onboarding,
reconfiguration, or the blocking readiness surface for an App-in-Skill.

## Contents

1. Two readiness dimensions
2. Stable state contract
3. Setup gate
4. Product onboarding
5. Reconfiguration and reset
6. Verification

## Two Readiness Dimensions

Keep infrastructure readiness and product onboarding separate:

- **Runtime readiness** proves the viewer is authenticated in the selected
  Busabase, the target Space is explicit, the app Folder/resources exist with
  compatible versions, and required Vault references are ready.
- **Product onboarding** records the operating context the workflow needs, such
  as operator profile, accounts, identities, brand/style, official links,
  knowledge sources, policies, thresholds, schedules, and approval rules.

An AirApp may be authenticated and fully materialized while still needing product
onboarding. Do not collapse both dimensions into one `connected` boolean. Do not
perform third-party reads or consequential actions that depend on missing product
context until the relevant onboarding requirements are complete.

Persist onboarding fields and completion/version state in the app's approved
Busabase Base/Doc resources. Never use `app/.data/onboarding.json`, local config,
browser storage, or Demo fixtures as the completion marker.

## Stable State Contract

Expose one sanitized state from the app's repository/service boundary. Adapt
labels to the domain while preserving these distinct conditions:

```json
{
  "readiness": {
    "runtime": "needs_connection|needs_auth|needs_space|needs_resources|migration_needed|missing_vault_refs|ready",
    "onboarding": "not_started|in_progress|needs_review|complete",
    "action": "connect|select_space|initialize|review_change_request|migrate|configure|retry|none",
    "change_request_id": null,
    "safe_context": {}
  }
}
```

Use one state and one next action. Do not return stale workflow rows, counts, or
cached decisions while runtime readiness is incomplete. Demo data appears only
in an explicitly labeled Demo mode and never makes readiness look successful.

Re-read Busabase after every provisioning, migration, configuration, or review
step. A submitted ChangeRequest is not proof that a resource or onboarding update
has materialized.

## Setup Gate

Render one blocking setup surface, not repeated warning cards across the app.
Treat it as onboarding, not an error page:

- identify the app and the one next action;
- show only sanitized server, Space, Folder/resource, schema, and Vault readiness;
- explain failures in operator language;
- keep normal workflow controls disabled until their prerequisites are ready;
- preserve an explicit read-only Demo entry when the app supports one.

In a Busabase-hosted AirApp, use the ambient viewer session and begin at Space,
resource, migration, Vault, or product-onboarding readiness. Never show local
OAuth merely because the hosted URL contains `localhost`, `127.0.0.1`, or
`.localhost`.

Only an explicitly requested standalone `local-preview` shows the Cloud/custom
server choice and one-click browser OAuth. Authentication success then advances
to the same Busabase readiness state machine; it does not mark onboarding
complete.

Keep the gate usable at desktop and phone widths. Use a bounded shell with fixed
header and footer, an internally scrollable body, and a viewport-capped height.
On phones, use the full-height panel defined by `mobile-shell-layout.md`.

When the app supports multiple UI languages, put the same `Auto`/language
selector used by Help & Settings on the setup gate. Language changes must update
the next action, checklist, errors, and onboarding fields immediately.

## Product Onboarding

Model only context the recurring operation actually consumes. Typical groups are:

- operator/profile and language preferences;
- accounts, identities, and routing metadata;
- brand, style, official links, and safe knowledge sources;
- risk policy, approval thresholds, schedules, and workflow defaults;
- named Vault requirements, represented as configured/missing without values.

Store structured values in focused Base records and longer policies or playbooks
in Doc. Link files and source material through Drive/File. Do not turn all
configuration into one opaque JSON field.

Show onboarding progress and let the operator save reviewable steps. Mark
onboarding complete only when required fields validate and the resulting
Busabase change has materialized. Record a configuration/onboarding version so a
later incompatible version can enter `needs_review` or `migration_needed`
instead of silently using stale rules.

## Reconfiguration And Reset

Provide a deliberate reconfigure path in Help & Settings when the domain needs
it. Reconfiguration may reopen onboarding, update non-secret Busabase records, or
submit a migration ChangeRequest. Keep existing records intact until the user
explicitly authorizes a destructive change.

Deleting Bases, Docs, Drive files, records, or Vault requirements is destructive.
Name the exact target, preserve or export recoverable data when practical, and
require explicit authorization. Disconnecting a local OAuth registration does
not delete Busabase application data.

## Verification

Verify all applicable paths:

- hosted AirApp begins without OAuth and uses ambient auth;
- explicit local preview connects through browser OAuth, then enters the same
  readiness states;
- missing or ambiguous Space never selects one silently;
- lazy initialization creates only the approved resource declaration and resumes
  after materialization;
- incomplete readiness suppresses stale/live-looking workflow data;
- product onboarding persists in Busabase and survives refresh/device changes;
- language changes update the complete gate;
- reconfiguration preserves data unless a named destructive action was approved;
- no secret value, OAuth token, or API key reaches browser-visible state.
