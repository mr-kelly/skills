# Linux intrusion investigation playbook

Adapted methods and modifications are credited in [upstream.md](upstream.md). Read this before
interpreting a collection. A checklist is coverage accounting, not a certification of a clean host.

## Preserve the incident context

Record who reported the symptom, onset/window and timezone, host business role, recent deploys,
authorized administrators/keys/services, and what changed before collection. Capture current
processes/connections before lengthy log work. Record the acquisition itself so its SSH session,
read commands and access-time effects do not become supposed attacker actions.

The default collector is triage, not a full forensic image: it bounds file counts, bytes, entries,
depth and runtime, and labels samples. It never creates a trusted historical baseline after the
fact. An image, memory acquisition, or UAC collection is a separate specialist operation with
explicit tool, destination, load and authority decisions. Do not guess disk-image offsets or mount
an unknown filesystem as if generic read-only flags prevented every journal replay.

## Evidence to examine

| Question | Evidence | What the evidence does not establish alone |
| --- | --- | --- |
| Was there access? | auth.log/secure and rotations, journal ssh/sshd, wtmp/btmp when present, independent identity logs | A failed login is an attempt; an accepted key may belong to an authorized admin. |
| Was a Web entry point used? | Nginx/Apache access + errors, app audit, reverse-proxy/CDN/WAF telemetry | A signature, scanner user-agent or HTTP 200 is not proof of code execution. Verify proxy attribution. |
| Did an account execute or escalate? | Existing audit USER_CMD/EXECVE/SYSCALL, sudo/PAM, account/group changes, process ancestry | Audit coverage depends on rules that existed then. Shell history can be absent, forged, untimed or sensitive. |
| Is something active now? | Process identity/executable paths, deleted executable links, listening/outbound sockets | High CPU, a temporary path or unusual port can be legitimate. A snapshot cannot reconstruct all earlier activity. |
| Is there persistence? | cron/at, system and user systemd units/timers/drop-ins, authorized_keys, profile, PAM, rc.local, preload | Configuration management and monitoring agents use these same mechanisms. Compare authorized baselines. |
| Were files or tools changed? | Selected metadata/hashes, existing AIDE/EDR/package baselines, deploy manifests | A timestamp is not necessarily creation time; a new hash without a trusted comparator proves no tampering. |
| Are logs reliable and complete? | Retention, rotations, boots, dropped audit events, external log copies | Local root/kernel compromise can hide or forge both logs and command output. |

For SSH key review use only authorized public keys/fingerprints and options, not private key trees.
The collector does not request shadow, environment dumps, application secrets, or live command-line
arguments. A deeper shell-history/app-log acquisition needs a named scope and private handling.
If relevant logs live in containers or a custom path, the default recipe's missing-data state is
expected; identify and preserve those exact logs separately instead of pretending the default
path covered them or scanning every container volume.

## Correlate, then assess

For each hypothesis, collect both supporting evidence and plausible legitimate explanations.
Keep host identity and task ownership fixed when correlating. Normalize only timestamps with a
known offset; preserve original timestamps, boot identity and collection times. Traditional
syslog lacks a year/timezone, file metadata can be timestomped, and audit timestamps are not
request strings. Unknown timestamps remain unknown rather than being assigned the investigator's
current year or local timezone.

Example lead: repeated failures → accepted login from that source → sudo execution → a temporary
executable → a new service referencing that executable. The arrows are a hypothesis until actor,
time, process/file identity and authorized maintenance have been checked. Same IP across servers
may be a shared gateway; same filename may be a standard deployment artifact. External telemetry
provides corroboration when trustworthy and available, not a reason to contact a suspicious C2
address from the production server.

Classify a request signature as an **attempt**; a correlated anomalous activity chain as
**suspicious**; a validated malicious artifact or independently established unauthorized operation
as **analyst-confirmed**, with the evidence and responsible reviewer recorded. Record **explained
benign** with the actual explanation. Record **insufficient evidence** for gaps. No-indicator
results always name their covered time/data and never mean “not compromised.”

## Handle data and report limits

The acquisition transport frames each source name and payload in base64. Parse the envelope
before decoding; decoded text never becomes framing or commands. This protects source boundaries
against ordinary hostile log contents, not against a root attacker controlling the running host.
Hash and retain the complete raw local artifact, including command/version/status metadata.
Source locators point to decoded-source lines, not arbitrary matching text supplied by a log entry.

The automatic redactor covers common credentials, URLs, headers, keys and terminal control codes;
it cannot guarantee removal of every application-specific secret. Review data handling before
using custom sources and do not paste raw files or unbounded output into chat. Keep reports
private until explicitly shared; export does not imply permission to send to customers or others.

The report must separate facts, hypotheses, analyst verdicts and gaps. Include unavailable sources,
privilege limitations, truncation, unknown times, missing baselines and compromised-host trust
limits. Recommend exact additional evidence or response work, with concrete impact tradeoffs.
High-confidence root compromise generally requires rebuilding trust from known-good sources;
deleting one suspicious file is not proof that all access and persistence are gone.
