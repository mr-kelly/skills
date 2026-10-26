// Adapted acquisition methods: references/upstream.md (Apache-2.0).
export const CATALOG_VERSION = "1.0.0";
const files = (paths) => `for f in ${paths}; do inspect_file "$f"; done`;
const logs = (paths) => `for f in ${paths}; do inspect_log "$f"; done`;
export const CHECKS = [
  {
    id: "collection-context",
    name: "主机与采集上下文",
    kind: "context",
    body: `frame context-time date -u '+%Y-%m-%dT%H:%M:%SZ'; frame context-kernel uname -srm; frame context-identity id; frame context-uptime uptime; inspect_file /etc/os-release`,
  },
  {
    id: "live-processes",
    name: "运行进程与执行文件",
    kind: "process",
    body: "frame process-list ps -eo pid,ppid,uid,lstart,comm; frame process-executables collect_processes",
  },
  {
    id: "live-connections",
    name: "监听端口与当前连接",
    kind: "network",
    body: "if command -v ss >/dev/null 2>&1; then frame socket-snapshot ss -tunap; elif command -v netstat >/dev/null 2>&1; then frame socket-snapshot netstat -tunap; else gap socket-tool-unavailable; fi",
  },
  {
    id: "ssh-authentication",
    name: "SSH 登录与认证",
    kind: "authentication",
    body: `${logs("/var/log/auth.log* /var/log/secure*")}; inspect_journal ssh; if command -v last >/dev/null 2>&1; then frame login-history last -n 50 -F; else gap login-history-unavailable; fi`,
  },
  {
    id: "web-access-and-errors",
    name: "Web 访问与错误日志",
    kind: "web",
    body: logs(
      "/var/log/nginx/access.log* /var/log/nginx/error.log* /var/log/apache2/access.log* /var/log/apache2/error.log* /var/log/httpd/access_log* /var/log/httpd/error_log*",
    ),
  },
  {
    id: "existing-audit-events",
    name: "既有审计与命令执行记录",
    kind: "audit",
    body: `${logs("/var/log/audit/audit.log*")}; if command -v auditctl >/dev/null 2>&1; then frame audit-status auditctl -s; fi`,
  },
  {
    id: "accounts-and-privileges",
    name: "账号与权限变更",
    kind: "accounts",
    body: `${files("/etc/passwd /etc/group /etc/sudoers /etc/sudoers.d/*")}; ${logs("/var/log/dpkg.log* /var/log/yum.log* /var/log/dnf.log*")}`,
  },
  {
    id: "cron-and-at",
    name: "cron / at 持久化",
    kind: "persistence",
    body: `${files("/etc/crontab /etc/anacrontab /etc/cron.d/* /var/spool/cron/* /var/spool/cron/crontabs/*")}; if command -v atq >/dev/null 2>&1; then frame at-queue atq; fi`,
  },
  {
    id: "systemd-services-and-timers",
    name: "systemd 服务与定时器",
    kind: "persistence",
    body: `${files("/etc/systemd/system/*.service /etc/systemd/system/*.timer /etc/systemd/system/*.service.d/*.conf /etc/systemd/user/*.service /etc/systemd/user/*.timer /home/*/.config/systemd/user/*.service /home/*/.config/systemd/user/*.timer /root/.config/systemd/user/*.service /root/.config/systemd/user/*.timer")}; if command -v systemctl >/dev/null 2>&1; then frame timer-list systemctl list-timers --all --no-pager; fi`,
  },
  {
    id: "ssh-profile-pam-preload",
    name: "SSH、公钥与认证持久化",
    kind: "persistence",
    body: files(
      "/etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf /etc/ld.so.preload /etc/pam.d/sshd /etc/rc.local /etc/profile /etc/profile.d/* /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys /root/.bashrc /root/.profile /home/*/.bashrc /home/*/.profile",
    ),
  },
  {
    id: "suspicious-files-and-existing-integrity",
    name: "可疑文件与完整性线索",
    kind: "files",
    body: `for d in /tmp /var/tmp /dev/shm /usr/local/bin /usr/local/sbin; do [ -d "$d" ] && frame "$d" find "$d" -xdev -maxdepth 3 -type f -printf '%T+ %m %u %s %p\\n'; done; if command -v sha256sum >/dev/null 2>&1; then frame selected-binary-hashes sha256sum /bin/sh /usr/sbin/sshd /usr/bin/sudo; fi; gap trusted-integrity-baseline-required`,
  },
  {
    id: "coverage-and-timeline",
    name: "日志覆盖与系统时间线",
    kind: "coverage",
    body: `${logs("/var/log/syslog* /var/log/messages* /var/log/kern.log*")}; inspect_journal all; if command -v journalctl >/dev/null 2>&1; then frame journal-boots journalctl --list-boots --no-pager; fi`,
  },
];
export const validateWindow = (start, end) => {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(start || "") || !iso.test(end || "")) throw new Error("WINDOW_REQUIRES_EXPLICIT_TIMEZONE");
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("INVALID_WINDOW");
  return { start: new Date(from).toISOString(), end: new Date(to).toISOString() };
};
export const validateAlias = (alias) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(alias || "")) throw new Error("INVALID_SSH_ALIAS");
  return alias;
};
export const buildSshArgs = (alias) => [
  "-T",
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=yes",
  "-o",
  "ForwardAgent=no",
  "-o",
  "ClearAllForwardings=yes",
  "-o",
  "PermitLocalCommand=no",
  "-o",
  "RemoteCommand=none",
  "-o",
  "ControlMaster=no",
  "-o",
  "ControlPath=none",
  "-o",
  "ConnectTimeout=10",
  "-o",
  "ServerAliveInterval=10",
  "-o",
  "ServerAliveCountMax=2",
  "--",
  validateAlias(alias),
  "env LC_ALL=C TZ=UTC /bin/sh -s",
];
export const buildRecipe = (checkId, window) => {
  const check = CHECKS.find((item) => item.id === checkId);
  if (!check) throw new Error("UNKNOWN_CHECK");
  const { start, end } = validateWindow(window.start, window.end);
  // Both path and bytes are base64-framed. Decoded content cannot create a frame.
  // The final numeric line is appended by our wrapper AFTER the command ends.
  return `export LC_ALL=C TZ=UTC
command -v base64 >/dev/null 2>&1 || { printf 'required base64 tool unavailable\\n' >&2; exit 78; }
frame() {
  source_name=$1
  shift
  printf 'KELLY_FRAME '
  printf '%s' "$source_name" | base64 | tr -d '\\n'
  printf '\\n'
  { "$@"; kelly_rc=$?; printf '\\n%s\\n' "$kelly_rc"; } | base64
  printf 'KELLY_FRAME_END\\n'
}
gap() { frame __coverage__ printf '%s' "$1"; }
file_count=0
inspect_file() {
  f=$1
  [ -e "$f" ] || return 0
  file_count=$((file_count+1))
  [ "$file_count" -le 128 ] || { gap file-count-limit; return 0; }
  [ ! -L "$f" ] || { gap symlink-not-read; return 0; }
  [ -f "$f" ] || return 0
  [ -r "$f" ] || { gap permission-denied; return 0; }
  frame "metadata:$f" stat "$f"
  bytes=$(wc -c < "$f")
  [ "$bytes" -le 131072 ] || gap file-size-limit
  frame "$f" head -c 131072 "$f"
}
decompress_tail() { gzip -cd -- "$1" | tail -c 1048576; }
inspect_log() {
  f=$1
  [ -e "$f" ] || return 0
  file_count=$((file_count+1))
  [ "$file_count" -le 32 ] || { gap log-count-limit; return 0; }
  [ ! -L "$f" ] || { gap symlink-not-read; return 0; }
  [ -f "$f" ] || return 0
  [ -r "$f" ] || { gap permission-denied; return 0; }
  gap file-log-tail-sample
  case "$f" in
    *.gz) if command -v gzip >/dev/null 2>&1; then frame "$f" decompress_tail "$f"; else gap gzip-unavailable; fi ;;
    *) frame "$f" tail -c 1048576 "$f" ;;
  esac
}
collect_processes() {
  n=0
  for p in /proc/[0-9]*/exe; do
    n=$((n+1))
    [ "$n" -le 512 ] || { printf 'process list limited to 512 entries\\n' >&2; break; }
    printf '%s -> ' "$p"
    readlink "$p" || true
  done
}
inspect_journal() {
  if command -v journalctl >/dev/null 2>&1; then
    gap journal-limited-to-10000-entries
    if [ "$1" = ssh ]; then
      frame systemd-journal journalctl -u ssh -u sshd --since '${start}' --until '${end}' --utc --no-pager -o short-iso -n 10000
    else
      frame systemd-journal journalctl --since '${start}' --until '${end}' --utc --no-pager -o short-iso -n 10000
    fi
  else gap journal-unavailable; fi
}
${check.body}
printf 'KELLY_COLLECTION_END\\n'
`;
};
