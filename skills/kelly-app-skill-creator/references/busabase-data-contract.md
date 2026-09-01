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

#### The same route means different things per deployment

`/api/v1/vault` is not one API. A self-hosted instance serves a single flat
per-user set and returns real values. Cloud's Vault is account-level and scoped
per personal / Space / API key; it serves the same route with **every secret
masked to `""`** — existence, scope, and access policy, never a value — and
serves values at `/api/v1/vault/runtime`, bounded to items marked
`access.runtime`.

**Probe which routes answer. Never infer the deployment from the base URL**, and
never conclude from one 404 that a capability does not exist. A trusted script
resolving credentials should fall through:

1. the process environment — correct everywhere, and the only channel when a
   runtime injected them at task start;
2. the Vault list — fills in non-secret `variable` items;
3. the runtime route — where a secret's value actually comes from on Cloud.

An absent route is a fact about this endpoint, not about the user's account. A
skill that reported "this Busabase has no Vault" while the operator was looking
at their configured Vault cost an hour and shipped a wrong sentence to a user.

#### A full-document PUT is not an upsert

Writing only your own keys deletes every other item in the scope. Always read
the current set, merge by key, write the whole set back — and when you do:

- **Keep server-owned fields, especially `id`.** They look like disposable
  bookkeeping and they are not. Cloud reads a blank secret as "keep the stored
  value", matched by id, and reads mask every secret to blank. Strip the ids and
  the first write blanks every secret in the scope that this script did not set
  itself. This is a silent, total loss of credentials the app never knew about.
- **Write back only the scope you own.** A read may span scopes; a write targets
  exactly one, derived from the items. Echoing back items from another scope is
  either refused as a mixed batch or relocates them.

Both rules only bite on a scoped deployment, which means they pass every local
test and fail the first time a real user runs it against Cloud.

#### Report readiness per key, and never print a value

"未配置" collapses four different causes into one unactionable word. Report each
required key as ready or missing **with where it resolved from**, so "缺
SMTP_PASS" and "什么都没配" get different answers.

Print no value and **no mask** — a mask still leaks length, and this output ends
up in whatever log or transcript captured the run. Existence and source are the
answerable questions.

Derive what is derivable and require only what is not. A password cannot be
guessed; a well-known provider's host and port can. Deriving the mechanical
three-quarters of a config turns "fill in four things" into "paste one secret",
and an explicitly configured value must always beat a derived one.

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

## Reading Records At Scale: List, Page, Count

