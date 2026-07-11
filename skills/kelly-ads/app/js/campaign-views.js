import {
  acosBadge,
  adjTypeBadge,
  adjustmentById,
  adjustments,
  ageOf,
  anomalies,
  anomalyById,
  budgetBar,
  campaignById,
  campaignChart,
  dateTime,
  els,
  enumLabel,
  escapeHtml,
  filteredCampaigns,
  loadState,
  lockBanner,
  money,
  notice,
  platformBadge,
  render,
  state,
  statusBadge,
  t,
  trendArrow,
  typeBadge,
  warnings,
} from "../app.js";
export function renderCampaigns() {
  els.title.textContent = t("campaigns");
  const rows = filteredCampaigns();
  els.subtitle.textContent = `${rows.length} ${t("configured")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("campaign")}</th><th>${t("platform")}</th><th>${t("status")}</th><th class="budget-cell">${t("dailyBudget")}</th><th class="num">${t("spend7d")}</th><th class="num">${t("roas7d")}</th><th>${t("acos7d")}</th><th>${t("trend")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (campaign) => `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(campaign.campaign_id)}"><strong>${escapeHtml(campaign.name)}</strong></a><div class="muted">${escapeHtml(campaign.product || "")}${campaign.sku ? ` · ${escapeHtml(campaign.sku)}` : ""}</div></td>
              <td>${platformBadge(campaign.platform)}</td>
              <td>${statusBadge(campaign.status)}</td>
              <td class="budget-cell">${money(campaign.daily_budget, campaign.currency)} <span class="muted">· ${Number(campaign.budget_spent_today_pct || 0)}% ${t("spentToday")}</span>${budgetBar(campaign.budget_spent_today_pct)}</td>
              <td class="num">${money(campaign.totals_7d?.spend, campaign.currency)}</td>
              <td class="num">${Number(campaign.totals_7d?.roas || 0).toFixed(2)}</td>
              <td>${acosBadge(campaign.totals_7d?.acos_pct, campaign.acos_target_pct)}</td>
              <td>${trendArrow(campaign.trend)}</td>
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

