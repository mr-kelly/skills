# Kelly App Skill Creator

Kelly App Skill Creator builds recurring human-and-Agent workflows as Busabase-backed App-in-Skill packages.

Every generated skill keeps a complete canonical project under `app/` and deploys that same source to Busabase AirApp by default. `pnpm dev` remains available but is started only when the user explicitly requests local preview or debugging. Persistent configuration, workflow state, decisions, claims, and domain data are read and written through `busabase-sdk`; local files and browser storage are not alternate backends. AirApp runtime, framework, SDK, security, and deployment constraints come only from `$busabase-app-creator`.

It requires:

- `$busabase` for connection, node discovery, ChangeRequests, and approvals;
- `$busabase-app-creator` for Busabase resource modeling, Vault boundaries, AirApp constraints, validation, synchronization, and deployment.

The default operating model is Research -> Plan -> Action -> Retrospective. This skill owns the complete product UI contract: information architecture, human-attention sidebar, workflow navigation, desktop list/detail layout, hash routing, Help & Settings, accessibility, phone drawer and separate mobile detail flow, and visual verification at desktop and 390/360px widths. It delegates only AirApp runtime engineering to `$busabase-app-creator`.

The normal acceptance path runs the merged AirApp inside Busabase and returns its clickable URL. When local preview is explicitly requested, the standalone app opens with a Cloud/custom-server connection screen and one-click browser OAuth, plus an explicit read-only Demo path. It never requires CLI login or an API-key input. OAuth tokens stay in an owner-only per-AirApp registration under `~/.busabase/airapps`; deployed AirApps use the ambient Busabase session.
