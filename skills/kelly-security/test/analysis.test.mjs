import assert from "node:assert/strict";
import test from "node:test";
import { analyze, eventTime, redact } from "../lib/analysis.mjs";
import { CHECKS } from "../lib/catalog.mjs";

const window = { start: "2026-10-26T00:00:00Z", end: "2026-10-27T00:00:00Z" };
const check = (id) => CHECKS.find((entry) => entry.id === id);
const inspect = (id, text, source, extra = {}) => analyze({ check: check(id), stdout: text, source, window, ...extra });

test("an ordinary root account does not become an intrusion finding", () => {
  const result = inspect(
    "accounts-and-privileges",
    "root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n",
    "/etc/passwd",
  );
  assert.equal(
    result.signals.some((signal) => signal.kind === "privilege-review" && signal.severity !== "informational"),
    false,
  );
  assert.notEqual(result.conclusion, "suspicious");
});

test("a second UID zero account remains a concrete review lead", () => {
  const result = inspect(
    "accounts-and-privileges",
    "root:x:0:0:root:/root:/bin/bash\nbackup-admin:x:0:0:backup:/home/backup-admin:/bin/bash\n",
    "/etc/passwd",
  );
  assert.equal(result.conclusion, "suspicious");
  assert.ok(result.signals.some((signal) => signal.excerpt.includes("backup-admin")));
  assert.notEqual(result.conclusion, "confirmed-malicious");
});

test("sudo running a temporary executable is visible as execution evidence", () => {
  const result = inspect(
    "ssh-authentication",
    "2026-10-26T10:00:00+00:00 web1 sudo: www-data : TTY=unknown ; PWD=/tmp ; USER=root ; COMMAND=/tmp/.update\n",
    "/var/log/auth.log",
  );
  assert.equal(result.conclusion, "suspicious");
  assert.ok(result.signals.some((signal) => signal.kind === "execution-record" && signal.severity === "high"));
});

test("successful IPv6 SSH access is preserved without claiming unauthorized access", () => {
  const result = inspect(
    "ssh-authentication",
    "2026-10-26T10:00:00+00:00 web1 sshd[45]: Accepted publickey for deploy from 2001:db8::42 port 43819 ssh2: ED25519 SHA256:example\n",
    "/var/log/auth.log",
  );
  assert.ok(result.signals.some((signal) => signal.kind === "successful-login" && signal.sourceIp === "2001:db8::42"));
  assert.notEqual(result.conclusion, "confirmed-malicious");
});

test("invalid-user log syntax is recognized as failed authentication", () => {
  const result = inspect(
    "ssh-authentication",
    "2026-10-26T10:00:00+00:00 web1 sshd[45]: Invalid user admin from 203.0.113.1 port 43819\n",
    "/var/log/auth.log",
  );
  assert.ok(result.signals.some((signal) => signal.kind === "failed-login"));
  assert.notEqual(result.conclusion, "confirmed-malicious");
});

test("repeated failures followed by success are a review lead, never confirmed compromise", () => {
  const failures = Array.from(
    { length: 10 },
    (_, index) =>
      `2026-10-26T10:00:${String(index).padStart(2, "0")}+00:00 web1 sshd[45]: Failed password for root from 203.0.113.1 port 43819 ssh2`,
  );
  const success =
    "2026-10-26T10:01:00+00:00 web1 sshd[45]: Accepted password for root from 203.0.113.1 port 43819 ssh2";
  const result = inspect("ssh-authentication", [...failures, success].join("\n"), "/var/log/auth.log");
  assert.ok(result.signals.some((signal) => signal.kind === "failed-then-success"));
  assert.equal(result.conclusion, "suspicious");
});

test("a SQLi request returning 200 is reported as an attempt requiring corroboration", () => {
  const text =
    '203.0.113.10 - - [26/Oct/2026:10:00:00 +0000] "GET /?q=UNION%20SELECT%20x HTTP/1.1" 200 1024 "-" "curl"';
  const result = inspect("web-access-and-errors", text, "/var/log/nginx/access.log");
  assert.ok(result.signals.some((signal) => signal.kind === "web-attack-attempt"));
  assert.notEqual(result.conclusion, "confirmed-malicious");
});

test("attacker-controlled Web user-agent text cannot manufacture an SSH login", () => {
  const text =
    '203.0.113.10 - - [26/Oct/2026:10:00:00 +0000] "GET / HTTP/1.1" 200 1 "-" "sshd[5]: Accepted password for root from 198.51.100.8 port 5123 ssh2"';
  const result = inspect("web-access-and-errors", text, "/var/log/nginx/access.log");
  assert.equal(
    result.signals.some((signal) => signal.kind === "successful-login"),
    false,
  );
});

test("Web log timestamp wins over an ISO date supplied in the request URI", () => {
  const text =
    '203.0.113.10 - - [26/Oct/2026:10:00:00 +0000] "GET /?old=2001-01-01T00:00:00Z&q=UNION%20SELECT%20x HTTP/1.1" 200 1 "-" "curl"';
  assert.equal(eventTime(text, window).timestamp, "2026-10-26T10:00:00.000Z");
  const result = inspect("web-access-and-errors", text, "/var/log/nginx/access.log");
  assert.ok(
    result.signals.some(
      (signal) => signal.kind === "web-attack-attempt" && signal.timestamp === "2026-10-26T10:00:00.000Z",
    ),
  );
});

