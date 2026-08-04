// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// demoServices/service/cert/demoExpiries/expiry/demoSpend/spendRow/
// productRow/demoActions/action/demoEvents/event/localizeSnapshotZh below are
// ported verbatim (same ids, same copy, same order of operations) from the
// retired app/server/demo.ts; only the metrics computation and the
// ssl_cert-from-services synthesis now go through devops-model.js's
// recomputeMetrics()/certExpiriesFromServices() (the same formulas demo.ts
// inlined) so the two never drift apart.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { certExpiriesFromServices, recomputeMetrics } from "../devops-model.js?v=0.1.0";

const now = "2026-07-02T09:30:00.000Z";
const nowMs = Date.parse(now);

function demoSnapshot(scenario) {
  const services = demoServices();
  const expiries = [...demoExpiries(), ...certExpiriesFromServices(services, nowMs)];
  const actions = demoActions();
  const events = demoEvents();
  const spend = demoSpend();
  const snapshot = {
    schema_version: "1",
    generated_at: now,
    source: "kelly-devops-demo",
    currency: "USD",
    checks: {
      services_checked_at: now,
      domains_checked_at: "2026-07-02T07:30:00.000Z",
      spend_ingested_at: "2026-07-02T03:15:00.000Z",
    },
    metrics: {},
    services,
    expiries,
    spend,
    actions,
    events,
    warnings: ["services", "overview"].includes(scenario)
      ? [
          {
            id: "hooks-down",
            severity: "error",
            service_id: "relayapi-hooks",
            message: "RelayAPI Webhooks has returned HTTP 503 for the last 3 checks.",
            detail: "Demo warning, no live endpoints were probed.",
          },
        ]
      : [],
  };
  return recomputeMetrics(snapshot, {
    expiry_warning_days: 30,
    expiry_critical_days: 7,
    degraded_latency_ms: 1500,
    spend_anomaly_pct: 40,
  });
}

function demoServices() {
  return [
    service(
      "formkit-web",
      "FormKit Web App",
      "FormKit",
      "https://formkit.io",
      "up",
      182,
      99.98,
      cert("Let's Encrypt R11", "2026-09-03"),
      200,
      [168, 175, 181, 172, 190, 178, 185, 174, 169, 188, 176, 182],
    ),
    service(
      "formkit-api",
      "FormKit API",
      "FormKit",
      "https://api.formkit.io/health",
      "up",
      121,
      100,
      cert("Let's Encrypt R11", "2026-09-03"),
      200,
      [118, 112, 126, 120, 115, 129, 122, 117, 124, 119, 116, 121],
    ),
    service(
      "formkit-dash",
      "FormKit Dashboard",
      "FormKit",
      "https://dash.formkit.io",
      "up",
      243,
      99.95,
      cert("Let's Encrypt R11", "2026-09-03"),
      200,
      [231, 246, 238, 252, 229, 241, 236, 249, 233, 244, 239, 243],
    ),
    service(
      "docsly-web",
      "Docsly Web",
      "Docsly",
      "https://docsly.app",
      "up",
      205,
      99.9,
      cert("Google Trust Services WE1", "2026-08-12"),
      200,
      [196, 210, 201, 214, 198, 207, 203, 216, 199, 209, 202, 205],
    ),
    service(
      "docsly-cdn",
      "Docsly CDN",
      "Docsly",
      "https://cdn.docsly.app/ping",
      "degraded",
      2280,
      99.42,
      cert("Google Trust Services WE1", "2026-08-12"),
      200,
      [242, 251, 246, 380, 940, 1480, 1820, 2110, 2350, 2190, 2410, 2280],
    ),
    service(
      "relayapi-web",
      "RelayAPI Site",
      "RelayAPI",
      "https://relayapi.dev",
      "up",
      130,
      100,
      cert("Let's Encrypt R10", "2026-09-14"),
      200,
      [124, 133, 127, 138, 125, 131, 128, 136, 126, 132, 129, 130],
    ),
    service(
      "relayapi-api",
      "RelayAPI Core API",
      "RelayAPI",
      "https://api.relayapi.dev/v1/health",
      "up",
      96,
      99.99,
      cert("Let's Encrypt R10", "2026-09-14"),
      200,
      [92, 98, 94, 101, 91, 97, 93, 100, 95, 99, 94, 96],
    ),
    service(
      "relayapi-hooks",
      "RelayAPI Webhooks",
      "RelayAPI",
      "https://hooks.relayapi.dev/health",
      "down",
      0,
      97.21,
      cert("Let's Encrypt R10", "2026-09-14"),
      503,
      [108, 112, 105, 116, 109, 114, 107, 111, 0, 0, 0, 0],
    ),
    service(
      "relayapi-status",
      "RelayAPI Status Page",
      "RelayAPI",
      "https://status.relayapi.dev",
      "up",
      111,
      99.97,
      cert("Let's Encrypt R10", "2026-07-22"),
      200,
      [104, 113, 107, 118, 105, 112, 108, 116, 106, 114, 109, 111],
    ),
  ];
}

