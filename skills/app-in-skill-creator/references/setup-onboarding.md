# Setup Onboarding

Use this reference when designing the first screen of an App-in-Skill, the setup
gate, provider selection, account/config onboarding, or recovery from missing
configuration.

Setup onboarding is a product surface, not an error page. A freshly installed
skill should feel ready to guide the user, even when no provider, account,
workspace, or secret has been configured yet.

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
- Verify provider choice writes only non-secret bootstrap config.
- Verify secrets are represented only by env var names or Vault ref names.
- Verify changing language updates dynamic setup text.
- Verify setup-incomplete state returns empty workflow counts/items.
- Verify Help & Settings shows the active provider and sanitized storage paths.
- Verify mobile width does not overflow.
- Verify provider connection failures show one full-screen provider-not-ready
  gate with an actionable next step.
