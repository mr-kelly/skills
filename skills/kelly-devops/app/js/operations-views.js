import {
  actionById,
  actions,
  date,
  dateTime,
  daysLeftBadge,
  els,
  enumLabel,
  escapeHtml,
  expiries,
  filteredServices,
  loadState,
  metrics,
  money,
  notice,
  pct,
  render,
  services,
  sparkline,
  spend,
  state,
  statusBadge,
  statusDot,
  t,
  typeBadge,
  warnings,
} from "../app.js";
export function renderServices() {
  els.title.textContent = t("services");
  const rows = filteredServices();
  els.subtitle.textContent = `${rows.length} ${t("configured")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("services")}</th><th>${t("product")}</th><th>${t("url")}</th><th>${t("status")}</th><th class="num">${t("latency")}</th><th class="num">${t("uptime7d")}</th><th>${t("certDaysLeft")}</th><th>${t("lastCheck")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (service) => `
            <tr>
              <td><a href="#/services/${encodeURIComponent(service.service_id)}"><strong>${escapeHtml(service.name)}</strong></a></td>
              <td><span class="badge">${escapeHtml(service.product)}</span></td>
              <td class="muted mono">${escapeHtml(service.url)}</td>
              <td>${statusBadge(service.status)}</td>
              <td class="num">${service.status === "down" ? t("notAvailable") : `${Number(service.latency_ms || 0)} ms`}</td>
              <td class="num">${Number(service.uptime_7d || 0).toFixed(2)}%</td>
              <td>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</td>
              <td class="muted">${dateTime(service.last_check_at)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

export function renderServiceDetail() {
  const service = services().find((item) => item.service_id === state.route.id);
  if (!service) {
    renderServices();
    return;
  }
  els.title.textContent = service.name;
  els.subtitle.textContent = `${service.product} · ${service.url}`;
  const linkedAction = actions().find(
    (item) => item.target?.id === service.service_id || item.target?.service_id === service.service_id,
  );
  els.content.innerHTML = `
    ${notice()}
    ${service.warnings?.length ? `<div class="warnings">${service.warnings.map((message) => `<div class="warning"><strong>${escapeHtml(message)}</strong></div>`).join("")}</div>` : ""}
    <div class="metrics">
      <div class="metric"><span>${t("status")}</span><strong>${statusBadge(service.status)}</strong></div>
      <div class="metric"><span>${t("latency")}</span><strong>${service.status === "down" ? t("notAvailable") : `${Number(service.latency_ms || 0)} ms`}</strong></div>
      <div class="metric"><span>${t("uptime7d")}</span><strong>${Number(service.uptime_7d || 0).toFixed(2)}%</strong></div>
      <div class="metric"><span>${t("certDaysLeft")}</span><strong>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</strong></div>
    </div>
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("checkHistory")}</h2>
          ${sparkline(service.history)}
          <div class="history-list">
            ${(service.history || [])
              .slice(-6)
              .reverse()
              .map(
                (entry) => `
              <div class="history-row">
                <span>${statusDot(entry.status)}${dateTime(entry.at)}</span>
                <span class="num">${entry.status === "down" ? `HTTP ${entry.http_status || "—"}` : `${entry.latency_ms} ms`}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
        ${
          linkedAction
            ? `
          <div class="panel">
            <h2>${t("actions")}</h2>
            <a class="attention-row" href="#/actions/${encodeURIComponent(linkedAction.action_id)}">
              <span><strong>${t("actionRef")} #${linkedAction.ref} · ${escapeHtml(linkedAction.title)}</strong><small>${escapeHtml(linkedAction.reason)}</small></span>
              ${statusBadge(linkedAction.status)}
            </a>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("cert")}</h2>
        <dl>
          <dt>${t("issuer")}</dt><dd>${escapeHtml(service.ssl?.issuer || t("notAvailable"))}</dd>
          <dt>${t("expiresOn")}</dt><dd>${service.ssl?.valid_to ? date(service.ssl.valid_to) : t("notAvailable")}</dd>
          <dt>${t("daysLeft")}</dt><dd>${service.ssl ? daysLeftBadge(service.ssl.days_left) : t("notAvailable")}</dd>
        </dl>
        <h2>${t("metadata")}</h2>
        <dl>
          <dt>HTTP</dt><dd>${escapeHtml(String(service.meta?.http_status ?? t("notAvailable")))}</dd>
          <dt>Server</dt><dd>${escapeHtml(service.meta?.server || t("notAvailable"))}</dd>
          <dt>${t("lastCheck")}</dt><dd>${dateTime(service.last_check_at)}</dd>
          ${service.meta?.note ? `<dt>${t("note")}</dt><dd>${escapeHtml(service.meta.note)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function filteredExpiries() {
  const query = state.query.trim().toLowerCase();
  const rows = [...expiries()].sort((a, b) => Number(a.days_left) - Number(b.days_left));
  if (!query) return rows;
  return rows.filter((item) =>
    [item.item, item.product, item.type, item.registrar, item.detail]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderExpiries() {
  els.title.textContent = t("expiries");
  const rows = filteredExpiries();
  const expiring = rows.filter((item) => Number(item.days_left) <= 30).length;
  els.subtitle.textContent = `${rows.length} ${t("expiries").toLowerCase()} · ${expiring} ${t("expiring")}`;
  els.content.innerHTML = `
    ${notice()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("item")}</th><th>${t("product")}</th><th>${t("type")}</th><th>${t("expiresOn")}</th><th>${t("daysLeft")}</th><th>${t("autoRenew")}</th><th>${t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (item) => `
            <tr>
              <td><a href="#/expiries/${encodeURIComponent(item.expiry_id)}"><strong>${escapeHtml(item.item)}</strong></a></td>
              <td><span class="badge">${escapeHtml(item.product)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td>${date(item.expires_on)}</td>
              <td>${daysLeftBadge(item.days_left)}</td>
              <td>${item.auto_renew ? "✓" : "—"}</td>
              <td>${item.action_id ? actionLink(item.action_id) : `<span class="muted">${t("notAvailable")}</span>`}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function actionLink(actionId) {
  const action = actionById(actionId);
  if (!action) return `<span class="muted">${t("notAvailable")}</span>`;
  return `<a class="badge action-link" href="#/actions/${encodeURIComponent(actionId)}">${t("actionRef")} #${action.ref} · ${escapeHtml(enumLabel(action.status))}</a>`;
}

export function renderExpiryDetail() {
  const item = expiries().find((row) => row.expiry_id === state.route.id);
  if (!item) {
    renderExpiries();
    return;
  }
  els.title.textContent = item.item;
  els.subtitle.textContent = `${enumLabel(item.type, "type")} · ${item.product}`;
  els.content.innerHTML = `
    ${notice()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("guidance")}</h2>
          <p class="guidance">${escapeHtml(item.detail || t("notAvailable"))}</p>
          ${item.action_id ? `<div class="guidance-action">${actionLink(item.action_id)}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("expiries")}</h2>
        <dl>
          <dt>${t("type")}</dt><dd>${typeBadge(item.type)}</dd>
          <dt>${t("expiresOn")}</dt><dd>${date(item.expires_on)}</dd>
          <dt>${t("daysLeft")}</dt><dd>${daysLeftBadge(item.days_left)}</dd>
          <dt>${t("autoRenew")}</dt><dd>${item.auto_renew ? "✓" : "—"}</dd>
          ${item.registrar ? `<dt>${t("registrar")}</dt><dd>${escapeHtml(item.registrar)}</dd>` : ""}
          <dt>${t("source")}</dt><dd>${escapeHtml(item.source || "")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

export function renderSpend() {
  els.title.textContent = t("spend");
  const data = spend();
  const anomalies = data.providers.filter((row) => row.anomaly).length;
  els.subtitle.textContent = `${money(metrics().spend_mtd)} ${t("mtd").toLowerCase()} · ${anomalies} ${t("anomalies")}`;
  els.content.innerHTML = `
    ${notice()}
    <div class="spend-grid">
      ${data.providers
        .map(
          (row) => `
        <div class="spend-card ${row.anomaly ? "anomaly" : ""}">
          <div class="row between">
            <strong>${escapeHtml(row.name)}</strong>
            ${row.anomaly ? `<span class="days-badge crit">${t("anomaly")}</span>` : ""}
          </div>
          <div class="balance">${money(row.mtd, row.currency)}</div>
          <div class="muted">${t("lastMonth")} ${money(row.last_month, row.currency)} · <span class="${Number(row.delta_pct) > 0 ? "negative" : "positive"}">${pct(row.delta_pct)}</span></div>
          ${row.note ? `<div class="muted spend-note">${escapeHtml(row.note)}</div>` : ""}
          ${row.action_id ? `<div>${actionLink(row.action_id)}</div>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="panel">
      <h2>${t("allocation")}</h2>
      <div class="table-wrap inset">
        <table class="compact">
          <thead>
            <tr><th>${t("product")}</th><th class="num">${t("mtd")}</th><th class="num">${t("lastMonth")}</th><th class="num">${t("delta")}</th><th class="num">${t("share")}</th></tr>
          </thead>
          <tbody>
            ${data.products
              .map((row) => {
                const delta =
                  Number(row.last_month) > 0
                    ? ((Number(row.mtd) - Number(row.last_month)) / Number(row.last_month)) * 100
                    : 0;
                return `
                <tr>
                  <td><strong>${escapeHtml(row.product)}</strong></td>
                  <td class="num">${money(row.mtd, row.currency)}</td>
                  <td class="num">${money(row.last_month, row.currency)}</td>
                  <td class="num ${delta > 0 ? "negative" : "positive"}">${pct(delta)}</td>
                  <td class="num">${Number(row.share_pct || 0)}%</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function filteredActions() {
  const query = state.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...actions()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    [item.title, item.reason, item.type, item.status, item.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderActions() {
  els.title.textContent = t("actionsQueue");
  const rows = filteredActions();
  const review = rows.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${rows.length} ${t("actions").toLowerCase()} · ${review} ${t("needDecision")}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <div class="action-list">
      ${rows
        .map(
          (item) => `
        <a class="action-card" href="#/actions/${encodeURIComponent(item.action_id)}">
          <div class="action-card-head">
            <span class="action-ref">${t("actionRef")} #${item.ref}</span>
            ${typeBadge(item.type)}
            ${statusBadge(item.status)}
          </div>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="muted">${escapeHtml(item.reason)}</span>
          ${item.decision?.note ? `<span class="action-note">“${escapeHtml(item.decision.note)}”</span>` : ""}
        </a>
      `,
        )
        .join("")}
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function lockBanner() {
  const lock = state.settings?.lock;
  if (!lock) return "";
  return `<div class="warnings"><div class="warning"><strong>${t("lockActive")}</strong><span>${escapeHtml(lock.owner || "")}: ${escapeHtml(lock.message || "")}</span></div></div>`;
}

export function renderActionDetail() {
  const action = actionById(state.route.id);
  if (!action) {
    renderActions();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = `${t("actionRef")} #${action.ref} · ${action.title}`;
  els.subtitle.textContent = `${enumLabel(action.type, "type")} · ${enumLabel(action.status)}`;
  const target = action.target || {};
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("reason")}</h2>
          <p class="guidance">${escapeHtml(action.reason)}</p>
        </div>
        <div class="panel">
          <h2>${t("evidence")}</h2>
          <ul class="evidence-list">
            ${(action.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>
        <div class="panel">
          <h2>${t("plan")}</h2>
          <ol class="plan-list">
            ${(action.plan || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ol>
        </div>
        <div class="panel">
          <h2>${t("note")}</h2>
          <textarea id="action-note" rows="3" placeholder="${t("notePlaceholder")}" ${locked ? "disabled" : ""}>${escapeHtml(action.note || "")}</textarea>
          <div class="decision-actions">
            <button type="button" class="primary" data-verdict="approve" ${locked ? "disabled" : ""} title="${t("approve")}">${t("approve")}</button>
            <button type="button" data-verdict="request_changes" ${locked ? "disabled" : ""} title="${t("requestChanges")}">${t("requestChanges")}</button>
            <button type="button" class="danger" data-verdict="block" ${locked ? "disabled" : ""} title="${t("block")}">${t("block")}</button>
            <button type="button" data-verdict="note" ${locked ? "disabled" : ""} title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("decision")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(action.status)}</dd>
          ${
            action.decision
              ? `
            <dt>${t("decision")}</dt><dd>${escapeHtml(
              enumLabel(
                action.decision.verdict === "approve"
                  ? "approved"
                  : action.decision.verdict === "block"
                    ? "blocked"
                    : action.decision.verdict === "note"
                      ? "note"
                      : "changes_requested",
              ),
            )}</dd>
            <dt>${t("generated")}</dt><dd>${dateTime(action.decision.decided_at)}</dd>
          `
              : ""
          }
        </dl>
        <h2>${t("target")}</h2>
        <dl>
          ${
            Object.entries(target)
              .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd class="mono">${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("notAvailable")}</dd>`
          }
        </dl>
      </aside>
    </section>
  `;
  els.content.querySelectorAll("[data-verdict]").forEach((button) => {
    button.addEventListener("click", () => submitDecision(action.action_id, button.dataset.verdict));
  });
}

async function submitDecision(actionId, verdict) {
  const note = els.content.querySelector("#action-note")?.value || "";
  if (state.settings?.demo) {
    const action = actionById(actionId);
    if (action) {
      if (verdict !== "note") {
        action.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      action.note = note;
      action.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_id: actionId, verdict, note }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Decision failed: ${res.status}`);
    state.notice = t("decisionSaved");
    await loadState();
  } catch (error) {
    state.notice = error.message;
    render();
  }
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    ${notice()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd class="mono">${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("services")}</h2>
        ${
          (summary.services || [])
            .map(
              (service) => `
          <div class="settings-row">
            <strong>${escapeHtml(service.name)}</strong>
            <span>${escapeHtml(service.product || "")}</span>
            <span class="mono muted">${escapeHtml(service.url || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("domains")}</h2>
        ${
          (summary.domains || [])
            .map(
              (domain) => `
          <div class="settings-row">
            <strong>${escapeHtml(domain.domain)}</strong>
            <span>${escapeHtml(domain.registrar || "")}</span>
            <span>${t("autoRenew")}: ${domain.auto_renew ? "✓" : "—"}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("keyRotation")}</h2>
        ${
          (summary.key_rotation || [])
            .map(
              (key) => `
          <div class="settings-row">
            <strong>${escapeHtml(key.name)}</strong>
            <span class="mono muted">${escapeHtml(key.env || "")}</span>
            <span>${key.env_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("billingSources")}</h2>
        ${
          (summary.billing_sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span class="mono muted">${escapeHtml((source.secret_envs || []).join(", "))}</span>
            <span>${source.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