function service(service_id, name, product, url, status, latency_ms, uptime_7d, ssl, http_status, latencies) {
  const history = latencies.map((value, index) => {
    const at = new Date(Date.parse(now) - (latencies.length - 1 - index) * 30 * 60 * 1000).toISOString();
    const failed = value === 0;
    return {
      at,
      status: failed ? "down" : value >= 1500 ? "degraded" : "up",
      latency_ms: value,
      http_status: failed ? 503 : 200,
    };
  });
  const sslDaysLeft = ssl ? Math.ceil((Date.parse(ssl.valid_to) - nowMs) / (24 * 60 * 60 * 1000)) : null;
  return {
    service_id,
    name,
    product,
    url,
    status,
    latency_ms,
    uptime_7d,
    ssl: ssl ? { ...ssl, days_left: sslDaysLeft } : null,
    last_check_at: now,
    history,
    meta: {
      http_status,
      server: status === "down" ? "" : "cloudflare",
      note: status === "down" ? "Last successful check 2 hours ago." : "",
    },
    warnings:
      status === "down"
        ? ["Endpoint returned HTTP 503 for the last 3 checks."]
        : status === "degraded"
          ? ["Latency above the 1500 ms degraded threshold since 06:00 UTC."]
          : sslDaysLeft !== null && sslDaysLeft <= 30
            ? [`TLS certificate expires in ${sslDaysLeft} days and no renewal has been observed.`]
            : [],
  };
}

function cert(issuer, valid_to) {
  return { issuer, valid_to: `${valid_to}T12:00:00.000Z` };
}

function demoExpiries() {
  return [
    expiry(
      "domain-formkit-io",
      "domain",
      "formkit.io",
      "FormKit",
      "2026-07-11",
      false,
      "rdap",
      "Namecheap",
      "Primary product domain. Renew at Namecheap; auto-renew is off because the card on file expired.",
    ),
    expiry(
      "plan-vercel-pro",
      "plan_renewal",
      "Vercel Pro (Docsly)",
      "Docsly",
      "2026-07-28",
      true,
      "config",
      "",
      "Annual plan renews automatically on the team card. Confirm the card is current.",
    ),
    expiry(
      "key-relayapi-sendgrid",
      "api_key_rotation",
      "RELAYAPI_SENDGRID_KEY",
      "RelayAPI",
      "2026-05-21",
      false,
      "config",
      "",
      "Rotation policy is 90 days; the key is 132 days old. Rotate in SendGrid, then update the env var.",
    ),
    expiry(
      "domain-docsly-io",
      "domain",
      "docsly.io",
      "Docsly",
      "2026-08-30",
      false,
      "rdap",
      "GoDaddy",
      "Redirect domain. Registrar account access is pending a 2FA reset.",
    ),
    expiry(
      "domain-formkit-dev",
      "domain",
      "formkit.dev",
      "FormKit",
      "2026-10-02",
      true,
      "rdap",
      "Namecheap",
      "Docs subdomain host. Auto-renew is on.",
    ),
    expiry(
      "domain-relayapi-dev",
      "domain",
      "relayapi.dev",
      "RelayAPI",
      "2026-11-08",
      true,
      "rdap",
      "Cloudflare Registrar",
      "Auto-renew is on at Cloudflare Registrar.",
    ),
    expiry(
      "domain-docsly-app",
      "domain",
      "docsly.app",
      "Docsly",
      "2027-01-15",
      true,
      "rdap",
      "Cloudflare Registrar",
      "Auto-renew is on at Cloudflare Registrar.",
    ),
    expiry(
      "domain-kellyhq-com",
      "domain",
      "kellyhq.com",
      "Portfolio",
      "2027-03-21",
      true,
      "rdap",
      "Namecheap",
      "Personal portfolio domain. Auto-renew is on.",
    ),
  ];
}