Never call `records.list` in a loop to load an entire Base. One `records.list`
call fetches one page; a capped loop (however high the cap) still hides a
multi-page scan behind a single loading state instead of fetching a page per
user action — the cap only bounds how bad that gets, it doesn't fix the shape.
`busabase-sdk/airapp-check` (wired into every app's `check.mjs`) statically
catches this as `airapp/eager-multi-page`/`airapp/unbounded-read`; do not
special-case around the rule, fix the reading shape.

**UI convention: choose "load more" or a numbered pager by layout — both are
compliant with "one page per user action"; the difference is purely
interaction design, not a rule to apply uniformly:**

- **Load more (cumulative append).** A button appends the next page to what's
  already showing. Fits a persistent list+detail split (a list panel and a
  detail panel visible at the same time) — paging away by *replacing* the
  list would silently orphan whatever the open detail pane is showing, and a
  numbered pager crammed into a narrow side-list column has little room to
  earn its keep. The browsing model here is continuous scanning, not jumping
  to a numbered page.
- **Numbered pager (Prev / 1 2 3 … / Next).** Each page click *replaces* the
  displayed rows with exactly that page — never append — so search, the row
  table, and any page-derived figure stay scoped to one page's worth of data.
  Fits a screen where the list *is* the whole view and selecting a row
  navigates away to a separate detail screen or route (nothing next to the
  list to orphan) — `kelly-crm`'s Contacts/Deals pages (this repo, PR #131)
  are the reference: clicking a row replaces the *entire* content area with
  a detail view, it doesn't open a side panel next to the list.
- Don't default to one out of habit. Look at the actual screen being built —
  is there a detail pane staying open next to the list, or does the list own
  the whole screen and hand off to a separate view? — and pick accordingly.

Both need the same forward-cursor handling regardless of which UI wins:
`records.list` only exposes a forward keyset cursor
(`{baseId, limit, cursor}` → `{records, nextCursor}`), never an offset/skip.
For a numbered pager, there is no way to fetch "page 5" directly — cache
every cursor learned as pages are visited (an array where index `i` holds
the cursor needed to fetch page `i + 1`, `cursors[0]` always `undefined`),
walk forward through intermediate pages once to learn each one's `nextCursor`
when reaching an unvisited page, then fetch the target page for real. Every
page, once visited this way, is a single direct fetch on every later visit —
including going backward. This cost is paid at most once per page per
session, not per visit. For load-more, just keep the single latest
`nextCursor` and append — there's no random access to cache for.

Use `records.count({baseId})` for "how many rows exist" — it is a real, exact
SQL count, never `rows.length` from whatever page happens to be loaded. It
also accepts `filters` (the same shape `records.list` takes), pushed down to
SQL, so a scoped count (e.g. "how many are open") is exactly as cheap and
exact as the unfiltered total — use it instead of filtering a loaded page and
counting what survives, which is only correct while that page happens to
contain every matching row.

**Per-row normalization must be one named function per record shape, applied
identically to every page fetched — first or Nth.** Field coercion (a
JSON-string-encoded array field parsed into a real array, numeric coercion,
defaulting) belongs in a function like `normalizeContactRow(row)`, called by
both the initial load and every subsequent page fetch. A second, inline copy
of the same logic for "page 1 only" silently diverges the moment either one
changes, and the failure mode is not a type error at write time — it is a
render crash on whichever row is unlucky enough to land past the first page
(reproduced for real: `tags` arrived as the string `"[]"` instead of `[]` for
every row fetched after page 1, until the same normalizer ran on it too).

**Sums and grouped aggregates have no cheap exact answer once data exceeds one
page.** `records.count`'s exactness covers counts (including filtered
counts); it has no sum-by-field or group-by equivalent. Don't loop
`records.list` just to compute an exact sum — that reintroduces the same
anti-pattern this section opens with. Instead, compute such aggregates from
whichever page is currently loaded, keep every on-screen presentation of that
number derived the same way (so a metric card and a chart below it never
silently disagree), and don't present the result as a global total it isn't.

Reference implementation: `kelly-crm`'s Contacts/Deals pager
(`app/js/providers/busabase-provider.js`'s `readPage` / `countRecords` /
`fetchPage`, `app/app.js`'s `goToPage` / `pagerControl`) in `mr-kelly/skills`
PR #131.

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

When the technical blueprint opts into lazy provisioning, use `busabase-sdk/airapp`'s
`inspectProvisionedResources()` / `provisionDeclaredResources()` for this — do not
hand-roll the ownership/legacy-claim/idempotent-submission logic per app. It was
duplicated across every App-in-Skill (280-354 lines each, byte-identical within two
variants) before the SDK carried it. Keep the full approved Folder/Base/field
declaration in code (`AirAppResourceConfig`) and offer one initialization action
after authentication, wired to `provisionDeclaredResources()`. The SDK submits that
declaration in one idempotent structure ChangeRequest, re-reads the dedicated app
Folder, validates its ownership/schema markers, and returns the resolved ids. Never
ask the operator to create Nodes/Bases or paste ids. Never reuse an unmarked
same-slug resource; the SDK reports a collision (`SETUP_CONFLICT`) without
modifying it. If auto-merge is unavailable, it surfaces the single pending CR id
as `SETUP_PENDING`; resume automatically after approval. An app that ships its own
AirApp node inside the Folder declares it via `config.airApp` so it is recognized
and stamped rather than read as an unattributable stranger. An app that needs to
add fields to a Base it already owns gets that for free too — a live Base whose
fields are a prefix of the declaration is treated as an older schema and the
missing suffix is appended, one approval-gated `bases.fieldChangeRequest` per
field.

Pair this with `busabase-sdk/airapp-gate`'s `createAirAppConnectGate()` for the
connect/Space-selection/workspace-initialization screens — either its default
renderer (themed via `--bb-gate-*` custom properties) or, for a branded UI, its
headless `selectAirAppGateScreen()` / `describeAirAppSetupError()` underneath a
custom renderer. Both paths share the same state machine; only the pixels differ.

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
