# Kelly Compliance

A Busabase workbench for SaaS cloud baselines and SOC 2 readiness: scoped programs, independent control dimensions, period-aware evidence review, accountable gaps and expiring exceptions.

Install `npx busabase-cli@0.99.1 install ./skills/kelly-compliance`, then run `node scripts/setup.mjs --apply` from the skill with your selected Busabase connection. Includes eight typed Bases, native table Views, guide, manual, private Drive and Hono/vanilla AirApp. Start without AWS credentials: import existing reports or register private evidence indexes.

Use `?demo=1` for deterministic synthetic data. Live mode uses SDK session client and ChangeRequests. Local AWS uses a finite read catalog with independent authorization and caller identity binding; it does not enable services or remediate.

A snapshot is not period operation. Each evidence dimension requires independent review, and risk acceptance never turns failures green. Outputs are preparation materials, not audit opinions or certification.

See [SKILL.md](SKILL.md), [imports](references/imports.md), [AWS reads](references/aws.md), [sources](references/sources.md). Run `pnpm check && pnpm test` plus app SDK/editorial checks.

## App UI

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/cover.webp" alt="Kelly Compliance"></td>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Readiness overview"></td>
  </tr>
  <tr>
    <td><strong>Kelly Compliance</strong><br>Scoped cloud evidence and SOC 2 readiness.</td>
    <td><strong>Readiness overview</strong><br>See evidence gaps rather than a compliance score.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/resources.webp" alt="Cloud resources"></td>
    <td width="50%"><img src="assets/screenshots/controls.webp" alt="Control checklist"></td>
  </tr>
  <tr>
    <td><strong>Cloud resources</strong><br>Keep account and region scope visible.</td>
    <td><strong>Control checklist</strong><br>Review requirements and evidence coverage.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/evidence.webp" alt="Evidence review"></td>
    <td width="50%"><img src="assets/screenshots/issues.webp" alt="Gaps and exceptions"></td>
  </tr>
  <tr>
    <td><strong>Evidence review</strong><br>Distinguish snapshots from operating-period evidence.</td>
    <td><strong>Gaps and exceptions</strong><br>Track accountable owners and expiring exceptions.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/assessments.webp" alt="Assessment history"></td>
    <td width="50%"><img src="assets/screenshots/controls-mobile.webp" alt="Review on a phone"></td>
  </tr>
  <tr>
    <td><strong>Assessment history</strong><br>Retain imports, versions and collection gaps.</td>
    <td><strong>Review on a phone</strong><br>Inspect control evidence on a narrow screen.</td>
  </tr>
</table>

[Watch the 29-second walkthrough](assets/recordings/kelly-compliance-zh-CN.mp4).
Screenshots and video use synthetic SaaS and cloud evidence, with no customer data or actual audit opinion. Both gallery languages show the Chinese operator UI with localized covers.

## Install the skill

```sh
npx skills add mr-kelly/skills --skill kelly-compliance
```

Follow the included manual to select a workspace and install its Busabase package. The canonical source is `content/kelly-compliance-app/`; persistent configuration and workflow use `busabase-sdk@0.99.1`. The browser manages evidence review; the local Agent executes independently authorized AWS reads.

Verification includes actual disposable OSS installation/idempotence/persistence, four browser sizes and native AirApp writes and reload. Cloud OAuth is a separate environment-gated check; real AWS/customer systems are not used for these tests.
