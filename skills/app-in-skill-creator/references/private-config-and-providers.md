# Private Config And Providers

Use this reference when an App-in-Skill connects to user accounts, APIs, mailboxes, calendars, CRMs, billing systems, content stores, databases, or any personal/business data source.

## Principle

Keep the skill code and committed templates generic. User-specific accounts, aliases, operator profile, brands/products, style, knowledge sources, policy, endpoints, and risk keywords belong in private config.

Secrets never go in JSON, chat, screenshots, logs, batch files, or `/api/state`. JSON should reference secret identifiers only: local provider configs usually use env var names such as `password_env`, `api_key_env`, or `token_env`; Busabase provider configs should use Vault references such as `vault_ref`, `password_vault_ref`, or `secret_ref`.

## Config Priority

Recommended config priority:

1. `<SKILL_ENV_PREFIX>_CONFIG=/absolute/path/to/config.json`
2. `skill-name/config.local.json`
3. `~/.config/skill-name/config.json`
4. `skill-name/config.example.json`

Recommended env priority:

1. Existing system environment variables
2. `<SKILL_ENV_PREFIX>_ENV_FILE=/absolute/path/to/.env`
3. Repository root `.env`
4. `skill-name/.env.local`
5. `~/.config/skill-name/.env`

Templates are examples only. Never treat `config.example.json` as a live configuration, and never mark onboarding complete on its behalf.

## Useful Config Blocks

Store non-secret settings in JSON by default:

- accounts,
- aliases,
- outbound identities,
- default folders,
- UI preferences,
- user role/profile,
- brand or product profiles,
- official URLs,
- safe knowledge-base sources,
- tone/style,
- CTA URLs,
- approval policies,
- risk keywords,
- routing rules.

For agent-assisted reply, support, review, or outreach workflows, private config is the skill's operating context, not just credentials. Useful blocks include:

- `user_profile`: operator role, public contact methods, language preferences.
- `brands`: product positioning and brand-specific URLs.
- `official_urls`: canonical homepage, docs, support, pricing, calendar, or CTA links.
- `knowledge_base`: public URLs, safe local reference files, short facts, and "do not say" rules.
- `style`: tone, length, paragraph style, quote behavior, signature behavior, CTA rules.
- `risk_policy`: categories and keywords that require review or block defaults.

Example:

```json
{
  "accounts": [
    {
      "account_id": "main",
      "display_name": "Main Account",
      "provider": "imap",
      "aliases": ["support@example.com", "founder@example.com"],
      "credentials": {
        "password_env": "SKILL_PASSWORD_MAIN"
      }
    }
  ],
  "identities": [
    {
      "identity_id": "support",
      "account_id": "main",
      "send_as": "support@example.com",
      "use_when": {
        "recipient_addresses": ["support@example.com"]
      }
    }
  ],
  "style": {
    "tone": "concise, warm, direct"
  },
  "official_urls": {
    "homepage": "https://example.com",
    "docs": "https://docs.example.com"
  },
  "knowledge_base": {
    "enabled": true,
    "sources": [
      {
        "source_id": "docs",
        "type": "url",
        "title": "Product docs",
        "url": "https://docs.example.com"
      }
    ]
  },
  "risk_policy": {
    "review_keywords": {
      "money": ["invoice", "payment"],
      "security": ["password", "token", "privacy"]
    }
  }
}
```

## Sanitized UI Summaries

If the app has Help & Settings or account panels, read config through the provider via the server and return only a sanitized summary.

Safe to show:

- account ids,
- display names,
- non-secret emails,
- provider hosts,
- aliases,
- identity names,
- profile fields meant for replies,
- brand names,
- official URLs,
- style choices,
- knowledge-source titles/paths/URLs,
- whether each required secret reference is configured.

Never show:

- secret values,
- token-like fields,
- raw private knowledge-file contents,
- cookies,
- private config file contents beyond summaries,
- credential values.

Include the active provider name in `/api/state` or the config summary so the user can see whether the skill is using local files or a remote data source. In Busabase mode, also surface the Folder/Base/Drive identifiers and the Vault namespace, but never Vault values.

## Data Provider Layer

Keep the data layer polymorphic. App code, scripts, onboarding, and UI summaries should access domain config and handoff data through `lib/data-provider/`, not by directly importing local file readers everywhere.

"Provider" is the right word: the same interface reads state, writes human input, checks locks, reads sanitized config summaries, and may be backed by a database or cloud service, not only files.

