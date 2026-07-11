import {
  compactNumber,
  creatorById,
  creators,
  decisionFor,
  effectiveStatus,
  els,
  engagements,
  enumLabel,
  escapeHtml,
  filteredCreators,
  filteredOutreach,
  fitBadge,
  gateBadge,
  loadState,
  lockBanner,
  metricCards,
  money,
  nicheBadge,
  noticeBanner,
  phaseBadge,
  platformBadge,
  render,
  riskBadges,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
export function renderCreators() {
  els.title.textContent = t("creators");
  const items = filteredCreators();
  els.subtitle.textContent = `${items.length} ${t("creatorsLower")}`;
  const sorts = [
    ["fit_score", t("fitScore")],
    ["followers", t("followers")],
    ["engagement_rate", t("engagementRate")],
    ["est_rate", t("estRate")],
  ];
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    <div class="queue-filters">
      ${sorts
        .map(
          ([value, label]) =>
            `<button type="button" class="queue-filter ${state.creatorSort === value ? "active" : ""}" data-sort="${value}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`,
        )
        .join("")}
    </div>
    ${
      items.length
        ? `<div class="card-grid">
      ${items
        .map((item) => {
          const status = effectiveStatus(item);
          return `
          <a class="creator-card" href="#/creators/${encodeURIComponent(item.creator_id)}">
            <div class="creator-card-top">
              <span class="creator-name"><strong>${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.handle)}</small></span>
              ${fitBadge(item.fit_score)}
            </div>
            <div class="creator-card-badges">${platformBadge(item.platform)} ${nicheBadge(item.niche)} ${phaseBadge(item.phase)}</div>
            <div class="creator-card-stats">
              <span><small>${t("followers")}</small><strong>${compactNumber(item.followers)}</strong></span>
              <span><small>${t("engagementRate")}</small><strong>${(Number(item.engagement_rate || 0) * 100).toFixed(1)}%</strong></span>
              <span><small>${t("estRate")}</small><strong>${money(item.est_rate)}</strong></span>
            </div>
            <div class="creator-card-foot">${statusBadge(status)} ${riskBadges(item.risk)}</div>
          </a>
        `;
        })
        .join("")}
    </div>`
        : `<div class="empty">${t("empty")}</div>`
    }
  `;
  els.content.querySelectorAll(".queue-filter[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.creatorSort = button.dataset.sort;
      render();
    });
  });
}

export function renderCreatorDetail() {
  const item = creatorById(state.route.id);
  if (!item) {
    renderCreators();
    return;
  }
  const status = effectiveStatus(item);
  const fit = item.fit_breakdown || {};
  const fitKeys = ["content", "community", "credibility", "audience", "cost", "engagement"];
  els.title.textContent = `${item.name}`;
  els.subtitle.textContent = `${item.handle} · ${enumLabel(item.platform, "platform")} · ${enumLabel(item.niche, "niche")}`;
  els.content.innerHTML = `
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="agent-panel">
          <h2>${t("reason")}</h2>
          <p>${escapeHtml(item.reason || "")}</p>
          ${item.audience_note ? `<p class="muted">${t("audience")}: ${escapeHtml(item.audience_note)}</p>` : ""}
        </div>
        ${
          item.item_type === "quality_gate"
            ? gatePanel(item)
            : item.suggested_reply
              ? `
          <div class="overview-panel">
            <h2>${t("draft")}</h2>
            <pre class="draft-preview">${escapeHtml(item.suggested_reply)}</pre>
          </div>
        `
              : ""
        }
        <div class="overview-panel">
          <h2>${t("fitBreakdown")}</h2>
          ${fitKeys
            .map((key) => {
              const value = Number(fit[key] || 0);
              return `
            <div class="stage-row">
              <span class="stage-row-head"><strong>${escapeHtml(enumLabel(key, "fit"))}</strong></span>
              <span class="stage-bar"><span style="width:${Math.min(100, value)}%"></span></span>
              <span class="num">${value}</span>
            </div>
          `;
            })
            .join("")}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("creatorDetail")}</h2>
        <dl>
          <dt>${t("fitScore")}</dt><dd>${fitBadge(item.fit_score)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
          <dt>${t("phase")}</dt><dd>${phaseBadge(item.phase)}</dd>
          <dt>${t("platform")}</dt><dd>${platformBadge(item.platform)}</dd>
          <dt>${t("niche")}</dt><dd>${escapeHtml(enumLabel(item.niche, "niche"))}</dd>
          <dt>${t("followers")}</dt><dd>${compactNumber(item.followers)}</dd>
          <dt>${t("engagementRate")}</dt><dd>${(Number(item.engagement_rate || 0) * 100).toFixed(1)}%</dd>
          <dt>${t("estRate")}</dt><dd>${money(item.est_rate)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</dd>
          <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel"))}</dd>
          ${item.risk?.length ? `<dt>${t("warnings")}</dt><dd>${riskBadges(item.risk)}</dd>` : ""}
        </dl>
      </aside>
    </section>
  `;
}

function gatePanel(item) {
  const checks = item.gate_checks || [];
  return `
    <div class="overview-panel gate-panel">
      <h2>${t("gate")} ${item.gate_verdict ? gateBadge(item.gate_verdict) : ""}</h2>
      <div class="gate-checks">
        ${checks
          .map(
            (check) => `
          <div class="gate-check-row">
            ${gateBadge(check.result)}
            <span><strong>${escapeHtml(enumLabel(check.check, "check"))}</strong><small>${escapeHtml(check.note || "")}</small></span>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function outreachFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all" ? creators().length : creators().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.outreachFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function renderOutreach() {
  els.title.textContent = t("outreach");
  const items = filteredOutreach();
  const reviewCount = creators().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${outreachFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const isGate = item.item_type === "quality_gate";
            const decision = decisionFor(item.creator_id);
            const edits = state.edits[item.creator_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.suggested_reply ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-creator="${escapeHtml(item.creator_id)}">
            <header class="queue-head">
              <span class="queue-ref">#${item.ref}</span>
              ${statusBadge(status)}
              ${isGate ? gateBadge(item.gate_verdict) : phaseBadge(item.phase)}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${fitBadge(item.fit_score)}</span>
            </header>
            <div class="queue-meta">
              <a href="#/creators/${encodeURIComponent(item.creator_id)}">${escapeHtml(item.name)}</a>
              <span class="muted">${escapeHtml(item.handle)}</span>
              · ${platformBadge(item.platform)} ${nicheBadge(item.niche)}
              · <span class="badge">${escapeHtml(enumLabel(item.proposed_action, "proposed"))}</span>
            </div>
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            ${isGate ? gatePanel(item) : ""}
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("gateFix")}" ${disabled}>${t("gateFix")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noCreators")}</div>`
      }
    </div>
  `;
  bindOutreachEvents();
}

function bindOutreachEvents() {
  els.content.querySelectorAll(".queue-filter[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.outreachFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.creator;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.creator, button.dataset.action, card);
    });
  });
}

async function submitDecision(creatorId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const draft = card.querySelector('[data-field="draft"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creator_id: creatorId, action, comment: note, draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = body.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[creatorId];
  state.notice = t("saved");
  await loadState();
}

export function renderRoi() {
  els.title.textContent = t("roi");
  const query = state.query.trim().toLowerCase();
  let items = engagements();
  if (query) {
    items = items.filter((item) =>
      [item.name, item.handle, item.platform, item.niche].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      ),
    );
  }
  items = items.slice().sort((a, b) => Number(b.est_value || 0) - Number(a.est_value || 0));
  const metrics = state.snapshot?.metrics || {};
  els.subtitle.textContent = `${money(metrics.est_value)} ${t("estValue")}`;
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("creator")}</th><th>${t("platform")}</th><th>${t("niche")}</th><th>${t("stage")}</th><th>${t("spend")}</th><th>${t("estValue")}</th><th>${t("cpm")}</th><th>ROI</th><th>${t("status")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const spend = Number(item.spend || 0);
                const estValue = Number(item.est_value || 0);
                const roi = spend > 0 ? `${((estValue / spend - 1) * 100).toFixed(0)}%` : "—";
                return `
                <tr>
                  <td><a href="#/creators/${encodeURIComponent(item.creator_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted">${escapeHtml(item.handle)}</div></td>
                  <td>${platformBadge(item.platform)}</td>
                  <td>${nicheBadge(item.niche)}</td>
                  <td>${escapeHtml(enumLabel(item.stage, "stage"))}</td>
                  <td class="num">${spend ? money(spend) : "—"}</td>
                  <td class="num">${money(estValue)}</td>
                  <td class="num">${item.cpm ? money(item.cpm) : "—"}</td>
                  <td class="num">${roi}</td>
                  <td>${statusBadge(effectiveStatus(item))}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("empty")}</div>`
    }
  `;
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const program = summary.program || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("operator")}</h2>
        <dl>
          <dt>${t("name")}</dt><dd>${escapeHtml(operator.name || "")}</dd>
          <dt>${t("role")}</dt><dd>${escapeHtml(operator.role || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(operator.company || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(operator.timezone || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(summary.style_tone || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("budget")}</h2>
        <dl>
          <dt>${t("budgetTotal")}</dt><dd>${money(program.budget_total, program.base_currency || "USD")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(program.base_currency || "USD")}</dd>
          <dt>${t("targetNiches")}</dt><dd class="stage-list">${(program.target_niches || []).map((niche) => nicheBadge(niche)).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("brands")}</h2>
        ${
          (summary.brands || [])
            .map(
              (brand) => `
          <div class="settings-channel">
            <strong>${escapeHtml(brand.display_name)}</strong>
            <span>${escapeHtml(brand.positioning || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("platform")}</h2>
        ${
          (summary.platforms || [])
            .map(
              (platform) => `
          <div class="settings-channel">
            <strong>${escapeHtml(platform.display_name)}</strong>
            <span>${escapeHtml(platform.type)}${platform.handoff_skill ? ` · ${escapeHtml(platform.handoff_skill)}` : ""}</span>
            <span class="${platform.secrets_ready ? "ok" : "warn"}">${platform.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