function expiry(expiry_id, type, item, product, expires_on, auto_renew, source, registrar, detail) {
  const days_left = Math.ceil((Date.parse(`${expires_on}T12:00:00.000Z`) - nowMs) / (24 * 60 * 60 * 1000));
  return {
    expiry_id,
    type,
    item,
    product,
    expires_on,
    days_left,
    auto_renew,
    action_id: "",
    source,
    registrar,
    detail,
  };
}

function demoSpend() {
  return {
    currency: "USD",
    providers: [
      spendRow("aws", "AWS", 1243.18, 1310.45, "EC2, RDS, S3 for RelayAPI and FormKit."),
      spendRow(
        "gcp",
        "Google Cloud",
        812.4,
        501.42,
        "Cloud Run egress and BigQuery scans jumped after the June 24 deploy.",
      ),
      spendRow("cloudflare", "Cloudflare", 89.6, 84.1, "Workers, R2, and registrar fees."),
    ],
    products: [
      productRow("relayapi", "RelayAPI", 1244.48, 987.87),
      productRow("formkit", "FormKit", 512.3, 545.2),
      productRow("docsly", "Docsly", 388.4, 362.9),
    ],
  };
}

function spendRow(provider_id, name, mtd, last_month, note) {
  const deltaPct = last_month > 0 ? Math.round(((mtd - last_month) / last_month) * 10000) / 100 : 0;
  return {
    provider_id,
    name,
    currency: "USD",
    mtd,
    last_month,
    delta_pct: deltaPct,
    anomaly: last_month > 0 && mtd > last_month * 1.4,
    action_id: last_month > 0 && mtd > last_month * 1.4 ? "act-investigate-gcp" : "",
    note,
  };
}

function productRow(product_id, product, mtd, last_month) {
  const totalMtd = 1244.48 + 512.3 + 388.4;
  return {
    product_id,
    product,
    currency: "USD",
    mtd,
    last_month,
    share_pct: Math.round((mtd / totalMtd) * 100),
  };
}