Use an env selector such as:

```text
<SKILL_ENV_PREFIX>_DATA_PROVIDER=local
```

Reserve provider names such as `postgres`, `aitable`, `notion`, and `busabase` for later implementations.

## Provider Interface

Make the provider contract explicit and enforced:

- Define one `lib/data-provider/provider-interface.ts`.
- Each provider is a `class ... implements DataProvider`.
- The selector runs `assertProvider(name, provider)` at registration.
- Keep a stable provider `name`.
- Fail loud when a provider is missing a required method.

Copy `provider-interface.ts` from this skill's references and adapt the member list to the domain:

```text
references/provider-interface.ts
```

For an older pure `.mjs` fallback, express the same contract as JSDoc typedefs plus the runtime `assertProvider` guard.

## Provider Spectrum

The default backing store is local files. This keeps an App-in-Skill private, offline-friendly, and runnable inside a cloud drive.

The same app should be able to graduate to a database or cloud service without rewriting UI, scripts, or skill logic.

| Provider | Best for | Trade-off |
| --- | --- | --- |
| `local` | single operator, private, offline, fastest start | no sharing, no remote access |
| `postgres` | self-hosted teams, full SQL control | you operate the database |
| `aitable` | visual-database teams and spreadsheet-like editing | hosted service, API limits |
| `notion` | doc-centric teams | not built for high-volume rows |
| `busabase` | AI-generated content needing review -> canonical records | cloud dependency |

## Busabase Recommendation

Busabase is the recommended cloud provider for shared review/canonical workflows.

Local App-in-Skill handoff files keep "what the agent prepared" and "what the human approved" on disk. Busabase keeps the same pattern as Inbox records, reviews, canonical records, and audit trails. Backing an App-in-Skill with `busabase` turns a personal tool into a shared, multi-operator system of record for human-approved AI output.

Prefer Busabase for App-in-Skills whose output should become trusted, shared, canonical content.

## Busabase As Full Skill Storage

Use Busabase as a whole skill storage provider, not just a reply-review queue or remote JSON file.

- **Folder node** is the dedicated aggregation point for one skill or one configured workspace. Put the skill-owned Base and Drive under this folder. Do not use the Base node itself as the workspace container.
- **Base node** stores structured, queryable, reviewable domain rows: review items, reply drafts, tasks, approvals, canonical records, scan rows, and execution report summaries.
- **Drive node** stores file-tree/app-state blobs: `config/config.json`, `state/schema.json`, `state/current_batch.json`, `state/decisions.json`, `state/lock.json`, `state/scan_state.json`, batch archives, attachments, raw imports, generated exports, screenshots, and any blob-like content that should not be embedded in a Base record.
- **Busabase Vault** stores secret values. Skill JSON config should contain secret references such as `vault_ref`, `password_vault_ref`, `secret_ref`, or compatibility `password_env`, never secret values.

The App UI and scripts should still depend only on `lib/data-provider/`. Busabase SDK, OpenAPI client, REST routes, auth headers, and Drive/Secrets specifics belong in a Busabase adapter such as `lib/data-provider/busabase-client.ts`.

Keep `config`, `schema`, `current_batch`, `decisions`, `scan_state`, and `lock` out of the Base unless they are legacy fallback records. Those are Drive files. New writes should use the Folder/Base/Drive split above. In Busabase provider mode, do not rely on local `app/.data`, `config.local.json`, or `.env` for runtime state; only bootstrap connection env such as Busabase URL/base/space/API key may come from the process environment.

Recommended config:

```json
{
  "data_provider": "busabase",
  "busabase": {
    "base_url": "http://127.0.0.1:15419",
    "base_id": "skill-name",
    "base_slug": "skill-name",
    "folder_slug": "skill-name-workspace",
    "drive_slug": "skill-name-workspace-files",
    "drive_id": "skill-name-files",
    "secrets_namespace": "skill-name"
  }
}
```

Use env overrides:

```text
<SKILL_ENV_PREFIX>_DATA_PROVIDER=busabase
<SKILL_ENV_PREFIX>_BUSABASE_URL=http://127.0.0.1:15419
<SKILL_ENV_PREFIX>_BUSABASE_BASE_ID=skill-name
<SKILL_ENV_PREFIX>_BUSABASE_BASE_SLUG=skill-name
<SKILL_ENV_PREFIX>_BUSABASE_FOLDER_SLUG=skill-name-workspace
<SKILL_ENV_PREFIX>_BUSABASE_DRIVE_SLUG=skill-name-workspace-files
<SKILL_ENV_PREFIX>_BUSABASE_DRIVE_ID=skill-name-files
<SKILL_ENV_PREFIX>_BUSABASE_SECRETS_NAMESPACE=skill-name
<SKILL_ENV_PREFIX>_BUSABASE_API_KEY=...
```

