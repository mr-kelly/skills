# Setup Onboarding

Use this reference when designing the first screen of an App-in-Skill, the setup
gate, provider selection, account/config onboarding, or recovery from missing
configuration.

Setup onboarding is a product surface, not an error page. A freshly installed
skill should feel ready to guide the user, even when no provider, account,
workspace, or secret has been configured yet.

The app server must be launchable before provider selection. Do not make
`app/start.sh`, the Hono server, or `/api/state` require Busabase, a database,
private config, secrets, or any remote service merely to render setup. When no
provider has been selected, use the local provider implementation only as a
bootstrap fallback for serving setup state, report `provider_selected:false`,
and set `setup.state` to `choose_provider`.

## Required First-Run Experience

Every App-in-Skill that needs runtime configuration must include one full-screen
setup gate before normal workflow controls become active.

The gate should answer four questions immediately:

- What app am I setting up?
- Which data provider should store this workflow?
- What is already ready and what is still missing?
- What prompt should I give the agent to continue safely?

Do not scatter duplicate "not ready" messages across list panes, detail panes,
sidebars, cards, and modals. The setup gate is the blocking surface. The rest of
the app can show neutral placeholders or stay disabled while setup is active.

### Setup Gate Shell

Treat the setup gate panel as a bounded dialog, not an unbounded grid centered
in a fixed-position overlay. If the overlay uses `display:grid; place-items:
center` with no height cap, a panel taller than the viewport overflows with no
way to scroll to the hidden top/bottom, and any content-length change (a
checklist detail string, a prompt body) reflows the whole panel and visibly
re-centers it — this reads as jank/stutter even when the underlying request is
sub-50ms. Give the panel a `max-height: min(<n>px, calc(100vh - 48px))`,
split it into a fixed head, an internally scrollable body (`overflow:auto`),
and a fixed footer for actions, the same shape already used for the Help &
Settings modal (see `mobile-shell-layout.md`). Reuse that modal's shell
properties directly where practical instead of inventing a second one.

## Provider Choice

When no provider has been selected, show a clear provider choice:

- `local`: private single-machine setup, fastest start, JSON/env files.
- `busabase`: shared workspace, human-readable Base tables, Drive app state,
  and Vault secrets.

The UI may write a minimal non-secret bootstrap config for the selected provider
when this is safe. That bootstrap may include provider name, Busabase URL, base
id/slug, folder slug, drive slug/id, optional space id, and secret namespace.
It must not collect or persist passwords, app passwords, API keys, OAuth tokens,
cookies, or other secret values.

If provider mode is locked by environment variables or launch flags, show the
selected mode and disable provider switching. Tell the user which env var or
launcher setting controls the mode.

Launchers must not invent a provider. `app/start.sh` should pass through an
explicit `<SKILL_ENV_PREFIX>_DATA_PROVIDER` when the user set one, but it must
not default that env var to `busabase`, `local`, or any other provider. A
launcher-level default turns first-run setup into a locked or failing provider
state instead of the required provider-choice screen.

### Hosting Sub-Choice

When a provider has more than one deployment shape — a hosted/cloud product
versus a self-hosted/open-source build of the same service — reveal a second,
nested choice under that provider card instead of asking the user to guess
which fields apply. Show only the fields each mode actually needs:

- Self-hosted/open-source builds are commonly single-tenant with no
  authentication: show only a Base URL field.
- Hosted/cloud builds are commonly multi-tenant: show a Base URL field plus a
  tenant/space id field, and a secret (API key) readiness row.

Non-secret connection identifiers — a base URL, a tenant/space id, a folder or
base slug — are safe to collect through a real text input and write to the
same local bootstrap file used for the provider choice itself; this is not the
"never collect secrets" rule, which applies only to passwords, tokens, and API
keys. Keep the secret itself off that input entirely: show a compact
ready/missing pill plus the required env var or Vault ref name (reuse the same
readiness-pill pattern used for IMAP/SMTP-style secrets elsewhere in the app),
and never render a text box a user could paste a key into.

This sub-choice is UI/config state, not a second provider identity — the
provider's own connection code decides how to use it (e.g. skip auth headers
entirely when no key is configured), it does not need its own `assertProvider`
entry.

Wire the local bootstrap file all the way through: it is easy to write a
provider-choice bootstrap file that only the provider *selector* reads (to
decide which provider class to instantiate) while the provider's own
connection bootstrap reads exclusively from environment variables. If that
happens, values typed into the setup UI are silently ignored. Make sure
whatever resolves the provider's actual connection settings (base URL, tenant
id, etc.) checks the same local bootstrap file, with environment variables
still taking priority so a launcher/operator override always wins.

## Language Choice

First-run setup should offer language selection directly on the setup gate when
the app supports i18n.

Reuse the same language switcher component/state used by Help & Settings. The
setup gate may place it in a more compact container, but do not duplicate the
language option markup, storage key, labels, or event binding.

