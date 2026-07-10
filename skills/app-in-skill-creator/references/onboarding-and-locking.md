# Onboarding And Locking

Use this reference when implementing onboarding markers, reconfiguration,
config validation, local locks, concurrent writes, or execution gating. For the
first-run setup gate, provider choice, language selection, and suggested agent
prompt, use `setup-onboarding.md`.

## Onboarding Principle

Onboarding is the default initial phase of every App-in-Skill, not a fallback for missing config.

A freshly installed skill starts in onboarding. Before doing real work, it must learn the operating context from the user:

- accounts and credentials setup,
- operator profile,
- brand/product context,
- official URLs,
- reply/style preferences,
- risk policy,
- safe knowledge sources,
- export or connector preferences.

The skill performs no external reads/writes during onboarding.

## Onboarding Marker

Use:

```text
app/.data/onboarding.json
```

Marker shape:

```json
{
  "completed": true,
  "completed_at": "ISO timestamp",
  "config_version": "string"
}
```

Absent or `completed:false` means the skill is still in onboarding.

Only write this marker when setup is actually complete and the user confirms it. Never write it for `config.example.json`.

## Onboarding Loop

1. On invocation, check `app/.data/onboarding.json`.
2. If absent/incomplete, enter onboarding.
3. Ask for non-secret configuration turn by turn.
4. Direct the user to local config/env files for secrets; never ask them to paste passwords, tokens, cookies, or app secrets into chat.
5. Validate as you go: config parses, required env vars are present, and accounts/connectors are reachable when safely checkable.
6. Keep prompting until configuration is complete and the user confirms "done".
7. Write the onboarding marker.
8. Only then enter normal operation.

Re-entry: if required config or secrets later go missing or fail validation, drop back to onboarding rather than running with a broken context.

Reconfiguration may also be deliberate. A "reconfigure" command may clear or rewrite the marker.

## Onboarding UI

Detailed setup gate rules live in `setup-onboarding.md`.

The app should show a first-screen setup/onboarding gate while onboarding. This
is a normal startup state, not an error banner.

- provider choice when no provider has been selected yet (`local` vs
  `busabase` when supported),
- recommended config path,
- recommended env path,
- Busabase URL/Base/Space/Folder identifiers when Busabase is selected,
- required non-secret fields,
- missing env var names,
- missing Vault secret reference names for Busabase,
- safe account/profile/style summaries,
- next setup step,
- a copyable prompt the user can give the agent to continue setup.

Disable any implication that the app can scan, execute, send, delete, publish, or mutate external systems before onboarding completes.

The setup gate should be the one full-screen blocking surface. Avoid duplicating
"not ready" cards throughout sidebars, list panes, and detail panes. The rest of
the app may show neutral empty placeholders while the gate is active.

Provider selection may be performed by the UI when it only writes a minimal,
non-secret bootstrap config. Secrets still belong in env files for local mode or
Busabase Vault for Busabase mode; never ask users to paste secret values into the
browser or chat.

## Locking Principle

Create a lock before the skill writes batch/decision/report files or executes external actions. Remove it in a `finally` step.

Use:

```text
app/.data/agent.lock
```

Lock shape:

```json
{
  "owner": "skill-name",
  "message": "Generating review batch",
  "started_at": "ISO timestamp"
}
```

## App Behavior While Locked

The app server should:

- poll the lock on a timer,
- show the lock message,
- disable editing while the lock exists,
- reject write endpoints while locked,
- continue showing read-only batch content,
- keep routes thin and delegate file handling, lock checks, state derivation, and decisions to separate `app/server/*.ts` modules.

The frontend should:

- keep auto-refresh polling,
- avoid redrawing while the user is actively editing a textarea or non-search input,
- clearly show that the agent is processing,
- avoid losing unsaved local edits.

## Skill Behavior While Locked

The skill should:

- create the lock before writing or executing,
- remove the lock in `finally`,
- refuse to execute if required approvals are missing,
- re-read decisions immediately before executing,
- write per-item execution results back to the batch or report file.

If a lock is stale, report the owner/message/timestamp and recover only when it is clearly safe or the user asks.

## Concurrency Boundary

The app records human input locally. The skill performs reasoning and execution.

The lock prevents the UI from writing decisions while the skill is generating a batch or consuming decisions. This keeps the handoff recoverable across browser refreshes, interrupted agent runs, and repeated execution attempts.
