# Busabase Data And Configuration Contract

Use this reference when deciding where configuration, state, secrets, documents,
files, locks, and workflow records live or when implementing `busabase-sdk` access.

## One Data Boundary

Use Busabase as the only persistent application backend. Local development,
deployed AirApp, Agent jobs, and maintenance scripts share one resource map and one
repository/service contract.

The only local bootstrap configuration values are:

- `BUSABASE_BASE_URL`;
- `BUSABASE_API_KEY` when the target requires authentication;
- `BUSABASE_SPACE_ID` for an explicit Cloud Space;
- an optional stable app-root node id/slug when discovery cannot be unambiguous.

Do not store operator profiles, policies, workflow settings, thresholds, account
metadata, review state, or domain data in env files or local JSON. The
owner-only OAuth registration described below is a connection credential, not
application configuration.

## OAuth Connection Bootstrap

Use browser OAuth only for an explicitly requested standalone `local-preview`.
A Busabase-hosted AirApp may itself use a `localhost`, `127.0.0.1`, or
`.localhost` host, so hostname alone must never select the OAuth gate. The local
setup UI offers the Cloud origin or one custom Busabase origin and starts OAuth
from a single button; it never asks the user to run a CLI login or paste an API
key. Before navigating the browser, let Hono probe the authorization request
without following redirects and return an actionable compatibility error when
the selected server does not yet support the local-app OAuth client.

The trusted Hono boundary owns PKCE state/verifier and the callback. After code
exchange it uses `busabase-sdk/oauth` for the isomorphic protocol helpers and
registers the rotating token set through `busabase-sdk/oauth-node` at
`~/.busabase/airapps/<app-id>.json`. Do not import OAuth from the main
`busabase-sdk` data-client entry. The `airapps` directory is owner-only
(`0700`) and each credential file is `0600`; this registration must not overwrite
the CLI's active `~/.busabase/.env` profile. Browser JavaScript, localStorage,
sessionStorage, IndexedDB, cookies, committed files, logs, and screenshots
receive none of the access token, refresh token, verifier, or Vault value. The
Hono proxy loads and refreshes the credential server-side and injects the access
token only into the upstream `/api/v1` request.

Treat the local OAuth registration as identity bootstrap, not domain data or an
application-declared `vault_requirement`. Ordinary Vault requirements still
describe third-party/runtime secrets by reference. A deployed AirApp skips this
local OAuth layer entirely, constructs `busabase-sdk` against
`window.location.origin` without a credential, and lets Busabase authenticate
`/api/v1` with the viewer's same-origin ambient session.

## Space Selection After OAuth

Authentication answers who the operator is; it does not choose where app data
belongs. Immediately after local OAuth, call `GET /api/v1/auth` with the access
token and without `x-busabase-space`. Use its `spaces` list as the only selector
source:

- zero Spaces is a readiness error;
- one Space is selected automatically;
- multiple Spaces require a native selector and explicit confirmation;
- open-source Busabase returns the single `local` Space, so no selector appears.

Do not probe the app Folder, resolve stable node ids, submit initialization, or
repair schema until selection completes. Validate the submitted Space id against
a fresh auth response before accepting it, then attach it as
`x-busabase-space` to every proxied SDK request. Store only this safe id as local
connection bootstrap (for example an HttpOnly same-origin cookie or an
owner-only app registration field); never put OAuth tokens in browser storage.
Clear the selection when the server target changes, OAuth is revoked, or the
selected Space is no longer accessible.

The canonical resource map must be portable between Spaces. Treat committed
node/base ids as optional acceleration for the Space where they were resolved:
on `NOT_FOUND`, fall back to the declared app-root slug and ownership metadata,
then discover or lazily provision resources in the selected Space. Never reuse
an id from one Space as proof of readiness in another.

A deployed AirApp does not show a selector: its ambient Busabase host already
supplies the current Space. It may display that safe Space identity, but must not
override it with a committed Cloud Space id.

## Choose Nodes By Capability

### Folder And Node Tree

Use the app Folder as the ownership and discovery root. Resolve child resources
through the Node tree and validate expected type, parent, stable slug/id, and
schema version before use. Do not scatter unrelated global slug lookups.

### Base

Use Base for structured, filterable, relational, and reviewable information:

- app settings and policies;
- user/operator preferences that should follow the user;
- reports, plan items, claims, reviews, retrospectives, and audit-friendly state;
- domain records and relations;
- source freshness, coverage, errors, and schema versions.

Prefer multiple focused Bases and relations over opaque JSON columns. Use native
Views when they already provide the required table, gallery, kanban, calendar, or
gantt workflow.

### Vault

Use Vault for API keys, tokens, passwords, and other secrets. Store only Vault
reference names in normal records. The browser may receive configured/missing
readiness and a safe reference label, never the value.

Resolve Vault values only in trusted server, Agent, Workflow, or AirApp execution
contexts authorized for that secret. Do not log values or include them in errors.

Local AirApp OAuth tokens use the owner-only `~/.busabase/airapps` registration
above; do not create a normal user-visible Vault item for them. Vault remains the
correct boundary for application and third-party runtime secrets.

### Doc

Use Doc for long-form, human-editable content such as playbooks, research
templates, narrative policies, operating instructions, and reusable prompts.
Store structured status and relations in Base; link to the Doc node.

### Drive And File

