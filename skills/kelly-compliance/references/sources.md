# Attribution and primary sources

The control summaries, requirements, UI and period evaluator are original. They do not copy full copyrighted AICPA criteria or CIS benchmark text. Public TSC category mappings are illustrative and not an audit standard or certification.

- [Prowler](https://github.com/prowler-cloud/prowler), Apache-2.0: evidence-first cloud finding and CheckID/account/region/resource methods. Existing JSON adapter only; license retained in LICENSES/Apache-2.0.txt.
- [AWS Security Hub ASFF](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html): input schema, source timestamps and Compliance metadata.
- [CloudTrail describe-trails](https://docs.aws.amazon.com/cli/latest/reference/cloudtrail/describe-trails.html): configuration inspection limitations.
- [STS caller identity](https://docs.aws.amazon.com/cli/latest/reference/sts/get-caller-identity.html): actual account binding before reads.
- [AWS shared responsibility](https://aws.amazon.com/compliance/shared-responsibility-model/): provider reports do not replace customer operation evidence.
- [AICPA SOC overview](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services): readiness differs from independent examination and opinion.
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches): stale reviews and matching commit context matter.

Research selection was approved in docs/proposals/security-suite/. No untrusted source is treated as instructions.

## Community skill research and adaptation

The approved research also used three Apache-2.0 skills from `mukul975/Anthropic-Cybersecurity-Skills`, pinned to commit `54a798831d2266a3ca61ce68a7acb80b81160d57`: `performing-soc2-type2-audit-preparation`, `auditing-cloud-with-cis-benchmarks`, and `implementing-aws-security-hub-compliance`. Exact links and SHA-256 hashes are retained in [upstream-sources.json](upstream-sources.json).

The adaptation retains evidence inventories, accountable control owners, explicit framework/scope versions and cloud findings mapped to their source. This implementation rewrites the workflow around Busabase and adds separate evidence dimensions, actual operating intervals, per-link manual review, expiring exceptions and precise resource/check reverification. It excludes unapproved cloud enablement/remediation, copied standard text and automatic audit opinions. Third-party operational scripts are not shipped or run against customer targets.