Use the same language state as Help & Settings:

- `Auto`: follows browser or system language.
- `English`.
- `Chinese` or the app's supported localized label.

Changing language must immediately refresh static text and dynamic setup text:
checklist rows, readiness labels, next action copy, and the suggested agent
prompt. Do not make users open Help & Settings before they can understand the
first-run screen.

## Setup State Model

Expose setup state through `/api/state` or the equivalent server state endpoint.
Recommended shape:

```json
{
  "setup": {
    "provider_selected": false,
    "provider_env_locked": false,
    "provider": "local",
    "state": "needs_config",
    "recommended_config": "~/.config/skill-name/config.json",
    "recommended_env": "~/.config/skill-name/.env",
    "example_config": "skill-name/config.example.json",
    "missing_env": []
  }
}
```

Common setup states:

- `choose_provider`: no provider selected yet.
- `needs_config`: provider selected, but account/workflow config is missing.
- `missing_secrets`: config exists, but env vars or Vault refs are missing.
- `provider_not_ready`: selected provider cannot connect or cannot safely write.
- `migration_needed`: provider data exists but schema migration needs a decision.
- `ready`: normal workflow may run.

While setup is incomplete, suppress stale workflow data from the main state
payload. Do not show old local batches, previous decision counts, cached rows, or
demo-like data as if the app were ready. Return empty lists/counts unless the
screen is explicitly rendering demo mode.

## Checklist

Use a compact readiness checklist. Typical rows:

- Provider selected.
- Storage connection.
- Workspace Folder.
- Primary Base.
- Related Base tables.
- Drive.
- Config.
- Secrets.

Rows that depend on a provider should not appear ready before the provider has
been selected. For local mode, Busabase-only rows can say that local files are in
use. For Busabase mode, show sanitized identifiers such as base URL, base id,
folder slug, drive slug/id, schema version, and Vault namespace/reference names.

Never show secret values.

## Suggested Agent Prompt

The setup gate should include a copyable prompt that the user can paste into the
agent. The prompt should name:

- selected provider,
- config home,
- secret home,
- known bootstrap identifiers,
- missing non-secret fields,
- missing secret reference names,
- the rule that secrets must not be pasted into chat.

The prompt must be provider-aware. If the user has not selected a provider, the
prompt should ask the agent to help choose one. After the user selects `local`,
the prompt should switch to local config paths and env var refs. After the user
selects `busabase`, it should switch to Busabase Drive config paths, Base/Folder
identifiers, and Vault ref names. The prompt title or nearby label should show
the active provider so the change is obvious.

Provider selection and provider readiness are separate states. If the user
selected `busabase` but the Busabase service is unreachable, the setup state and
suggested prompt should still say `busabase`; do not fall back to an unselected
local prompt merely because the provider is not ready.

Example:

```text
/skill-name Help me configure this app in Busabase provider mode.
Non-secret config belongs in busabase:drive/config/config.json.
Secret values belong in busabase:vault/skill-name and should be referenced by
vault_ref. Do not ask me to paste passwords or API keys in chat; tell me the
secret names that must exist.
```

## Provider Not Ready Boundary

Do not use "Provider not ready" for normal first-run setup.

Use setup/onboarding copy for:

- no provider selected,
- no account config,
- no user profile/brand/rules yet,
- missing env var names,
- missing Vault ref names,
- missing schema/app-state files that the provider can lazily create.

Reserve "Provider not ready" for real provider readiness failures:

- service unreachable,
- auth/API key invalid,
- required space/parent/folder routing parameter missing,
- write permission denied,
- schema fingerprint incompatible and unsafe to auto-migrate,
- provider contract missing required methods.

## Reconfiguration And Reset

Support a deliberate reconfigure path when practical. It may:

- clear the onboarding marker,
- switch provider mode when not env locked,
- rewrite only non-secret bootstrap config,
- leave existing provider data intact until the user explicitly asks to remove it,
- tell the user where backups are stored before destructive cleanup.

Deleting secrets, remote Bases, Drive files, or local private config is a
destructive action. Back up first and ask for explicit confirmation unless the
user already made the destructive request clearly.

## Verification Checklist

Before shipping setup onboarding:

- Start with no private config and verify the setup gate is the first screen.
- Start with no `<SKILL_ENV_PREFIX>_DATA_PROVIDER`, no private config, and no
  provider service running; verify `app/start.sh` still starts and `/api/state`
  returns `setup.provider_selected:false` plus `setup.state:"choose_provider"`.
- Verify provider choice writes only non-secret bootstrap config.
- Verify secrets are represented only by env var names or Vault ref names.
- Verify changing language updates dynamic setup text.
- Verify setup-incomplete state returns empty workflow counts/items.
- Verify Help & Settings shows the active provider and sanitized storage paths.
- Verify mobile width does not overflow.
- Verify provider connection failures show one full-screen provider-not-ready
  gate with an actionable next step.