function demoActions() {
  return [
    action(
      "act-renew-formkit",
      1,
      "renew_domain",
      "Renew formkit.io before July 11",
      "needs_review",
      "formkit.io expires in 9 days and auto-renew is off because the registrar card expired.",
      [
        "RDAP expiration event: 2026-07-11 (checked 2026-07-02 07:30 UTC).",
        "Namecheap auto-renew disabled since 2026-06-14 (payment failure email).",
        "formkit.io serves the FormKit app, API, and all customer form links.",
      ],
      [
        "Update the payment card on the Namecheap account.",
        "Renew formkit.io for 2 years (~US$78).",
        "Re-enable auto-renew and confirm the renewal email.",
      ],
      { kind: "domain", id: "formkit.io", registrar: "Namecheap" },
      "",
      null,
    ),
    action(
      "act-rotate-sendgrid",
      2,
      "rotate_key",
      "Rotate the RelayAPI SendGrid API key",
      "needs_review",
      "RELAYAPI_SENDGRID_KEY is 132 days old; rotation policy is 90 days.",
      [
        "Key created 2026-02-20 per SendGrid API key metadata.",
        "Rotation policy in config: rotate_every_days = 90.",
        "The key has full-access scope; a scoped mail-send key would be safer.",
      ],
      [
        "Create a new scoped mail-send key in SendGrid.",
        "Update RELAYAPI_SENDGRID_KEY in the RelayAPI production env.",
        "Verify outbound email, then delete the old key.",
      ],
      { kind: "api_key", id: "RELAYAPI_SENDGRID_KEY", provider: "sendgrid" },
      "",
      null,
    ),
    action(
      "act-investigate-gcp",
      3,
      "investigate_spend",
      "Investigate the GCP spend spike (+62% MTD)",
      "changes_requested",
      "GCP month-to-date is US$812.40 vs US$501.42 last month, above the 40% anomaly threshold.",
      [
        "Billing export shows Cloud Run egress up 3.1x since the June 24 RelayAPI deploy.",
        "BigQuery on-demand scans doubled in the same window.",
        "No new customers large enough to explain the jump.",
      ],
      [
        "Pull per-service GCP cost breakdown for June 20 to July 2.",
        "Diff the June 24 RelayAPI deploy for egress-heavy changes.",
        "Propose a budget alert at 120% of last month.",
      ],
      { kind: "spend", id: "gcp", provider: "gcp" },
      "Break it down per service and per day before I decide anything.",
      {
        verdict: "request_changes",
        note: "Break it down per service and per day before I decide anything.",
        decided_at: "2026-07-01T21:12:00.000Z",
      },
    ),
    action(
      "act-renew-docsly",
      4,
      "renew_domain",
      "Renew docsly.io redirect domain",
      "blocked",
      "docsly.io expires in 59 days; the GoDaddy account is locked behind a 2FA reset.",
      [
        "RDAP expiration event: 2026-08-30.",
        "GoDaddy 2FA points at a phone number that no longer exists.",
        "Domain only serves a 301 redirect to docsly.app, so risk is moderate.",
      ],
      [
        "Complete the GoDaddy account recovery / 2FA reset.",
        "Renew docsly.io for 1 year, or transfer it to Cloudflare Registrar.",
        "Turn auto-renew on wherever it lands.",
      ],
      { kind: "domain", id: "docsly.io", registrar: "GoDaddy" },
      "Waiting on GoDaddy support ticket #48211 for the 2FA reset.",
      {
        verdict: "block",
        note: "Waiting on GoDaddy support ticket #48211 for the 2FA reset.",
        decided_at: "2026-06-30T10:05:00.000Z",
      },
    ),
    action(
      "act-restart-hooks",
      5,
      "restart_service",
      "Restart the RelayAPI webhook worker",
      "approved",
      "hooks.relayapi.dev has returned HTTP 503 for 3 consecutive checks; the worker looks wedged after the queue backlog.",
      [
        "3 consecutive 503 responses starting 2026-07-02 08:00 UTC.",
        "Fly.io dashboard shows the worker VM at 100% memory.",
        "Customer webhooks are queueing; no data loss yet.",
      ],
      [
        "Restart the relayapi-hooks Fly.io machine.",
        "Watch the queue drain and confirm 200s on /health.",
        "Add a memory alert at 85% so this pages earlier.",
      ],
      { kind: "service", id: "relayapi-hooks", host: "fly.io" },
      "Approved. Restart it and add the memory alert.",
      {
        verdict: "approve",
        note: "Approved. Restart it and add the memory alert.",
        decided_at: "2026-07-02T08:40:00.000Z",
      },
    ),
    action(
      "act-ack-cdn",
      6,
      "ack_incident",
      "Acknowledge the Docsly CDN latency incident",
      "done",
      "cdn.docsly.app latency rose above 2s during the upstream provider's June 30 edge incident.",
      [
        "Latency climbed from ~250 ms to ~2.3 s starting 2026-06-30 22:00 UTC.",
        "Upstream provider status page confirmed an edge cache incident.",
        "No customer-facing errors, only slower asset loads.",
      ],
      [
        "Acknowledge the incident in the events feed.",
        "Keep the degraded badge until latency returns under 500 ms.",
        "Note the upstream incident link for the postmortem.",
      ],
      { kind: "incident", id: "evt-cdn-latency", service_id: "docsly-cdn" },
      "Acknowledged; upstream issue, nothing to do on our side.",
      {
        verdict: "approve",
        note: "Acknowledged; upstream issue, nothing to do on our side.",
        decided_at: "2026-07-01T09:20:00.000Z",
      },
    ),
  ];
}