Use Drive/File for imports, exports, attachments, source documents, generated
reports, and other file-shaped artifacts. Keep searchable metadata, workflow
status, provenance, and relations in Base.

### Skill And AirApp

Use Skill nodes for executable/instructional skill material when the Busabase
workflow requires it. Treat AirApp as a deployed artifact built from the local
skill's canonical `app/` source, not a separate authoring location.

## Resource Map

Before implementation, record a table like:

| Resource | Node type | Stable id/slug | Purpose | Readers | Writers | Mutation path | Version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App root | Folder | ... | ownership/discovery | all | reviewed setup | ChangeRequest | 1 |
| Settings | Base | ... | non-secret config | app/jobs | reviewed UI/Agent | records/CR | 1 |
| Secrets | Vault refs | ... | connector secrets | trusted jobs | operator | Vault | 1 |

Validate the map on startup. Mark the app not ready when a required node is
missing, has the wrong type/parent, is inaccessible, or needs migration.

Give each resource contract a stable schema identity, version, and deterministic
fingerprint or equivalent compatibility marker. Apply only declared forward
migrations through the reviewed Busabase mutation path. When an existing schema
is newer, incompatible, or ambiguously owned, enter `migration_needed` and stop
instead of rewriting it or attaching by slug.

## SDK Boundary

Create one thin Busabase repository/service layer over `busabase-sdk`:

- centralize client construction and connection resolution;
- accept target Space and app root explicitly;
- return domain-oriented results rather than leaking raw transport responses
  throughout Hono routes;
- keep reads side-effect free;
- make writes explicit, idempotent, and reviewable;
- map SDK errors into sanitized readiness or operation errors;
- expose source node ids and versions for traceability.

Hono routes, scripts, and Agent jobs call the same service functions. Browser code
calls Hono/AirApp endpoints and receives only sanitized data.

## Configuration And Preferences

Separate configuration by behavior:

- code constants: protocol versions, fixed safe defaults, UI labels;
- connection bootstrap: standard Busabase env variables;
- application configuration: Base/Doc records under the app root;
- user preferences: a user-scoped Base record when persistence matters;
- secrets: Vault references and trusted resolution;
- runtime observations: Base rows with timestamps and provenance.

Do not silently fall back to bundled demo config when production configuration is
missing. Show readiness and recovery instead.

### Operating Context

Model only configuration that the recurring operation consumes. Depending on the
domain, this may include operator/profile, accounts and identities, brand/style,
official links, knowledge sources, risk policy, thresholds, schedules, and
approval rules.

Store structured, filterable context in focused Base records; store longer
policies, playbooks, and instructions in Doc; link source files through
Drive/File; represent secrets only as Vault requirements. Help & Settings may
show sanitized summaries and configured/missing readiness, never raw private
documents or secret values. Product onboarding and versioning for this context
follow `setup-onboarding.md`.

## Onboarding And Recovery

The local Hono app must remain startable when `local-preview` is explicitly
requested. Both local preview and hosted AirApp use the state model in
`setup-onboarding.md` to distinguish connection/authentication where applicable,
Space selection, app-root discovery, resource provisioning, schema migration,
Vault readiness, and product onboarding. Keep that order: no app-root read or
mutation happens before Space selection.

Use reviewed ChangeRequests to create or repair canonical resources. After each
step, re-read through `busabase-sdk`; never mark setup complete based only on a
submitted mutation.

When the technical blueprint opts into lazy provisioning, keep the full approved
Folder/Base/field declaration in code and offer one initialization action after
authentication. The Busabase repository submits that declaration in one
idempotent structure ChangeRequest, re-reads the dedicated app Folder, validates
its ownership/schema markers, and uses the returned ids in memory. Never ask the
operator to create Nodes/Bases or paste ids. Never reuse an unmarked same-slug
resource; report a collision without modifying it. If auto-merge is unavailable,
surface the single pending CR id and resume automatically after approval.

Help & Settings may show safe values such as server host, Space id/name, app Folder,
Base/Doc/Drive ids and slugs, schema versions, sync version, and Vault readiness.

## Claims, Locks, And Concurrency

Do not use a local lock file as the canonical concurrency guard. Use Busabase
records, versions, atomic claim behavior, ChangeRequest lifecycle, or another
server-enforced mechanism appropriate to the resource.

Record claimant/run identity, claimed time, attempt, heartbeat when needed, and
terminal result. Re-read eligibility immediately before consequential execution.
Retries must not duplicate records, files, messages, publishing, or money movement.

## Demo And Test Data

Use a dedicated local Busabase instance or test/demo Space with deterministic seed
records. Seed through the same repository and schemas used by production. Do not
create a local-file provider just for screenshots.

Purely presentational browser fixtures are acceptable for isolated visual tests,
but they must be explicitly marked demo-only, contain no configuration, and never
exercise or imply successful persistence.

## Validation

Verify:

- ambiguous or missing Space/app-root handling;
- OAuth responses with zero, one, and multiple Spaces, including explicit
  selection validation and open-source `local` auto-selection;
- absence of resource reads and writes before a multi-Space choice;
- wrong node type, parent, version, and permissions;
- missing Vault refs without value disclosure;
- partial reads and stale data;
- concurrent claims and retries;
- ChangeRequest review/merge behavior;
- local Hono and AirApp parity against the same resource map;
- zero persistent workflow/config writes outside Busabase.
