# Kelly Security

Investigate suspected Linux compromise with an evidence-based checklist for multiple servers.
The local Agent uses your trusted OpenSSH configuration; the Busabase AirApp shows acquisition,
coverage gaps, source evidence, timelines and analyst verdicts. The operator UI is in Chinese.

## What you can do

- Select authorized servers and a time window, then request a fixed 12-part intrusion investigation.
- Follow processes, sockets, SSH/Web/audit logs, accounts, cron, systemd, authentication persistence,
  selected files and log coverage without automatic remediation.
- Open redacted evidence and source locations; keep original acquisition files and SHA-256 locally.
- Review suspicious leads and preserve both the automatic assessment and the analyst's explanation.
- Export a labeled current-page report or request a full bounded report from the local Agent.

## App UI

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview-dark-zh-CN.webp" alt="Multi-server investigation matrix in dark mode"></td>
    <td width="50%"><img src="assets/screenshots/checklist-zh-CN.webp" alt="Twelve checks with source evidence and coverage gaps"></td>
  </tr>
  <tr>
    <td><strong>Server matrix</strong><br>Compare acquisition and assessment without treating an unexamined server as safe.</td>
    <td><strong>Evidence checklist</strong><br>Open each check's evidence, timestamps and collection limitations.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/findings-zh-CN.webp" alt="Analyst review with linked evidence"></td>
    <td width="50%"><img src="assets/screenshots/reviewed-findings-mobile-zh-CN.webp" alt="Mobile review preserving automatic and human assessments"></td>
  </tr>
</table>

[Watch the 10-second review demonstration](assets/recordings/review-zh-CN.mp4).
Screenshots and recording use synthetic data; they do not show a real customer's infrastructure.

## Install and operate

```bash
npx skills add mr-kelly/skills --skill kelly-security
```

Install the included Busabase package into the selected workspace, or have the local Agent use
`scripts/setup.mjs --apply` after selecting its Busabase connection. Read `SKILL.md` for the
authorization, onboarding, acquisition and reporting workflow. The canonical Hono project is
`content/kelly-security-app/`; local preview remains available on explicit request.

The UI does not run SSH or store SSH passwords/private keys. A requested task waits for the local
Agent, which independently checks its current alias/time/scope authorization. Only fixed inspection
recipes run; cleanup, isolation, restarts and credential rotation are separate decisions.

An attack request, accepted login or unfamiliar service is a lead. Missing telemetry is a gap.
Neither a completed collection nor a no-indicator result proves a host was never compromised.

## Provenance and verification

Linux methods adapt six Apache-2.0 community skills with pinned sources and explicit modifications
in [upstream.md](references/upstream.md). The UI and multi-host adapter are original. Runtime and
package behavior follow the latest reviewed `busabase-app-creator`, with `busabase-sdk@0.99.1`.

Validation includes domain regression tests, a genuine disposable Linux OpenSSH lab, real OSS
Busabase installation/persistence, browser interaction and deployed AirApp acceptance. Cloud OAuth
and actual customer infrastructure are separate environment-dependent checks, never implied by
the synthetic/lab results. See the repository's `tests/app-skills/kelly-security/` suites.
