import { isIP } from "node:net";

// biome-ignore lint/suspicious/noControlCharactersInRegex: Deliberately remove ANSI escape sequences from hostile evidence.
const TERMINAL_CONTROLS = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Deliberately remove C0 and bidi controls from hostile evidence.
const UNSAFE_CONTROLS = /[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g;

export const redact = (input) =>
  String(input ?? "")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[PRIVATE KEY REDACTED]")
    .replace(/\b((?:set-)?cookie\s*:)\s*[^\r\n]+/gi, "$1 [REDACTED]")
    .replace(
      /(["'][^"']*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[^"']*["']\s*:\s*)(["'])(.*?)\2/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=:-]+/gi, "[AUTHORIZATION REDACTED]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/((?:--user|--proxy-user|--password|--token|-u)(?:\s+|=))(?:"[^"]*"|'[^']*'|[^\s]+)/g, "$1[REDACTED]")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session|credential)[\w-]*\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, "$1=[REDACTED]")
    .replace(TERMINAL_CONTROLS, "")
    .replace(UNSAFE_CONTROLS, "");

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const eventTime = (line, _window) => {
  const iso = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/);
  const web = line.match(/^\S+\s+\S+\s+\S+\s+\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})\]/);
  const audit = line.match(/^type=\w+\s+msg=audit\((\d{10}(?:\.\d+)?):\d+\)/);
  let value;
  if (iso) value = iso[0];
  else if (audit) value = new Date(Number(audit[1]) * 1000).toISOString();
  else if (web && months.includes(web[2]))
    value = `${web[3]}-${String(months.indexOf(web[2]) + 1).padStart(2, "0")}-${web[1]}T${web[4]}${web[5]}:${web[6]}`;
  if (value && Number.isFinite(Date.parse(value)))
    return { timestamp: new Date(value).toISOString(), confidence: "explicit-offset" };
  const syslog = line.match(/^(\w{3})\s+(\d{1,2}) (\d{2}:\d{2}:\d{2})\b/);
  return {
    timestamp: null,
    confidence: syslog && months.includes(syslog[1]) ? "source-year-and-timezone-unknown" : "no-reliable-event-time",
    original: syslog?.[0] || null,
  };
};
const decode = (line) => {
  let text = line;
  for (let i = 0; i < 2; i++) {
    try {
      text = decodeURIComponent(text);
    } catch {
      break;
    }
  }
  return text;
};