function action(action_id, ref, type, title, status, reason, evidence, plan, target, note, decision) {
  return {
    action_id,
    ref,
    type,
    title,
    status,
    reason,
    evidence,
    plan,
    target,
    note,
    created_at: "2026-07-01T06:00:00.000Z",
    decision,
  };
}

function demoEvents() {
  return [
    event(
      "evt-hooks-down",
      "2026-07-02T08:00:00.000Z",
      "error",
      "incident",
      "RelayAPI Webhooks started returning HTTP 503.",
      "relayapi-hooks",
    ),
    event(
      "evt-service-check",
      "2026-07-02T09:30:00.000Z",
      "info",
      "check",
      "Service check completed: 7 up, 1 degraded, 1 down across 9 endpoints.",
      "",
    ),
    event(
      "evt-domain-check",
      "2026-07-02T07:30:00.000Z",
      "warning",
      "expiry",
      "Domain check: formkit.io expires in 9 days and auto-renew is off.",
      "",
    ),
    event(
      "evt-cert-status",
      "2026-07-02T07:30:00.000Z",
      "warning",
      "expiry",
      "TLS certificate for status.relayapi.dev expires in 20 days.",
      "relayapi-status",
    ),
    event(
      "evt-spend-anomaly",
      "2026-07-02T03:15:00.000Z",
      "warning",
      "spend",
      "GCP month-to-date spend is 62% above last month; anomaly flagged.",
      "",
    ),
    event(
      "evt-cdn-latency",
      "2026-06-30T22:04:00.000Z",
      "warning",
      "incident",
      "Docsly CDN latency degraded above 2s during an upstream edge incident.",
      "docsly-cdn",
    ),
    event(
      "evt-cdn-ack",
      "2026-07-01T09:20:00.000Z",
      "info",
      "action",
      "Action #6 acknowledged: Docsly CDN latency incident (upstream cause).",
      "docsly-cdn",
    ),
  ];
}

function event(event_id, at, severity, kind, message, service_id) {
  return { event_id, at, severity, kind, message, service_id };
}