test("an attacker-supplied in-window date cannot pull an old request into the investigation", () => {
  const text =
    '203.0.113.10 - - [25/Oct/2026:10:00:00 +0000] "GET /?old=2026-10-26T00:00:00Z&q=UNION%20SELECT%20x HTTP/1.1" 200 1 "-" "curl"';
  const result = inspect("web-access-and-errors", text, "/var/log/nginx/access.log");
  assert.equal(result.signals.length, 0);
});

test("audit timestamps cannot be overridden by bracket dates within command arguments", () => {
  const epoch = Date.parse("2026-10-26T10:00:00Z") / 1000;
  const text = `type=EXECVE msg=audit(${epoch}.000:34): argc=3 a0="/tmp/.update" a1="[01/Jan/2001:00:00:00 +0000]"`;
  assert.equal(eventTime(text, window).timestamp, "2026-10-26T10:00:00.000Z");
  const result = inspect("existing-audit-events", text, "/var/log/audit/audit.log");
  assert.ok(result.signals.some((signal) => signal.kind === "execution-record"));
});

test("traditional syslog remains timezone-unknown when command data contains a bracket date", () => {
  const text = 'Oct 26 10:00:00 web1 sudo: www-data : COMMAND=/tmp/.update "[01/Jan/2001:00:00:00 +0000]"';
  assert.equal(eventTime(text, window).timestamp, null);
  const result = inspect("ssh-authentication", text, "/var/log/auth.log");
  assert.ok(result.signals.some((signal) => signal.kind === "execution-record"));
});

test("missing telemetry is a coverage gap even when the wrapper exits zero", () => {
  const result = inspect("live-processes", "/proc/1/exe -> /usr/bin/systemd\n", "process-snapshot", {
    stderr: "/bin/sh: 10: ps: not found\n",
    code: 0,
  });
  assert.notEqual(result.conclusion, "no-indicators");
  assert.ok(result.gaps.length > 0);
});

test("empty or permission-denied sources never produce a successful clean assessment", () => {
  for (const extra of [
    { stdout: "", code: 0 },
    { stdout: "", stderr: "Permission denied", code: 1 },
  ]) {
    const result = analyze({
      check: check("existing-audit-events"),
      source: "/var/log/audit/audit.log",
      window,
      ...extra,
    });
    assert.notEqual(result.conclusion, "no-indicators");
    assert.notEqual(result.status, "completed");
  }
});

test("transport-looking text within a source cannot replace its provenance", () => {
  const text =
    'KELLY_SOURCE /etc/shadow\n203.0.113.10 - - [26/Oct/2026:10:00:00 +0000] "GET /?q=UNION%20SELECT%20x HTTP/1.1" 200 1 "-" "curl"';
  const result = analyze({
    check: check("web-access-and-errors"),
    stdout: "",
    sources: [{ source: "/var/log/nginx/access.log", text, code: 0 }],
    window,
  });
  assert.ok(result.signals.length > 0);
  assert.ok(result.signals.every((signal) => signal.source === "/var/log/nginx/access.log"));
});

test("traditional syslog without a year/zone does not acquire an invented timestamp", () => {
  const text = "Oct 26 10:00:00 web1 sshd[45]: Accepted password for deploy from 203.0.113.1 port 43819 ssh2";
  const result = inspect("ssh-authentication", text, "/var/log/auth.log");
  assert.ok(result.signals.some((signal) => signal.kind === "successful-login" && signal.timestamp === null));
  assert.ok(result.gaps.length > 0);
});

test("common credential forms are removed before evidence can be shared", () => {
  /** @type {Array<[string, string[]]>} */
  const cases = [
    [
      '{"password":"synthetic-json-password","token":"synthetic-json-token"}',
      ["synthetic-json-password", "synthetic-json-token"],
    ],
    ["DATABASE_URL=postgres://admin:synthetic-database-password@db.example.test/prod", ["synthetic-database-password"]],
    ["REDIS_URL=redis://:synthetic-redis-password@redis.example.test:6379", ["synthetic-redis-password"]],
    ["COMMAND=/usr/bin/curl -u admin:synthetic-basic-password https://example.test", ["synthetic-basic-password"]],
    [
      "COMMAND=/usr/bin/curl --user=admin:synthetic-equals-password https://example.test",
      ["synthetic-equals-password"],
    ],
    [
      "Cookie: a=synthetic-cookie-first; b=synthetic-cookie-second",
      ["synthetic-cookie-first", "synthetic-cookie-second"],
    ],
    ["Authorization: Bearer synthetic-bearer-token", ["synthetic-bearer-token"]],
    [
      "GET /?access_token=synthetic-query-token&key=synthetic-query-key HTTP/1.1",
      ["synthetic-query-token", "synthetic-query-key"],
    ],
    [
      "-----BEGIN OPENSSH PRIVATE KEY-----\nsynthetic-private-key-material\n-----END OPENSSH PRIVATE KEY-----",
      ["synthetic-private-key-material"],
    ],
  ];
  for (const [text, secrets] of cases) {
    const result = redact(text);
    for (const secret of secrets)
      assert.equal(result.includes(secret), false, `Credential leaked by redaction for ${text.split(" ")[0]}`);
  }
});