export const analyze = ({
  check,
  stdout = "",
  stderr = "",
  code = 0,
  limited = false,
  window,
  source = check.id,
  sources = undefined,
  collectionGaps = [],
}) => {
  const signals = [];
  const gaps = new Set(collectionGaps);
  const sourceRows = sources || [{ source, text: stdout, code }];
  let usable = false;
  let lineCount = 0;
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const add = (kind, title, severity, row, index, locator, time, details = {}) => {
    if (signals.length >= 100) {
      gaps.add("signal-limit");
      return;
    }
    signals.push({
      kind,
      title,
      severity,
      source: redact(locator),
      line: index + 1,
      excerpt: redact(row).slice(0, 1400),
      ...time,
      ...details,
    });
  };
  for (const item of sourceRows) {
    if (item.source === "__coverage__") {
      gaps.add(redact(item.text.trim()));
      continue;
    }
    if (item.code) gaps.add(`source-command-failed:${redact(item.source)}`);
    if (item.source.startsWith("metadata:")) continue;
    const lines = item.text.split("\n");
    lineCount += lines.length;
    if (item.text.trim()) usable = true;
    for (const [index, line] of lines.entries()) {
      const time = eventTime(line, window);
      if (time.timestamp && (Date.parse(time.timestamp) < start || Date.parse(time.timestamp) > end)) continue;
      if (check.kind === "authentication") {
        const login = line.match(
          /(?:^|\s)sshd(?:\[\d+\])?:\s+(Accepted \S+|Failed password)\s+for\s+(?:invalid user\s+)?(\S+)\s+from\s+(\S+)/i,
        );
        if (login && isIP(login[3]))
          add(
            login[1].startsWith("Accepted") ? "successful-login" : "failed-login",
            login[1].startsWith("Accepted") ? "发现成功 SSH 登录，需核对授权" : "发现失败 SSH 登录",
            "informational",
            line,
            index,
            item.source,
            time,
            { user: redact(login[2]), sourceIp: login[3] },
          );
        const invalid = line.match(/(?:^|\s)sshd(?:\[\d+\])?:\s+Invalid user\s+(\S+)\s+from\s+(\S+)/i);
        if (invalid && isIP(invalid[2]))
          add("failed-login", "发现不存在账号的 SSH 登录尝试", "informational", line, index, item.source, time, {
            user: redact(invalid[1]),
            sourceIp: invalid[2],
          });
      }
      if (
        ["authentication", "audit"].includes(check.kind) &&
        /sudo(?:\[\d+\])?:.*COMMAND=|\btype=(?:EXECVE|USER_CMD)\b/.test(line)
      )
        add(
          "execution-record",
          "发现提权或命令执行记录",
          /\/dev\/tcp|\/(?:tmp|dev\/shm)\/|curl.+\|.+sh|wget.+\|.+sh/.test(line) ? "high" : "informational",
          line,
          index,
          item.source,
          time,
        );
      if (
        check.kind === "accounts" &&
        (/^(?!root:)[^:]+:[^:]*:0:/.test(line) ||
          /\b(?:useradd|usermod|groupadd)\b.*(?:new user|root|sudo|wheel)/.test(line))
      )
        add("privilege-review", "核对额外高权限账号或账号变更", "medium", line, index, item.source, time);
      if (check.kind === "web") {
        const decoded = decode(line);
        if (
          /union\s+(?:all\s+)?select|(?:\.\.\/){2,}|\/etc\/passwd|php:\/\/|<script|\bsqlmap\b|\bnikto\b/i.test(decoded)
        )
          add("web-attack-attempt", "发现 Web 攻击请求；尚不能证明利用成功", "medium", line, index, item.source, time);
        if (/\.(?:php|jsp|aspx?)\b/i.test(decoded) && /(?:cmd|exec|shell|system)=/i.test(decoded))
          add(
            "webshell-request",
            "发现疑似 WebShell 请求，需关联文件和执行证据",
            "high",
            line,
            index,
            item.source,
            time,
          );
      }
      if (
        ["persistence", "process"].includes(check.kind) &&
        /ExecStart|\/proc\/\d+\/exe|\*\s+\*|@reboot|command=|LD_PRELOAD|ld\.so\.preload/.test(
          `${item.source} ${line}`,
        ) &&
        /\/(?:tmp|var\/tmp|dev\/shm)\/|\/dev\/tcp|curl.+\|.+sh|wget.+\|.+sh|\(deleted\)/.test(line)
      )
        add("persistence-or-execution", "发现需复核的执行路径或持久化命令", "high", line, index, item.source, time);
      if (
        check.kind === "persistence" &&
        /(?:authorized_keys|ld\.so\.preload|pam\.d)/.test(item.source) &&
        line.trim() &&
        !line.startsWith("#")
      )
        add(
          "configuration-review",
          "核对认证或动态加载配置是否获授权",
          "informational",
          line,
          index,
          item.source,
          time,
        );
      if (
        ["authentication", "audit"].includes(check.kind) &&
        /history\s+-c|journalctl.*--vacuum|(?:rm|truncate).*\/var\/log/.test(line)
      )
        add("possible-log-tampering", "发现可能清理日志的命令痕迹", "high", line, index, item.source, time);
    }
  }
  if (limited) gaps.add("collection-time-or-output-limit");
  if (stderr.trim()) gaps.add("collector-stderr-present");
  if (
    /permission denied|operation not permitted|insufficient permissions|not seeing messages from other users/i.test(
      stderr,
    ) ||
    gaps.has("permission-denied")
  )
    gaps.add("permission-denied");
  if (!usable) gaps.add("source-unavailable");
  if (sourceRows.some((item) => /No entries|No journal files/.test(item.text))) gaps.add("no-journal-entries");
  if (signals.some((signal) => !signal.timestamp)) gaps.add("events-without-reliable-time");
  for (const success of [...signals].filter((signal) => signal.kind === "successful-login" && signal.timestamp)) {
    const failures = signals.filter(
      (signal) =>
        signal.kind === "failed-login" &&
        signal.sourceIp === success.sourceIp &&
        signal.timestamp &&
        Date.parse(success.timestamp) - Date.parse(signal.timestamp) >= 0 &&
        Date.parse(success.timestamp) - Date.parse(signal.timestamp) <= 600000,
    );
    if (failures.length >= 10)
      add(
        "failed-then-success",
        "同一来源多次失败后成功登录，需核对账号持有人",
        "high",
        success.excerpt,
        success.line - 1,
        success.source,
        { timestamp: success.timestamp, confidence: success.confidence },
        { sourceIp: success.sourceIp },
      );
  }
  const suspicious = signals.some((signal) => signal.severity !== "informational");
  const status =
    code !== 0
      ? gaps.has("permission-denied")
        ? "permission-denied"
        : "failed"
      : !usable
        ? gaps.has("permission-denied")
          ? "permission-denied"
          : "missing-data"
        : "completed";
  const conclusion = suspicious
    ? "suspicious"
    : gaps.size || status !== "completed"
      ? "insufficient-evidence"
      : signals.length
        ? "unassessed"
        : "no-indicators";
  const times = signals
    .map((signal) => signal.timestamp)
    .filter(Boolean)
    .sort();
  return {
    status,
    conclusion,
    signals,
    gaps: [...gaps],
    summary: suspicious
      ? "发现调查线索；需人工关联与确认，不能据此自动认定入侵。"
      : conclusion === "no-indicators"
        ? "本次已覆盖数据中未发现规则命中，不能据此排除入侵。"
        : "采集结果需要复核或补充证据，尚不能排除入侵。",
    sourceLines: lineCount,
    coverageStart: times[0] || null,
    coverageEnd: times.at(-1) || null,
  };
};
