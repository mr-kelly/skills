# Kelly AppSec

Audit application and REST API authorization through explicit business rules, attributable evidence and version-aware retests. The local Agent executes bounded checks; the Busabase workspace keeps projects, API inventory, policy rules, run history, findings and review decisions. The operator UI is in Chinese.

## What you can do

- Import OpenAPI/Swagger JSON or an explicit endpoint-and-rule inventory for a chosen source revision.
- Review who may read or change each controlled object using an endpoint × identity matrix.
- Run locally authorized API cases with positive baselines, response assertions, fixed request budgets and no redirects.
- Import an attributed source review without representing it as a completed dynamic test.
- Review redacted evidence, assign remediation, and retest the original affected case on the fixed revision.
- Export a labeled current-page report or a separate bounded full-run report.

## App UI

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/cover.webp" alt="Kelly AppSec"></td>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Audit overview"></td>
  </tr>
  <tr>
    <td><strong>Kelly AppSec</strong><br>Rules, evidence and version-aware retests.</td>
    <td><strong>Audit overview</strong><br>See policy coverage and the current project.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/projects.webp" alt="Projects"></td>
    <td width="50%"><img src="assets/screenshots/endpoints.webp" alt="API inventory"></td>
  </tr>
  <tr>
    <td><strong>Projects</strong><br>Keep target environments and revisions separate.</td>
    <td><strong>API inventory</strong><br>Trace endpoints to OpenAPI or explicit inventory.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/rules.webp" alt="Business rules"></td>
    <td width="50%"><img src="assets/screenshots/matrix.webp" alt="Permission matrix"></td>
  </tr>
  <tr>
    <td><strong>Business rules</strong><br>Document who may access which objects.</td>
    <td><strong>Permission matrix</strong><br>Compare roles against explicit expected behavior.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/findings.webp" alt="Review and remediation"></td>
    <td width="50%"><img src="assets/screenshots/runs.webp" alt="Run history"></td>
  </tr>
  <tr>
    <td><strong>Review and remediation</strong><br>Read the evidence before confirming a defect.</td>
    <td><strong>Run history</strong><br>Separate requested, partial and completed work.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/findings-mobile.webp" alt="Review on a phone"></td>
  </tr>
  <tr>
    <td><strong>Review on a phone</strong><br>Inspect the same finding on a narrow screen.</td>
  </tr>
</table>

[Watch the interface walkthrough](assets/recordings/kelly-appsec-zh-CN.mp4).
Screenshots and video use synthetic API identities, objects and findings; they do not show a real customer's application. Both gallery languages show the same Chinese operator UI with localized covers.

## Install and operate

```sh
npx skills add mr-kelly/skills --skill kelly-appsec
```

Have the Agent follow `SKILL.md` and install the included Busabase package into the explicitly selected workspace. The complete package creates its own Folder, seven Bases and table Views, manual, guide Doc, report Drive and AirApp. `scripts/setup.mjs --apply` installs and reads back those resources; repeated setup preserves the same workspace resources.

The canonical runnable source is `content/kelly-appsec-app/`. Persistent configuration and review state use `busabase-sdk@0.99.1`. Dynamic API requests run only in the local trusted executor, using independently supplied origin, project, environment, revision, method/path/object allowlists and local synthetic-account credentials. Browser forms do not collect tokens. State-changing cases also require explicit local authorization.

An HTTP status is one observation. A completed run does not prove the application is free from vulnerabilities. Unknown coverage, an invalid positive baseline and inconclusive assertions remain visible; human review is separate from automatic assessment. This skill is a focused authorization and business-rule workflow, with source-review guidance; it does not claim a universal SAST or penetration-testing engine.

## Provenance and verification

The audit method adapts pinned Apache-2.0 community security skills and official OWASP guidance; modifications and source hashes are documented in [upstream.md](references/upstream.md). The UI and workflow are original and follow the reviewed `busabase-app-creator` contract.

Verification includes a controlled local HTTP API, independent behavioral tests, real disposable Busabase OSS install/idempotence/persistence, responsive browser interaction and installed native AirApp acceptance. AWS/customer systems are not involved. Busabase Cloud OAuth is a separately gated check and is not implied by local results. See `tests/app-skills/kelly-appsec/` and the security-suite delivery record.