function localizeSnapshotZh(snapshot) {
  const serviceWarnings = {
    "relayapi-hooks": ["该端点最近 3 次检查均返回 HTTP 503。"],
    "docsly-cdn": ["自 06:00 UTC 起延迟持续高于 1500 ms 降级阈值。"],
    "relayapi-status": ["TLS 证书将在 20 天后过期，尚未观察到自动续期。"],
  };
  snapshot.services = snapshot.services.map((service) => ({
    ...service,
    warnings: serviceWarnings[service.service_id] || service.warnings,
    meta: {
      ...service.meta,
      note: service.service_id === "relayapi-hooks" ? "最近一次成功检查在 2 小时前。" : service.meta.note,
    },
  }));
  const expiryDetails = {
    "domain-formkit-io": "主产品域名。请在 Namecheap 续费；因绑定的银行卡过期，自动续费已关闭。",
    "cert-relayapi-status": "Let's Encrypt 自动续期未触发。请检查状态页主机上的 certbot 定时任务。",
    "plan-vercel-pro": "年度套餐将用团队银行卡自动续费。请确认卡片有效。",
    "key-relayapi-sendgrid": "轮换策略为 90 天；该密钥已使用 132 天。请在 SendGrid 轮换后更新环境变量。",
    "domain-docsly-io": "跳转域名。注册商账户访问正在等待 2FA 重置。",
    "domain-formkit-dev": "文档子域名主机。自动续费已开启。",
    "domain-relayapi-dev": "已在 Cloudflare Registrar 开启自动续费。",
    "domain-docsly-app": "已在 Cloudflare Registrar 开启自动续费。",
    "domain-kellyhq-com": "个人作品集域名。自动续费已开启。",
  };
  snapshot.expiries = snapshot.expiries.map((item) => ({
    ...item,
    detail: expiryDetails[item.expiry_id] || item.detail,
  }));
  const spendNotes = {
    aws: "RelayAPI 与 FormKit 的 EC2、RDS、S3。",
    gcp: "6 月 24 日发布后 Cloud Run 出网流量与 BigQuery 扫描量激增。",
    cloudflare: "Workers、R2 与域名注册费用。",
  };
  snapshot.spend.providers = snapshot.spend.providers.map((row) => ({
    ...row,
    note: spendNotes[row.provider_id] || row.note,
  }));
  const actionText = {
    "act-renew-formkit": {
      title: "在 7 月 11 日前续费 formkit.io",
      reason: "formkit.io 将在 9 天后到期，且因注册商银行卡过期自动续费已关闭。",
    },
    "act-rotate-sendgrid": {
      title: "轮换 RelayAPI 的 SendGrid API 密钥",
      reason: "RELAYAPI_SENDGRID_KEY 已使用 132 天；轮换策略为 90 天。",
    },
    "act-investigate-gcp": {
      title: "排查 GCP 支出激增（月初至今 +62%）",
      reason: "GCP 月初至今支出 US$812.40，上月为 US$501.42，超过 40% 异常阈值。",
    },
    "act-renew-docsly": {
      title: "续费 docsly.io 跳转域名",
      reason: "docsly.io 将在 59 天后到期；GoDaddy 账户被 2FA 重置流程锁定。",
    },
    "act-restart-hooks": {
      title: "重启 RelayAPI Webhook 工作进程",
      reason: "hooks.relayapi.dev 连续 3 次检查返回 HTTP 503；队列积压后进程疑似卡死。",
    },
    "act-ack-cdn": {
      title: "确认 Docsly CDN 延迟事件",
      reason: "上游服务商 6 月 30 日边缘节点故障期间，cdn.docsly.app 延迟超过 2 秒。",
    },
  };
  snapshot.actions = snapshot.actions.map((item) => {
    const text = actionText[item.action_id];
    return text ? { ...item, title: text.title, reason: text.reason } : item;
  });
  const eventText = {
    "evt-hooks-down": "RelayAPI Webhooks 开始返回 HTTP 503。",
    "evt-service-check": "服务检查完成：9 个端点中 7 个正常、1 个降级、1 个宕机。",
    "evt-domain-check": "域名检查：formkit.io 将在 9 天后到期，且自动续费已关闭。",
    "evt-cert-status": "status.relayapi.dev 的 TLS 证书将在 20 天后过期。",
    "evt-spend-anomaly": "GCP 月初至今支出高于上月 62%，已标记异常。",
    "evt-cdn-latency": "上游边缘节点故障期间，Docsly CDN 延迟降级至 2 秒以上。",
    "evt-cdn-ack": "行动 #6 已确认：Docsly CDN 延迟事件（上游原因）。",
  };
  snapshot.events = snapshot.events.map((item) => ({
    ...item,
    message: eventText[item.event_id] || item.message,
  }));
  snapshot.warnings = snapshot.warnings.map((warning) => ({
    ...warning,
    message: "RelayAPI Webhooks 最近 3 次检查均返回 HTTP 503。",
    detail: "演示提醒，未探测任何真实端点。",
  }));
  return snapshot;
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const zh = activeLangIsZh();
    const snapshot = zh ? localizeSnapshotZh(demoSnapshot(scenario)) : demoSnapshot(scenario);
    const visuals = demoVisualsForApp("kelly-devops");
    return {
      demo: true,
      demo_scenario: scenario,
      app: "kelly-devops",
      data_provider: "demo",
      onboarding: { completed: true, completed_at: now, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-devops/config.json",
        is_example: false,
        thresholds: {
          expiry_warning_days: 30,
          expiry_critical_days: 7,
          degraded_latency_ms: 1500,
          spend_anomaly_pct: 40,
        },
        services: snapshot.services.map((service) => ({
          service_id: service.service_id,
          name: service.name,
          product: service.product,
          url: service.url,
        })),
        domains: snapshot.expiries
          .filter((item) => item.type === "domain")
          .map((item) => ({
            domain: item.item,
            product: item.product,
            registrar: item.registrar || "",
            auto_renew: item.auto_renew,
          })),
        key_rotation: snapshot.expiries
          .filter((item) => item.type === "api_key_rotation")
          .map((item) => ({ key_id: item.expiry_id, name: item.item, env: item.item, detail: item.detail })),
      },
      demo_visuals: visuals,
      snapshot: { ...snapshot, demo_visuals: visuals },
    };
  },

  async decideAction() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