function targetsTable(campaign) {
  const rows = campaign.targets || [];
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap inset">
      <table class="compact">
        <thead>
          <tr>
            <th>${t("term")}</th><th>${t("type")}</th><th>${t("state")}</th><th class="num">${t("spend")} 14d</th><th class="num">${t("clicks")}</th><th class="num">${t("conversions")}</th><th class="num">${t("revenue")}</th><th class="num">${t("cpc")}</th><th class="num">${t("acos")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (target) => `
            <tr>
              <td><strong>${escapeHtml(target.text)}</strong>${target.match_type ? `<div class="muted">${escapeHtml(target.match_type)}</div>` : ""}</td>
              <td><span class="badge">${escapeHtml(enumLabel(target.type, "targettype"))}</span></td>
              <td>${statusBadge(target.state)}</td>
              <td class="num">${money(target.spend_14d, campaign.currency)}</td>
              <td class="num">${Number(target.clicks || 0)}</td>
              <td class="num ${Number(target.conversions || 0) === 0 ? "negative" : ""}">${Number(target.conversions || 0)}</td>
              <td class="num">${money(target.revenue, campaign.currency)}</td>
              <td class="num">${money(target.cpc, campaign.currency)}</td>
              <td class="num">${Number(target.revenue) > 0 ? `${Number(target.acos_pct || 0).toFixed(1)}%` : t("notAvailable")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adjustmentCard(item) {
  return `
    <a class="action-card" href="#/adjustments/${encodeURIComponent(item.adjustment_id)}">
      <div class="action-card-head">
        <span class="action-ref">${t("adjustmentRef")} #${item.ref}</span>
        ${adjTypeBadge(item.type)}
        ${platformBadge(item.platform)}
        ${statusBadge(item.status)}
      </div>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="value-line"><b>${escapeHtml(item.current_value)}</b> → <b>${escapeHtml(item.proposed_value)}</b></span>
      <span class="muted">${escapeHtml(item.reason)}</span>
      ${item.decision?.note ? `<span class="action-note">“${escapeHtml(item.decision.note)}”</span>` : ""}
    </a>
  `;
}

export function renderCampaignDetail() {
  const campaign = campaignById(state.route.id);
  if (!campaign) {
    renderCampaigns();
    return;
  }
  els.title.textContent = campaign.name;
  els.subtitle.textContent = `${enumLabel(campaign.platform, "platform")} · ${campaign.product || ""} · ${enumLabel(campaign.status)}`;
  const linkedAnomalies = anomalies().filter((item) => item.campaign_id === campaign.campaign_id);
  const linkedAdjustments = adjustments().filter(
    (item) => item.campaign_id === campaign.campaign_id || item.target?.id === campaign.campaign_id,
  );
  const totals = campaign.totals_7d || {};
  els.content.innerHTML = `
    ${notice()}
    ${warnings(campaign.campaign_id)}
    <div class="metrics">
      <div class="metric"><span>${t("spend7d")}</span><strong>${money(totals.spend, campaign.currency)}</strong><small>${t("cpc")} ${money(totals.cpc, campaign.currency)}</small></div>
      <div class="metric"><span>${t("roas7d")}</span><strong>${Number(totals.roas || 0).toFixed(2)}</strong><small>${t("revenue")} ${money(totals.revenue, campaign.currency)}</small></div>
      <div class="metric"><span>${t("acos7d")}</span><strong>${acosBadge(totals.acos_pct, campaign.acos_target_pct)}</strong><small>${t("acosTarget")} ${Number(campaign.acos_target_pct || 0).toFixed(0)}%</small></div>
      <div class="metric"><span>${t("conversions")}</span><strong>${Number(totals.conversions || 0)}</strong><small>${Number(totals.clicks || 0)} ${t("clicks").toLowerCase()} · ${Number(totals.impressions || 0).toLocaleString()} ${t("impressions").toLowerCase()}</small></div>
    </div>
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("dailySeries")}</h2>
          ${campaignChart(campaign)}
        </div>
        <div class="panel">
          <h2>${t("topTargets")}</h2>
          ${targetsTable(campaign)}
        </div>
        ${
          linkedAnomalies.length
            ? `
          <div class="panel">
            <h2>${t("linkedAnomalies")}</h2>
            ${linkedAnomalies
              .map(
                (item) => `
              <a class="attention-row" href="#/alerts">
                <span><strong>${escapeHtml(enumLabel(item.type, "type"))}</strong><small>${escapeHtml(item.evidence)}</small></span>
                <span class="badges">${statusBadge(item.severity)}${statusBadge(item.state)}</span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          linkedAdjustments.length
            ? `
          <div class="panel">
            <h2>${t("adjustmentHistory")}</h2>
            <div class="action-list">
              ${linkedAdjustments.map((item) => adjustmentCard(item)).join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("campaign")}</h2>
        <dl>
          <dt>${t("platform")}</dt><dd>${platformBadge(campaign.platform)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(campaign.status)}</dd>
          <dt>${t("product")}</dt><dd>${escapeHtml(campaign.product || t("notAvailable"))}</dd>
          ${campaign.sku ? `<dt>${t("sku")}</dt><dd class="mono">${escapeHtml(campaign.sku)}</dd>` : ""}
          <dt>${t("dailyBudget")}</dt><dd>${money(campaign.daily_budget, campaign.currency)}</dd>
          <dt>${t("spentToday")}</dt><dd>${Number(campaign.budget_spent_today_pct || 0)}%${budgetBar(campaign.budget_spent_today_pct)}</dd>
          <dt>${t("acosTarget")}</dt><dd>${Number(campaign.acos_target_pct || 0).toFixed(0)}%</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(campaign.currency || "USD")}</dd>
          <dt>${t("lastSync")}</dt><dd>${dateTime(campaign.last_sync_at)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function filteredAnomalies() {
  const query = state.query.trim().toLowerCase();
  const order = { critical: 0, warning: 1, info: 2 };
  const stateOrder = { open: 0, actioned: 1, dismissed: 2, resolved: 3 };
  const rows = [...anomalies()].sort(
    (a, b) =>
      (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || (order[a.severity] ?? 9) - (order[b.severity] ?? 9),
  );
  if (!query) return rows;
  return rows.filter((item) =>
    [item.type, item.severity, item.state, item.evidence, item.platform, campaignById(item.campaign_id)?.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function adjustmentLink(adjustmentId) {
  const adjustment = adjustmentById(adjustmentId);
  if (!adjustment) return `<span class="muted">${t("notAvailable")}</span>`;
  return `<a class="badge action-link" href="#/adjustments/${encodeURIComponent(adjustmentId)}">${t("adjustmentRef")} #${adjustment.ref} · ${escapeHtml(enumLabel(adjustment.status))}</a>`;
}

export function renderAlerts() {
  els.title.textContent = t("alertsFeed");
  const rows = filteredAnomalies();
  const open = rows.filter((item) => item.state === "open").length;
  els.subtitle.textContent = `${rows.length} ${t("alerts").toLowerCase()} · ${open} ${t("openAlerts")}`;
  els.content.innerHTML = `
    ${notice()}
    ${warnings()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("severity")}</th><th>${t("type")}</th><th>${t("campaign")}</th><th>${t("platform")}</th><th>${t("evidence")}</th><th>${t("age")}</th><th>${t("state")}</th><th>${t("adjustment")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((item) => {
              const campaign = campaignById(item.campaign_id);
              return `
              <tr>
                <td>${statusBadge(item.severity)}</td>
                <td>${typeBadge(item.type)}</td>
                <td><a href="#/campaigns/${encodeURIComponent(item.campaign_id)}"><strong>${escapeHtml(campaign?.name || item.campaign_id)}</strong></a></td>
                <td>${platformBadge(item.platform)}</td>
                <td>${escapeHtml(item.evidence)}</td>
                <td class="num">${ageOf(item.first_seen_at || item.detected_at)}</td>
                <td>${statusBadge(item.state)}</td>
                <td>${item.adjustment_id ? adjustmentLink(item.adjustment_id) : `<span class="muted">${t("notAvailable")}</span>`}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

function filteredAdjustments() {
  const query = state.query.trim().toLowerCase();
  const order = { needs_review: 0, changes_requested: 1, approved: 2, blocked: 3, done: 4 };
  const rows = [...adjustments()].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.ref - b.ref);
  if (!query) return rows;
  return rows.filter((item) =>
    [item.title, item.reason, item.type, item.status, item.note, item.platform]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

export function renderAdjustments() {
  els.title.textContent = t("adjustmentsQueue");
  const rows = filteredAdjustments();
  const review = rows.filter((item) => item.status === "needs_review").length;
  els.subtitle.textContent = `${rows.length} ${t("adjustments").toLowerCase()} · ${review} ${t("needReview")}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <div class="action-list">
      ${rows.map((item) => adjustmentCard(item)).join("")}
    </div>
    ${rows.length ? "" : `<div class="empty">${t("empty")}</div>`}
  `;
}

export function renderAdjustmentDetail() {
  const adjustment = adjustmentById(state.route.id);
  if (!adjustment) {
    renderAdjustments();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const campaign = campaignById(adjustment.campaign_id);
  const anomaly = adjustment.anomaly_id ? anomalyById(adjustment.anomaly_id) : null;
  els.title.textContent = `${t("adjustmentRef")} #${adjustment.ref} · ${adjustment.title}`;
  els.subtitle.textContent = `${enumLabel(adjustment.type, "adjtype")} · ${enumLabel(adjustment.status)}`;
  els.content.innerHTML = `
    ${notice()}
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <div class="panel">
          <h2>${t("reason")}</h2>
          <p class="guidance">${escapeHtml(adjustment.reason)}</p>
          <div class="value-shift">
            <span><span>${t("current")}</span><strong>${escapeHtml(adjustment.current_value)}</strong></span>
            <span class="arrow" aria-hidden="true">→</span>
            <span><span>${t("proposed")}</span><strong>${escapeHtml(adjustment.proposed_value)}</strong></span>
          </div>
          ${adjustment.expected_impact ? `<div class="impact"><strong>${t("expectedImpact")}</strong> · ${escapeHtml(adjustment.expected_impact)}</div>` : ""}
        </div>
        <div class="panel">
          <h2>${t("evidence")}</h2>
          <ul class="evidence-list">
            ${(adjustment.evidence || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>
        <div class="panel">
          <h2>${t("note")}</h2>
          <textarea id="adjustment-note" rows="3" placeholder="${t("notePlaceholder")}" ${locked ? "disabled" : ""}>${escapeHtml(adjustment.note || "")}</textarea>
          <div class="decision-actions">
            <button type="button" class="primary" data-verdict="approve" ${locked ? "disabled" : ""} title="${t("approve")}">${t("approve")}</button>
            <button type="button" data-verdict="request_changes" ${locked ? "disabled" : ""} title="${t("requestChanges")}">${t("requestChanges")}</button>
            <button type="button" class="danger" data-verdict="block" ${locked ? "disabled" : ""} title="${t("block")}">${t("block")}</button>
            <button type="button" data-verdict="note" ${locked ? "disabled" : ""} title="${t("saveNote")}">${t("saveNote")}</button>
          </div>
        </div>
        ${
          adjustment.execution
            ? `
          <div class="panel">
            <h2>${t("execution")}</h2>
            <dl>
              <dt>${t("status")}</dt><dd>${statusBadge(adjustment.execution.status)}</dd>
              <dt>${t("operation")}</dt><dd class="mono">${escapeHtml(adjustment.execution.operation || "")}</dd>
              <dt>${t("target")}</dt><dd class="mono">${escapeHtml(JSON.stringify(adjustment.execution.target || {}))}</dd>
              <dt>${t("executedAt")}</dt><dd>${dateTime(adjustment.execution.executed_at)}</dd>
            </dl>
            ${adjustment.execution.detail ? `<p class="guidance muted">${escapeHtml(adjustment.execution.detail)}</p>` : ""}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("decision")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(adjustment.status)}</dd>
          ${
            adjustment.decision
              ? `
            <dt>${t("decision")}</dt><dd>${escapeHtml(enumLabel(adjustment.decision.verdict === "approve" ? "approved" : adjustment.decision.verdict === "block" ? "blocked" : "changes_requested"))}</dd>
            <dt>${t("generated")}</dt><dd>${dateTime(adjustment.decision.decided_at)}</dd>
          `
              : ""
          }
        </dl>
        <h2>${t("target")}</h2>
        <dl>
          <dt>${t("campaign")}</dt><dd>${campaign ? `<a href="#/campaigns/${encodeURIComponent(campaign.campaign_id)}">${escapeHtml(campaign.name)}</a>` : escapeHtml(adjustment.campaign_id)}</dd>
          <dt>${t("platform")}</dt><dd>${platformBadge(adjustment.platform)}</dd>
          ${Object.entries(adjustment.target || {})
            .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd class="mono">${escapeHtml(String(value))}</dd>`)
            .join("")}
        </dl>
        ${
          anomaly
            ? `
          <h2>${t("linkedAnomalies")}</h2>
          <dl>
            <dt>${t("type")}</dt><dd>${typeBadge(anomaly.type)}</dd>
            <dt>${t("evidence")}</dt><dd>${escapeHtml(anomaly.evidence)}</dd>
          </dl>
        `
            : ""
        }
      </aside>
    </section>
  `;
  els.content.querySelectorAll("[data-verdict]").forEach((button) => {
    button.addEventListener("click", () => submitDecision(adjustment.adjustment_id, button.dataset.verdict));
  });
}

async function submitDecision(adjustmentId, verdict) {
  const note = els.content.querySelector("#adjustment-note")?.value || "";
  if (state.settings?.demo) {
    const adjustment = adjustmentById(adjustmentId);
    if (adjustment) {
      if (verdict !== "note") {
        adjustment.status = verdict === "approve" ? "approved" : verdict === "block" ? "blocked" : "changes_requested";
      }
      adjustment.note = note;
      adjustment.decision = { verdict, note, decided_at: new Date().toISOString() };
    }
    state.notice = t("demoReadOnly");
    render();
    return;
  }
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adjustment_id: adjustmentId, verdict, note }),
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
  const targets = summary.targets || {};
  const thresholds = summary.thresholds || {};
  els.content.innerHTML = `
    ${notice()}
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("provider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd class="mono">${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("currency")}</dt><dd>${escapeHtml(summary.currency || "USD")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("platforms")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-row">
            <strong>${escapeHtml(platform.name)}</strong>
            <span class="mono muted">${escapeHtml(platform.account_id || "")} · ${escapeHtml((platform.secret_envs || []).join(", "))}</span>
            <span>${platform.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("targets")}</h2>
        <dl>
          ${
            Object.entries(targets)
              .filter(([, value]) => typeof value !== "object")
              .map(([key, value]) => `<dt class="mono">${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("setupNeeded")}</dd>`
          }
        </dl>
      </section>
      <section>
        <h2>${t("thresholds")}</h2>
        <dl>
          ${
            Object.entries(thresholds)
              .map(([key, value]) => `<dt class="mono">${escapeHtml(key)}</dt><dd>${escapeHtml(String(value))}</dd>`)
              .join("") || `<dd>${t("setupNeeded")}</dd>`
          }
        </dl>
      </section>
    </div>
  `;
}
