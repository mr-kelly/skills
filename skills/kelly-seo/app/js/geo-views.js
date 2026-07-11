import {
  cssEscape,
  date,
  decisionStatus,
  deltaHtml,
  displayPath,
  els,
  enumLabel,
  escapeHtml,
  n,
  render,
  state,
  statusBadge,
  t,
} from "../app.js";
// ── GEO: AI-visibility tracker ────────────────────────────────────────────────

export function renderGeo() {
  els.title.textContent = t("aiVisibility");
  const visibility = state.snapshot?.ai_visibility;
  if (!visibility || !(visibility.prompts || []).length) {
    els.subtitle.textContent = t("aiVisibilitySub");
    els.content.innerHTML = `<div class="empty">${t("noGeoData")}</div>`;
    return;
  }
  els.subtitle.textContent = `${escapeHtml(visibility.brand)} · ${visibility.prompts.length} ${t("trackedPrompts").toLowerCase()}`;
  const engines = visibility.engines || [];
  const trendPoints = aggregateVisibilityTrend(visibility.prompts);
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric">
        <span>${t("aiVisibilityScore")}</span>
        <strong>${n(visibility.score)}<small class="metric-unit">/100</small></strong>
        <div class="metric-delta">${deltaHtml(visibility.score, visibility.prev_score)} <small>${t("prevPeriod")}</small></div>
      </div>
      <div class="metric">
        <span>${t("engines")}</span>
        <strong>${engines.length}</strong>
        <div class="metric-delta"><small>${engines.map((engine) => escapeHtml(enumLabel(engine, "engine"))).join(" · ")}</small></div>
      </div>
      <div class="metric">
        <span>${t("trackedPrompts")}</span>
        <strong>${visibility.prompts.length}</strong>
        <div class="metric-delta"><small>${t("engineMatrix")}</small></div>
      </div>
    </div>
    <div class="overview-panel wide">
      <h2>${t("engineMatrix")}</h2>
      ${visibilityMatrix(visibility.prompts, engines)}
    </div>
    <div class="overview-panel wide">
      <h2>${t("visibilityTrend")}</h2>
      ${visibilityTrendChart(trendPoints)}
    </div>
  `;
}

function visibilityMatrix(prompts, engines) {
  return `
    <div class="table-wrap">
      <table class="geo-matrix">
        <thead>
          <tr>
            <th>${t("prompt")}</th>
            ${engines.map((engine) => `<th class="geo-engine-col">${escapeHtml(enumLabel(engine, "engine"))}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${prompts
            .map(
              (prompt) => `
            <tr>
              <td>
                <div class="strong">${escapeHtml(prompt.prompt)}</div>
                <div class="muted">${escapeHtml(prompt.intent)}</div>
              </td>
              ${engines
                .map((engine) => {
                  const mention = (prompt.mentions || []).find((item) => item.engine === engine);
                  return `<td class="geo-cell">${matrixCell(mention)}</td>`;
                })
                .join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function matrixCell(mention) {
  if (!mention || !mention.mentioned) {
    return `<span class="geo-dot geo-dot-absent" title="${t("notMentioned")}">—</span>`;
  }
  const sentiment = mention.sentiment || "neutral";
  const posText = mention.position ? `#${mention.position}` : "✓";
  const tip = [
    `${t("mentioned")} ${posText}`,
    `${t("sentiment")}: ${enumLabel(sentiment, "sentiment")}`,
    mention.cited_url ? `${t("citedUrl")}: ${mention.cited_url}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="geo-dot geo-dot-${escapeHtml(sentiment)}" title="${escapeHtml(tip)}">${escapeHtml(posText)}</span>`;
}

function aggregateVisibilityTrend(prompts) {
  const byDate = new Map();
  for (const prompt of prompts) {
    for (const point of prompt.trend || []) {
      const entry = byDate.get(point.date) || { date: point.date, sum: 0, count: 0 };
      entry.sum += Number(point.visibility || 0);
      entry.count += 1;
      byDate.set(point.date, entry);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ date: entry.date, value: entry.count ? entry.sum / entry.count : 0 }));
}

function visibilityTrendChart(points) {
  if (!points.length) return `<div class="empty">${t("noTrend")}</div>`;
  const step = 40;
  const width = Math.max(points.length * step, step);
  const height = 120;
  const bars = points
    .map((point, index) => {
      const x = index * step;
      const barH = Math.max(Math.round(point.value * (height - 24)), 2);
      return `
      <g>
        <title>${point.date}: ${Math.round(point.value * 100)}%</title>
        <rect x="${x + 6}" y="${height - barH}" width="${step - 14}" height="${barH}" rx="3" class="bar-clicks"></rect>
        <text x="${x + step / 2 - 3}" y="${height - barH - 4}" class="geo-bar-label">${Math.round(point.value * 100)}%</text>
      </g>
    `;
    })
    .join("");
  return `
    <div class="trend">
      <div class="trend-legend">
        <span><i class="dot dot-clicks"></i>${t("aiVisibility")}</span>
        <span class="muted">${date(points[0]?.date)} – ${date(points[points.length - 1]?.date)}</span>
      </div>
      <div class="trend-scroll">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${t("visibilityTrend")}">${bars}</svg>
      </div>
    </div>
  `;
}

// ── GEO: content-optimization review queue ────────────────────────────────────

function geoOpportunities() {
  const list = state.snapshot?.geo_opportunities || [];
  return list.map((opportunity) => {
    // A shipped GEO change stays done; a geo-qa BLOCK is a hard gate otherwise.
    const executed = opportunity.execution?.status === "executed";
    if (opportunity.gate?.verdict === "BLOCK" && !executed) {
      return { ...opportunity, status: "blocked" };
    }
    if (!state.demo) return opportunity;
    const local = state.geoDecisions[opportunity.id];
    if (!local) return opportunity;
    let status = opportunity.status;
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
    if (executed) status = "done";
    return { ...opportunity, status, decision: local, draft: local.draft ?? opportunity.draft };
  });
}

const GEO_OPP_FILTERS = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];

export function renderOptimize() {
  els.title.textContent = t("geoOptimizer");
  const all = geoOpportunities();
  const query = state.query.trim().toLowerCase();
  const items = all.filter((item) => {
    if (state.geoFilter !== "all" && item.status !== state.geoFilter) return false;
    if (!query) return true;
    return [item.title, item.target_page, item.target_prompt, item.type, item.reason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  els.subtitle.textContent = t("geoOptimizerSub");
  const locked = Boolean(state.settings?.lock);
  const chips = GEO_OPP_FILTERS.map((filter) => {
    const count = filter === "all" ? all.length : all.filter((item) => item.status === filter).length;
    const label = filter === "all" ? t("viewAll") : enumLabel(filter);
    return `<button type="button" class="chip ${state.geoFilter === filter ? "active" : ""}" data-geo-filter="${filter}" title="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`;
  }).join("");
  els.content.innerHTML = `
    ${locked ? `<div class="warnings"><div class="warning"><strong>${t("lockBanner")}</strong><span>${escapeHtml(state.settings.lock?.message || "")}</span></div></div>` : ""}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    <div class="chip-row">${chips}</div>
    <div class="opp-list">
      ${items.map((item) => geoOpportunityCard(item, locked)).join("") || `<div class="empty">${t("noGeoOpportunities")}</div>`}
    </div>
  `;
}

function geoOpportunityCard(item, locked) {
  const blocked = item.gate?.verdict === "BLOCK";
  const disabled = locked ? "disabled" : "";
  return `
    <article class="opp-card geo-card" data-geo-id="${escapeHtml(item.id)}">
      <header class="opp-head">
        <span class="opp-ref">${t("geoOpportunity")} #${item.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(item.type, "type"))}</span>
        ${statusBadge(item.status)}
        ${gateBadge(item.gate)}
      </header>
      <h3>${escapeHtml(item.title)}</h3>
      <div class="opp-target">
        <span class="muted">${t("targetPrompt")}:</span> <span class="badge">${escapeHtml(item.target_prompt || "")}</span>
        ${item.target_page ? ` · <a class="external" href="${escapeHtml(item.target_page)}" target="_blank" rel="noreferrer">${escapeHtml(displayPath(item.target_page))}</a>` : ""}
      </div>
      <p class="opp-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason)}</p>
      <p class="opp-impact"><span class="muted">${t("expectedImpact")}:</span> ${escapeHtml(item.expected_impact)}</p>
      ${gatePanel(item.gate)}
      ${
        (item.grounding || []).length
          ? `<div class="geo-grounding"><span class="muted">${t("grounding")}:</span><ul>${item.grounding.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>`
          : ""
      }
      ${item.agent_notes ? `<p class="agent-notes">${escapeHtml(item.agent_notes)}</p>` : ""}
      <label class="opp-label" for="geo-draft-${escapeHtml(item.id)}">${t("draft")}</label>
      <textarea id="geo-draft-${escapeHtml(item.id)}" class="opp-draft" rows="6" ${disabled}>${escapeHtml(item.draft || "")}</textarea>
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
      ${blocked ? `<div class="warnings"><div class="error"><strong>${t("gateBlockedNote")}</strong></div></div>` : ""}
      <label class="opp-label" for="geo-note-${escapeHtml(item.id)}">${t("reviewNote")}</label>
      <textarea id="geo-note-${escapeHtml(item.id)}" class="opp-note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}></textarea>
      <div class="opp-actions">
        <button type="button" class="primary" data-geo-decision="approve" data-id="${escapeHtml(item.id)}" title="${t("approve")}" ${disabled || blocked ? "disabled" : ""}>${t("approve")}</button>
        <button type="button" data-geo-decision="request_changes" data-id="${escapeHtml(item.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-geo-decision="revise" data-id="${escapeHtml(item.id)}" title="${t("saveDraft")}" ${disabled}>${t("saveDraft")}</button>
        <button type="button" class="danger" data-geo-decision="block" data-id="${escapeHtml(item.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
    </article>
  `;
}

function gateBadge(gate) {
  if (!gate) return "";
  const verdict = gate.verdict || "SHIP";
  return `<span class="gate-badge gate-${escapeHtml(verdict)}" title="${t("qualityGate")} · ${t("geoScore")} ${n(gate.score)}">⛩ ${escapeHtml(verdict)} · ${n(gate.score)}</span>`;
}

function gatePanel(gate) {
  if (!gate) return "";
  return `
    <div class="gate-panel gate-panel-${escapeHtml(gate.verdict)}">
      <div class="gate-panel-head">
        <strong>⛩ ${t("qualityGate")}: ${escapeHtml(gate.verdict)}</strong>
        <span class="muted">${t("geoScore")} ${n(gate.score)}/100</span>
      </div>
      ${gate.summary ? `<p class="gate-summary">${escapeHtml(gate.summary)}</p>` : ""}
      <ul class="gate-checks">
        ${(gate.checks || [])
          .map(
            (check) => `
          <li class="gate-check gate-check-${escapeHtml(check.result)}">
            <span class="gate-check-mark">${check.result === "pass" ? "✓" : check.result === "warn" ? "!" : "✕"}</span>
            <span><strong>${escapeHtml(check.label)}</strong>${check.note ? ` — ${escapeHtml(check.note)}` : ""}</span>
          </li>
        `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

export async function submitGeoDecision(id, action) {
  const note = document.querySelector(`#geo-note-${cssEscape(id)}`)?.value || "";
  const draft = document.querySelector(`#geo-draft-${cssEscape(id)}`)?.value;
  if (state.demo) {
    state.geoDecisions[id] = { action, note, draft: draft ?? null, decided_at: new Date().toISOString() };
    render();
    return;
  }
  const res = await fetch("/api/geo-decision", {
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

// ── GEO: entity / knowledge-panel readiness ───────────────────────────────────

export function renderEntity() {
  els.title.textContent = t("entityReadiness");
  const readiness = state.snapshot?.entity_signals;
  if (!readiness || !(readiness.signals || []).length) {
    els.subtitle.textContent = t("entityReadinessSub");
    els.content.innerHTML = `<div class="empty">${t("noEntityData")}</div>`;
    return;
  }
  const signals = entitySignals();
  els.subtitle.textContent = `${escapeHtml(readiness.brand)} · ${t("entityReadinessSub")}`;
  const locked = Boolean(state.settings?.lock);
  const score = entityScore(signals, readiness.score);
  els.content.innerHTML = `
    <div class="metrics">
      <div class="metric">
        <span>${t("entityScore")}</span>
        <strong>${n(score)}<small class="metric-unit">/100</small></strong>
        <div class="metric-delta"><small>${signals.filter((s) => s.status === "present").length}/${signals.length} ${t("present")}</small></div>
      </div>
    </div>
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    <div class="entity-list">
      ${signals.map((signal) => entityCard(signal, locked)).join("")}
    </div>
  `;
}

function entitySignals() {
  const signals = state.snapshot?.entity_signals?.signals || [];
  if (!state.demo) return signals;
  return signals.map((signal) => {
    const local = state.entityOverrides[signal.id];
    return local ? { ...signal, status: local.status, detail: local.note || signal.detail } : signal;
  });
}

const ENTITY_WEIGHT = { present: 1, partial: 0.5, missing: 0 };

function entityScore(signals, fallback) {
  if (!signals.length) return fallback;
  const total = signals.reduce((sum, signal) => sum + (ENTITY_WEIGHT[signal.status] ?? 0), 0);
  return Math.round((total / signals.length) * 100);
}

function entityCard(signal, locked) {
  const disabled = locked ? "disabled" : "";
  return `
    <article class="entity-card entity-${escapeHtml(signal.status)}" data-entity-id="${escapeHtml(signal.id)}">
      <div class="entity-head">
        <span class="entity-status entity-status-${escapeHtml(signal.status)}">${escapeHtml(enumLabel(signal.status, "entity"))}</span>
        <strong>${escapeHtml(signal.label)}</strong>
        <span class="badge">${escapeHtml(signal.category)}</span>
      </div>
      <p class="entity-detail">${escapeHtml(signal.detail)}</p>
      ${signal.fix ? `<p class="entity-fix"><span class="muted">${t("proposedFix")}:</span> ${escapeHtml(signal.fix)}</p>` : ""}
      <div class="entity-actions">
        <button type="button" class="primary" data-entity-status="present" data-id="${escapeHtml(signal.id)}" ${disabled}>${t("markPresent")}</button>
        <button type="button" data-entity-status="partial" data-id="${escapeHtml(signal.id)}" ${disabled}>${t("markPartial")}</button>
        <button type="button" class="danger" data-entity-status="missing" data-id="${escapeHtml(signal.id)}" ${disabled}>${t("markMissing")}</button>
      </div>
    </article>
  `;
}

export async function submitEntitySignal(id, status) {
  if (state.demo) {
    state.entityOverrides[id] = { status, note: "", updated_at: new Date().toISOString() };
    render();
    return;
  }
  const res = await fetch("/api/entity-signal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    els.subtitle.textContent = body.error || `Update failed: ${res.status}`;
    return;
  }
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  render();
}
