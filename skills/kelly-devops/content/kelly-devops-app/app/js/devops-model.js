// Pure domain logic for kelly-devops. round2/pushEvent-style capping and the
// metrics formula are ported verbatim (same variable names, same order of
// operations, only TS types stripped) from the retired lib/common.ts's
// recomputeMetrics()/round2(). statusForVerdict is ported verbatim from the
// retired lib/data-provider/local-file-provider.ts's applyDecision()
// VERDICT_STATUS map. operationFor is ported verbatim from the retired
// scripts/execute_decisions.ts. daysLeftFrom/anomaly detection are ported
// verbatim from scripts/sync_domains.ts, scripts/check_services.ts, and
// scripts/ingest_spend.ts, adapted to compute from a stored `expires_on` /
// `mtd`+`last_month` at read time instead of a persisted `days_left`, so the
// ledger and spend anomaly flags are always fresh regardless of when a
// browser session loads them relative to the last check run.
//
// normalize*/buildSnapshot/buildConfigSummary are new: they turn Busabase
// services/expiries/spend_providers/spend_products/actions/events/settings
// rows (already snake_cased by the provider) into the DevopsSnapshot/
// ConfigSummary shapes documented in references/ops-schema.md.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const VERDICTS = new Set(["approve", "request_changes", "block", "note"]);

// Ported verbatim from the retired lib/data-provider/local-file-provider.ts's
// applyDecision(): VERDICT_STATUS. "note" never changes status.
export function statusForVerdict(verdict, currentStatus = "needs_review") {
  if (verdict === "approve") return "approved";
  if (verdict === "request_changes") return "changes_requested";
  if (verdict === "block") return "blocked";
  return currentStatus;
}

// Ported verbatim from the retired lib/common.ts.
export function round2(value = 0) {
  return Math.round(Number(value || 0) * 100) / 100;
}

// Ported from the retired scripts/sync_domains.ts / scripts/check_services.ts's
// day-math (`Math.ceil((expires - now) / DAY_MS)`), generalized to any
// expires_on-bearing row (domain/ssl_cert/api_key_rotation/plan_renewal) and
// computed at read time instead of persisted, so it is always fresh.
export function daysLeftFrom(expiresOn = "", now = Date.now()) {
  if (!expiresOn) return 9999;
  const parsed = Date.parse(expiresOn);
  if (Number.isNaN(parsed)) return 9999;
  return Math.ceil((parsed - now) / DAY_MS);
}

