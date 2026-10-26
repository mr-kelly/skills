# Upstream methods and modifications

Reviewed 2026-10-26. Adapted methods from `mukul975/Anthropic-Cybersecurity-Skills`,
commit `54a798831d2266a3ca61ce68a7acb80b81160d57`. The files identify their author as
mahipal and declare Apache-2.0. This is a community repository, not an Anthropic product.
The full Apache-2.0 license is included at `../LICENSES/Apache-2.0.txt`.

| Original skill | Adaptation in Kelly Security |
| --- | --- |
| [analyzing-linux-system-artifacts](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-linux-system-artifacts/SKILL.md) | Account, authentication, executable and persistence artifact selection. Replaced wholesale `.ssh`/shadow collection and broad filesystem scans with bounded inspection. |
| [performing-linux-log-forensics-investigation](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/performing-linux-log-forensics-investigation/SKILL.md) | Auth/secure, journal, sudo, cron, package history and event correlation. Preserve timestamp uncertainty; recognize IPv6 and rotated/compressed logs. |
| [analyzing-linux-audit-logs-for-intrusion](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-linux-audit-logs-for-intrusion/SKILL.md) | Existing audit event and execution analysis. Omitted rule deployment, backlog changes, daemon reloads, test writes and SIEM configuration. |
| [analyzing-web-server-logs-for-intrusion](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-web-server-logs-for-intrusion/SKILL.md) | Apache/Nginx requests, traversal/SQLi/scanner/WebShell indicators. Match before redaction; classify as leads rather than successful exploitation. No GeoIP upload/dependency. |
| [analyzing-persistence-mechanisms-in-linux](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-persistence-mechanisms-in-linux/SKILL.md) | cron, systemd, authorized keys, profiles and dynamic-loader checks. Added user units/drop-ins and baseline review; removed automatic remediation. |
| [building-incident-response-playbook](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/building-incident-response-playbook/SKILL.md) | Evidence-preserving triage, explicit uncertainty, handoff and separate response authority. No automatic containment or external notifications. |

The original executable scripts are not bundled or run. `lib/catalog.mjs` and `lib/analysis.mjs`
are new implementations adapted from the documented procedures; the local SSH runner, Busabase
resource model, state machine and UI are original. File hashes in `upstream-sources.json` identify
the exact reviewed documents. They are provenance, not a claim of independent certification.

Additional primary references:

- [UAC documentation](https://tclahr.github.io/uac-docs/): volatile evidence first, provenance,
  hashing, and specialist acquisition. Do not inherit examples that disable SSH host checking.
- [NIST SP 800-61r3](https://csrc.nist.gov/pubs/sp/800/61/r3/final): incident detection, analysis,
  response and recovery in risk management.
- Busabase package/runtime contract: `busabase/skills@b6db4aaf053453e4deda2a6ef8b78e9abd75db70`,
  `skills/busabase-app-creator/`. Runtime uses `busabase-sdk@0.99.1`.
