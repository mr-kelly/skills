import {
  OPP_FILTERS,
  deltaHtml,
  displayPath,
  els,
  enumLabel,
  escapeHtml,
  filteredOpportunities,
  n,
  opportunities,
  pct,
  pos1,
  render,
  siteName,
  state,
  statusBadge,
  t,
} from "../app.js";
export function renderOpportunities() {
  els.title.textContent = t("opportunities");
  const all = opportunities();
  const items = filteredOpportunities();
  els.subtitle.textContent = `${all.filter((item) => item.status === "needs_review").length} ${t("needsReview")}`;
  const locked = Boolean(state.settings?.lock);
  const chips = OPP_FILTERS.map((filter) => {
    const count = filter === "all" ? all.length : all.filter((item) => item.status === filter).length;
    const label = filter === "all" ? t("viewAll") : enumLabel(filter);
    return `<button type="button" class="chip ${state.oppFilter === filter ? "active" : ""}" data-opp-filter="${filter}" title="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`;
  }).join("");
  els.content.innerHTML = `
    ${locked ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    <div class="chip-row">${chips}</div>
    <div class="opp-list">
      ${items.map((item) => opportunityCard(item, locked)).join("") || `<div class="empty">${t("noOpportunities")}</div>`}
    </div>
  `;
}

function opportunityCard(item, locked) {
  const disabled = locked ? "disabled" : "";
  const targetBits = [
    item.target_page
      ? `<a class="external" href="${escapeHtml(item.target_page)}" target="_blank" rel="noreferrer">${escapeHtml(displayPath(item.target_page))}</a>`
      : "",
    item.target_query ? `<span class="badge">${escapeHtml(item.target_query)}</span>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `
    <article class="opp-card" data-opp-id="${escapeHtml(item.id)}">
      <header class="opp-head">
        <span class="opp-ref">${t("opportunity")} #${item.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
        ${statusBadge(item.status)}
        <span class="muted opp-site">${escapeHtml(siteName(item.site_id))}</span>
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      ${targetBits ? `<div class="opp-target"><span class="muted">${t("target")}:</span> ${targetBits}</div>` : ""}
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      <p class="opp-impact"><span class="muted">${t("expectedImpact")}:</span> ${escapeHtml(item.expected_impact)}</p>
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      <label class="opp-label" for="draft-${escapeHtml(item.id)}">${t("draft")}</label>
      <textarea id="draft-${escapeHtml(item.id)}" class="opp-draft" rows="6" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
      ${
        item.decision
          ? `
        <div class="opp-decision">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(decisionStatus(item.decision.action)))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        item.execution
          ? `
        <div class="opp-execution">
          <strong>${t("execution")}: ${escapeHtml(enumLabel(item.execution.operation, "operation"))} · ${escapeHtml(enumLabel(item.execution.status))}</strong>
          ${item.execution.detail ? `<span>${escapeHtml(item.execution.detail)}</span>` : ""}
        </div>
      `
          : ""
      }
      <label class="opp-label" for="note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="note-${escapeHtml(item.id)}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      <div class="opp-actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(item.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(item.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(item.id)}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(item.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
    </article>
  `;
}

export function decisionStatus(action) {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  if (action === "block") return "blocked";
  return "needs_review";
}

export async function submitDecision(id, action) {
  const note = document.querySelector(`#note-${cssEscape(id)}`)?.value || "";
  const draft = document.querySelector(`#draft-${cssEscape(id)}`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = { action, note, draft: draft ?? null, decided_at: new Date().toISOString() };
    render();
    return;
  }
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, action, note, draft }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    els.subtitle.textContent = body.error || `Decision failed: ${res.status}`;
    return;
  }
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  render();
}

export function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(value)
    : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function renderSites() {
  els.title.textContent = t("sites");
  const sites = state.snapshot?.sites || [];
  els.subtitle.textContent = `${sites.length} ${t("sites").toLowerCase()}`;
  els.content.innerHTML = sites.length
    ? `
    <div class="account-grid">
      ${sites
        .map(
          (site) => `
        <a class="account-card" href="#/overview" data-site-pick="${escapeHtml(site.site_id)}">
          <div class="row between"><strong>${escapeHtml(site.property_url)}</strong><span class="badge">${escapeHtml(enumLabel(site.verification_type, "verification"))}</span></div>
          <div class="muted">${t("permission")}: ${escapeHtml(site.permission_level || "unknown")} · ${t("lastSync")} ${escapeHtml(site.last_sync_at ? new Date(site.last_sync_at).toLocaleString() : "-")}</div>
          <div class="balance">${n(site.totals?.clicks)} <small class="muted">${t("clicks").toLowerCase()} / 28d</small></div>
          <div class="row stats">
            <span>${t("impressions")} ${n(site.totals?.impressions)}</span>
            <span>${t("ctr")} ${pct(site.totals?.ctr)}</span>
            <span>${t("avgPosition")} ${pos1(site.totals?.position)}</span>
          </div>
          <div class="row stats">
            <span>${deltaHtml(site.totals?.clicks, site.previous?.clicks)} ${t("clicks").toLowerCase()}</span>
            <span>${deltaHtml(site.totals?.position, site.previous?.position, { kind: "pos", invert: true })} ${t("position").toLowerCase()}</span>
          </div>
          <div class="status ${escapeHtml(site.status)}">${escapeHtml(enumLabel(site.status))}</div>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("setupNeeded")}</div>`;
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const auth = summary.auth || {};
  const sync = summary.sync || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("syncWindow")}</dt><dd>${escapeHtml(String(sync.window_days ?? 28))} ${t("days")} · row limit ${escapeHtml(String(sync.row_limit ?? 250))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("authMethod")}</h2>
        <dl>
          <dt>${t("authMethod")}</dt><dd>${escapeHtml(auth.method || "service_account")}</dd>
          <dt><code>${escapeHtml(auth.service_account_file_env || "")}</code></dt><dd>${auth.service_account_ready ? t("envReady") : t("envMissing")}</dd>
          <dt><code>${escapeHtml(auth.access_token_env || "")}</code></dt><dd>${auth.access_token_ready ? t("envReady") : t("envMissing")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sites")}</h2>
        ${
          (summary.sites || [])
            .map(
              (site) => `
          <div class="settings-account">
            <strong>${escapeHtml(site.property_url)}</strong>
            <span>${escapeHtml(site.site_id)}</span>
            <span>${escapeHtml(enumLabel(site.verification_type, "verification"))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