function parseJsonValue(value = "", fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toBool(value) {
  return value === true || value === "true";
}

// ---- Normalization: Busabase rows -> snapshot item shapes ----

export function normalizeService({
  service_id = "",
  name = "",
  product = "",
  url = "",
  status = "unknown",
  latency_ms = 0,
  uptime_7d = 0,
  ssl_issuer = "",
  ssl_valid_to = "",
  last_check_at = "",
  history = "",
  meta = "",
  warnings = "",
} = {}) {
  const ssl = ssl_valid_to ? { issuer: ssl_issuer, valid_to: ssl_valid_to, days_left: 0 } : null;
  return {
    service_id,
    name: name || service_id,
    product,
    url,
    status,
    latency_ms: Number(latency_ms) || 0,
    uptime_7d: Number(uptime_7d) || 0,
    ssl,
    last_check_at,
    history: parseJsonValue(history, []) || [],
    meta: parseJsonValue(meta, {}) || {},
    warnings: parseJsonValue(warnings, []) || [],
  };
}

export function normalizeExpiry({
  expiry_id = "",
  type = "domain",
  item = "",
  product = "",
  expires_on = "",
  auto_renew = "",
  registrar = "",
  source = "",
  detail = "",
} = {}) {
  return {
    expiry_id,
    type,
    item,
    product,
    expires_on,
    auto_renew: toBool(auto_renew),
    action_id: "",
    source,
    registrar,
    detail,
  };
}

export function normalizeSpendProvider({
  provider_id = "",
  name = "",
  currency = "USD",
  mtd = 0,
  last_month = 0,
  note = "",
} = {}) {
  return {
    provider_id,
    name: name || provider_id,
    currency,
    mtd: round2(mtd),
    last_month: round2(last_month),
    delta_pct: 0,
    anomaly: false,
    action_id: "",
    note,
  };
}

export function normalizeSpendProduct({
  product_id = "",
  product = "",
  currency = "USD",
  mtd = 0,
  last_month = 0,
} = {}) {
  return {
    product_id,
    product: product || product_id,
    currency,
    mtd: round2(mtd),
    last_month: round2(last_month),
    share_pct: 0,
  };
}

export function normalizeAction({
  action_id = "",
  ref = 0,
  type = "ack_incident",
  title = "",
  status = "needs_review",
  reason = "",
  evidence = "",
  plan = "",
  target = "",
  note = "",
  created_at = "",
  decision_verdict = "",
  decision_note = "",
  decided_at = "",
} = {}) {
  return {
    action_id,
    ref: Number(ref) || 0,
    type,
    title: title || "(untitled action)",
    status,
    reason,
    evidence: parseJsonValue(evidence, []) || [],
    plan: parseJsonValue(plan, []) || [],
    target: parseJsonValue(target, {}) || {},
    note,
    created_at,
    decision: decision_verdict ? { verdict: decision_verdict, note: decision_note, decided_at } : null,
  };
}

export function normalizeEvent({
  event_id = "",
  at = "",
  severity = "info",
  kind = "",
  message = "",
  service_id = "",
} = {}) {
  return { event_id, at, severity, kind, message, service_id };
}

// Cert expiry rows are derived from services[].ssl at build time (mirrors the
// retired scripts/check_services.ts's mergeCertExpiries(), just computed on
// read instead of persisted into a second copy of the same certificate data).
export function certExpiriesFromServices(services, now) {
  return services
    .filter((service) => service.ssl?.valid_to)
    .map((service) => {
      const daysLeft = daysLeftFrom(service.ssl.valid_to, now);
      return {
        expiry_id: `cert-${service.service_id}`,
        type: "ssl_cert",
        item: hostnameOf(service.url) || service.service_id,
        product: service.product || "",
        expires_on: service.ssl.valid_to,
        days_left: daysLeft,
        auto_renew: false,
        action_id: "",
        source: "tls",
        registrar: "",
        detail: `TLS certificate issued by ${service.ssl.issuer || "unknown CA"} expires in ${daysLeft} days. Check the automated renewal on this host.`,
      };
    });
}

function hostnameOf(url = "") {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Ported from the retired scripts/execute_decisions.ts's operationFor():
// maps an approved action card to the concrete operation the agent must
// perform outside the app. Pure function, no side effects.
export function operationFor(action) {
  const target = action.target || {};
  switch (action.type) {
    case "renew_domain":
      return {
        operation: "renew_domain",
        target: { domain: target.id || "", registrar: target.registrar || "" },
        note: `Renew ${target.id || "the domain"} at ${target.registrar || "the registrar"}; re-enable auto-renew.`,
      };
    case "rotate_key":
      return {
        operation: "rotate_key",
        target: { env_var: target.id || "", provider: target.provider || "" },
        note: `Create a replacement key at ${target.provider || "the provider"}, update env var ${target.id || ""}, verify, then revoke the old key.`,
      };
    case "investigate_spend":
      return {
        operation: "investigate_spend",
        target: { provider: target.provider || target.id || "" },
        note: `Pull a per-service cost breakdown for ${target.provider || target.id || "the provider"} and report findings.`,
      };
    case "restart_service":
      return {
        operation: "restart_service",
        target: { service_id: target.id || "", host: target.host || "" },
        note: `Restart ${target.id || "the service"}${target.host ? ` on ${target.host}` : ""} and confirm health returns to up.`,
      };
    case "ack_incident":
      return {
        operation: "ack_incident",
        target: { event_id: target.id || "", service_id: target.service_id || "" },
        note: "Record the acknowledgement in the events feed; no remote change.",
      };
    default:
      return { operation: action.type || "unknown", target, note: "Unrecognized action type; execute manually." };
  }
}

// Finds an action card whose target references the given kind/id, so the UI
// can link an expiry/service/spend row to its action card without every
// writer script also needing to stamp an action_id back onto that row.
function findActionId(actions, matches) {
  const hit = actions.find((action) => matches(action.target || {}));
  return hit ? hit.action_id : "";
}

// Ported verbatim (formula-wise) from the retired lib/common.ts's
// recomputeMetrics(), adapted to the browser-built snapshot shape (expiries
// already include the synthesized ssl_cert rows).
export function recomputeMetrics(snapshot = {}, thresholds = {}) {
  const warningDays = Number(thresholds.expiry_warning_days || 30);
  const services = Array.isArray(snapshot.services) ? snapshot.services : [];
  const expiries = Array.isArray(snapshot.expiries) ? snapshot.expiries : [];
  const actions = Array.isArray(snapshot.actions) ? snapshot.actions : [];
  const providers = Array.isArray(snapshot.spend?.providers) ? snapshot.spend.providers : [];
  const domains = expiries.filter((item) => item.type === "domain");
  const withCert = expiries.filter((item) => item.type === "ssl_cert");
  const certsExpiring = withCert.filter((item) => Number(item.days_left) <= warningDays).length;
  snapshot.metrics = {
    services_total: services.length,
    services_up: services.filter((service) => service.status === "up").length,
    services_degraded: services.filter((service) => service.status === "degraded").length,
    services_down: services.filter((service) => service.status === "down").length,
    certs_ok: withCert.length - certsExpiring,
    certs_expiring: certsExpiring,
    domains_ok: domains.filter((item) => Number(item.days_left) > warningDays).length,
    domains_expiring: domains.filter((item) => Number(item.days_left) <= warningDays).length,
    expiring_14d: expiries.filter((item) => Number(item.days_left) <= 14).length,
    actions_needing_review: actions.filter((action) => action.status === "needs_review").length,
    spend_mtd: round2(providers.reduce((sum, row) => sum + Number(row.mtd || 0), 0)),
    spend_last_month: round2(providers.reduce((sum, row) => sum + Number(row.last_month || 0), 0)),
    spend_anomalies: providers.filter((row) => row.anomaly).length,
  };
  return snapshot;
}

/**
 * @param {{
 *   services?: Array<Record<string, any>>,
 *   expiries?: Array<Record<string, any>>,
 *   spend_providers?: Array<Record<string, any>>,
 *   spend_products?: Array<Record<string, any>>,
 *   actions?: Array<Record<string, any>>,
 *   events?: Array<Record<string, any>>,
 *   settings?: Record<string, any>,
 *   now?: number,
 * }} [args]
 */
export function buildSnapshot({
  services = [],
  expiries = [],
  spend_providers = [],
  spend_products = [],
  actions = [],
  events = [],
  settings = {},
  now = Date.now(),
} = {}) {
  const thresholds = {
    expiry_warning_days: Number(settings.expiry_warning_days || 30),
    expiry_critical_days: Number(settings.expiry_critical_days || 7),
    degraded_latency_ms: Number(settings.degraded_latency_ms || 1500),
    spend_anomaly_pct: Number(settings.spend_anomaly_pct || 40),
  };

  const normalizedServices = services.map(normalizeService);
  const normalizedActions = actions.map(normalizeAction);

  const normalizedExpiries = expiries.map(normalizeExpiry).map((item) => ({
    ...item,
    days_left: daysLeftFrom(item.expires_on, now),
    action_id: findActionId(
      normalizedActions,
      (target) =>
        (item.type === "domain" && target.kind === "domain" && target.id === item.item) ||
        (item.type === "api_key_rotation" && target.kind === "api_key" && target.id === item.item),
    ),
  }));
  const certExpiries = certExpiriesFromServices(normalizedServices, now).map((item) => ({
    ...item,
    action_id: findActionId(normalizedActions, (target) => target.kind === "service" && target.id === item.item),
  }));
  const allExpiries = [...normalizedExpiries, ...certExpiries];

  const normalizedProviders = spend_providers.map(normalizeSpendProvider).map((row) => {
    const deltaPct = row.last_month > 0 ? round2(((row.mtd - row.last_month) / row.last_month) * 100) : 0;
    const anomaly = row.last_month > 0 && row.mtd > row.last_month * (1 + thresholds.spend_anomaly_pct / 100);
    return {
      ...row,
      delta_pct: deltaPct,
      anomaly,
      action_id: anomaly
        ? findActionId(normalizedActions, (target) => target.kind === "spend" && target.id === row.provider_id)
        : "",
    };
  });
  const totalMtd = round2(normalizedProviders.reduce((sum, row) => sum + row.mtd, 0));
  const normalizedProducts = spend_products.map(normalizeSpendProduct).map((row) => ({
    ...row,
    share_pct: totalMtd > 0 ? Math.round((row.mtd / totalMtd) * 100) : 0,
  }));

  const normalizedEvents = events
    .map(normalizeEvent)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 50);

  const latestAtFor = (kind) =>
    normalizedEvents
      .filter((event) => event.kind === kind)
      .reduce((latest, event) => (event.at > latest ? event.at : latest), "");

  const snapshot = {
    schema_version: "1",
    generated_at: new Date(now).toISOString(),
    source: "kelly-devops",
    currency: normalizedProviders[0]?.currency || "USD",
    checks: {
      services_checked_at: normalizedServices.reduce(
        (latest, s) => (s.last_check_at > latest ? s.last_check_at : latest),
        "",
      ),
      domains_checked_at: latestAtFor("expiry"),
      spend_ingested_at: latestAtFor("spend"),
    },
    metrics: {},
    services: normalizedServices,
    expiries: allExpiries,
    spend: {
      currency: normalizedProviders[0]?.currency || "USD",
      providers: normalizedProviders,
      products: normalizedProducts,
    },
    actions: normalizedActions,
    events: normalizedEvents,
    warnings:
      normalizedServices.length || allExpiries.length
        ? []
        : [
            {
              id: "no-snapshot",
              severity: "info",
              message: "No ops snapshot yet. Configure services and domains, then run the checks.",
            },
          ],
  };
  recomputeMetrics(snapshot, thresholds);
  return snapshot;
}

// Sanitized config summary for #/settings — thresholds plus the rosters
// derived from the same live Busabase rows the overview uses (no separate
// config store in the Busabase-only shape).
/**
 * @param {{ services?: Array<Record<string, any>>, expiries?: Array<Record<string, any>>, settings?: Record<string, any> }} [args]
 */
export function buildConfigSummary({ services = [], expiries = [], settings = {} } = {}) {
  const domains = expiries.filter((item) => item.type === "domain");
  const keyRotations = expiries.filter((item) => item.type === "api_key_rotation");
  return {
    config_path: "busabase",
    is_example: false,
    thresholds: {
      expiry_warning_days: Number(settings.expiry_warning_days || 30),
      expiry_critical_days: Number(settings.expiry_critical_days || 7),
      degraded_latency_ms: Number(settings.degraded_latency_ms || 1500),
      spend_anomaly_pct: Number(settings.spend_anomaly_pct || 40),
    },
    services: services.map((service) => ({
      service_id: service.service_id,
      name: service.name || service.service_id,
      product: service.product || "",
      url: service.url || "",
    })),
    domains: domains.map((item) => ({
      domain: item.item,
      product: item.product || "",
      registrar: item.registrar || "",
      auto_renew: toBool(item.auto_renew),
    })),
    key_rotation: keyRotations.map((item) => ({
      key_id: item.expiry_id,
      name: item.item,
      env: item.item,
      detail: item.detail || "",
    })),
  };
}
