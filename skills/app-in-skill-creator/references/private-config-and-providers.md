# Private Config And Providers

Use this reference when an App-in-Skill connects to user accounts, APIs, mailboxes, calendars, CRMs, billing systems, content stores, databases, or any personal/business data source.

## Principle

Keep the skill code and committed templates generic. User-specific accounts, aliases, operator profile, brands/products, style, knowledge sources, policy, endpoints, and risk keywords belong in private config.

Secrets never go in JSON, chat, screenshots, logs, batch files, or `/api/state`. JSON should reference secret env var names only, such as `password_env`, `api_key_env`, or `token_env`.

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
- whether each required env var is configured.

Never show:

- secret values,
- token-like fields,
- raw private knowledge-file contents,
- cookies,
- private config file contents beyond summaries,
- credential values.

Include the active provider name in `/api/state` or the config summary so the user can see whether the skill is using local files or a remote data source.

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