### Schema Manifest

Every Busabase-backed skill should declare a machine-readable storage manifest in the skill package, for example `lib/data-provider/busabase-schema.ts`:

```ts
export const BUSABASE_SCHEMA = {
  provider: "busabase",
  schema_id: "skill-name.storage",
  schema_version: "1",
  folder: {
    default_slug: "skill-name-workspace",
    children: ["base", "drive"]
  },
  base: {
    id: "skill-name",
    slug: "skill-name",
    name: "Skill Name",
    record_kinds: ["review_item", "task", "approval", "canonical_record", "execution_report"]
  },
  drive: {
    id: "skill-name-files",
    slug: "skill-name-workspace-files",
    config_files: ["config/config.json"],
    state_files: ["state/schema.json", "state/current_batch.json", "state/decisions.json", "state/lock.json", "state/scan_state.json"],
    roots: ["config", "state", "batches", "attachments", "imports", "exports"]
  },
  secrets: {
    namespace: "skill-name",
    provider: "busabase-vault",
    refs: ["IMAP_PASSWORD", "SMTP_PASSWORD", "API_KEY"]
  }
} as const;
```

The provider should compute a stable fingerprint from the manifest and persist it to `state/schema.json` in the Drive. The schema file describes the Folder/Base/Drive layout and the paths/record kinds the provider owns.

### Startup Lifecycle

On every startup:

1. Load Busabase bootstrap settings from env/flags: base URL, base id/slug, folder slug, drive slug, optional space/API key.
2. Connect to Busabase.
3. Ensure the workspace Folder exists, then ensure/move the configured Base and Drive under that folder.
4. Read `state/schema.json` from the Drive.
5. If the schema file is missing, write it lazily from the local manifest.
6. Read non-secret runtime config from Drive `config/config.json`.
7. Resolve secret refs from Busabase Vault at runtime; do not copy secret values into env files or JSON.
8. Compare `schema_id`, `schema_version`, and fingerprint.
9. If version is older, run only declared forward migrations.
10. If fingerprint is incompatible, enter read-only setup-needed mode and ask for a migration decision.

Check schema on every startup. Missing schema or missing app-state files are normal initialization work, not a user-facing "provider not ready" state. Reserve "Provider not ready" for connection/auth failures, missing required routing parameters such as a required `space_id`, unavailable parent/folder settings, or incompatible schema/migration cases that cannot be repaired safely.

An explicit init script such as `npm run busabase:init -- --apply` can still exist, but it is a diagnostic/repair command. Normal app startup and `provider.init()` should be idempotent and should lazy-create/repair the provider-owned Folder/Base/Drive/schema when permissions allow.

### Change Request Mapping

Use Busabase Change Requests for AI-prepared or human-reviewed changes:

- Agent output -> change request.
- Human approve -> review verdict.
- Human edit -> operation revision.
- Human asks for revision -> `request_changes` / agent task.
- Accepted state -> merge to canonical record.
- External side effect -> still performed by the skill after approval, then logged back as an execution report.

Busabase records approval and canonical data. It should not directly send email, move money, publish, delete, mutate mailboxes, or call production APIs unless that external side effect is itself the explicit product being built and has its own approval gate.

### Provider Interface Additions

For Busabase-capable skills, add these optional methods to the provider contract:

```ts
init?(): Promise<ProviderStatus | Record<string, unknown>>;
providerStatus?(): Promise<ProviderStatus | Record<string, unknown>>;
checkSchema(): Promise<Record<string, unknown>>;
ensureSchema(options?: { apply?: boolean }): Promise<Record<string, unknown>>;
getFile?(path: string): Promise<unknown>;
putFile?(path: string, data: unknown, meta?: Record<string, unknown>): Promise<unknown>;
getSecret?(name: string): Promise<string>;
```

The app should call `providerStatus()` through the server and use one full-screen gate when `ok === false`. Help & Settings should show the active data provider mode and sanitized storage identifiers such as Folder slug, Base id/slug, Drive slug/id, and schema version. It must never expose secret values.
