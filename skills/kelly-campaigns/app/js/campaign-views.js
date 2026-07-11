import {
  atRiskCount,
  campaignFilters,
  count,
  dateTime,
  decisionFor,
  deliverabilityBadge,
  effectiveStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredCampaigns,
  loadState,
  lockBanner,
  matchesQuery,
  noticeBanner,
  pct,
  phaseBadge,
  phaseChips,
  qualityGatePanel,
  render,
  reviewCount,
  riskBadges,
  segmentName,
  sendById,
  sends,
  state,
  statusBadge,
  suppressionEntries,
  suppressionNote,
  t,
  typeBadge,
  variantPicker,
  verdictBadge,
  warnings,
} from "../app.js";
export function renderCampaigns() {
  els.title.textContent = t("campaigns");
  const items = filteredCampaigns();
  els.subtitle.textContent = `${reviewCount()} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${campaignFilters()}
    ${phaseChips(sends())}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const decision = decisionFor(item.send_id);
            const edits = state.edits[item.send_id] || {};
            const body = edits.body ?? decision?.body ?? item.body ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-send="${escapeHtml(item.send_id)}">
            <header class="queue-head">
              <a class="queue-ref" href="#/campaigns/${encodeURIComponent(item.send_id)}">${t("sendRef")} #${item.ref}</a>
              ${statusBadge(status)}
              ${typeBadge(item.type)}
              ${phaseBadge(item.phase)}
              ${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : ""}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${t("due")} ${dateTime(item.send_at)}</span>
            </header>
            <div class="queue-meta">
              ${escapeHtml(segmentName(item.segment_id))} · ${count(item.audience_size)} ${t("audience")} · ${deliverabilityBadge(item.deliverability)}
            </div>
            <div class="queue-subject strong">${escapeHtml(item.subject)}</div>
            <div class="queue-preview muted">${escapeHtml(item.preview_text || "")}</div>
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            ${suppressionNote(item)}
            ${variantPicker(item, disabled)}
            <label class="queue-label">${t("body")}</label>
            <textarea class="queue-draft" data-field="body" rows="8" ${disabled}>${escapeHtml(body)}</textarea>
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noSends")}</div>`
      }
    </div>
  `;
  bindCampaignEvents();
}

export function renderCampaignDetail() {
  const item = sendById(state.route.id);
  if (!item) {
    renderCampaigns();
    return;
  }
  const status = effectiveStatus(item);
  const deliverability = item.deliverability || {};
  els.title.textContent = item.subject;
  els.subtitle.textContent = `${enumLabel(item.type, "type")} · ${enumLabel(item.phase, "phase")} · ${segmentName(item.segment_id)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="detail-badges">
          ${statusBadge(status)} ${typeBadge(item.type)} ${phaseBadge(item.phase)} ${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : ""} ${riskBadges(item.risk)}
        </div>
        ${qualityGatePanel(item.quality_gate)}
        ${suppressionNote(item)}
        <div class="overview-panel">
          <h2>${t("body")}</h2>
          <pre class="body-preview">${escapeHtml(item.body || "")}</pre>
        </div>
        ${
          (item.subject_variants || []).length >= 2
            ? `
          <div class="overview-panel">
            <h2>${t("subject")} A/B</h2>
            ${(item.subject_variants || [])
              .map(
                (variant) => `
              <div class="detail-variant"><span class="variant-id">${escapeHtml(variant.id.toUpperCase())}</span> ${escapeHtml(variant.subject)}</div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        ${
          item.performance
            ? `
          <div class="overview-panel">
            <h2>${t("performance")}</h2>
            <dl class="health-dl">
              <dt>${t("delivered")}</dt><dd>${count(item.performance.delivered)}</dd>
              <dt>${t("openRate")}</dt><dd>${pct(item.performance.open_rate)}</dd>
              <dt>${t("clickRate")}</dt><dd>${pct(item.performance.click_rate)}</dd>
              <dt>${t("unsubRate")}</dt><dd>${pct(item.performance.unsub_rate)}</dd>
              <dt>${t("bounceRate")}</dt><dd>${pct(item.performance.bounce_rate)}</dd>
            </dl>
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("sendRef")} #${item.ref}</h2>
        <dl>
          <dt>${t("type")}</dt><dd>${typeBadge(item.type)}</dd>
          <dt>${t("phase")}</dt><dd>${phaseBadge(item.phase)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(status)}</dd>
          <dt>${t("proposedAction")}</dt><dd>${escapeHtml(enumLabel(item.proposed_action, "action"))}</dd>
          <dt>${t("segment")}</dt><dd>${escapeHtml(segmentName(item.segment_id))}</dd>
          <dt>${t("audience")}</dt><dd>${count(item.audience_size)}</dd>
          <dt>${t("previewText")}</dt><dd>${escapeHtml(item.preview_text || "")}</dd>
          <dt>${t("sendAt")}</dt><dd>${dateTime(item.send_at)}</dd>
          <dt>${t("spf")}</dt><dd>${deliverability.spf_pass ? "✓" : "✗"}</dd>
          <dt>${t("dkim")}</dt><dd>${deliverability.dkim_pass ? "✓" : "✗"}</dd>
          <dt>${t("dmarc")}</dt><dd>${deliverability.dmarc_pass ? "✓" : "✗"}</dd>
          <dt>${t("spamScore")}</dt><dd>${escapeHtml(String(deliverability.spam_score ?? ""))}</dd>
          <dt>${t("inboxReadiness")}</dt><dd>${pct(deliverability.inbox_readiness)} ${deliverabilityBadge(deliverability)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

export function renderDeliverability() {
  els.title.textContent = t("deliverability");
  const items = sends().filter(matchesQuery);
  els.subtitle.textContent = `${atRiskCount()} ${t("atRisk")}`;
  const suppressed = suppressionEntries();
  els.content.innerHTML = `
    ${warnings()}
    <section class="suppression-facet">
      <h2>${t("suppression")} <small class="muted">${suppressed.length}</small></h2>
      ${
        suppressed.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>${t("scope")}</th><th>${t("suppressionReason")}</th><th>${t("suppressedAt")}</th></tr></thead>
              <tbody>${suppressed
                .map(
                  (entry) => `<tr>
                    <td class="strong">${entry.address ? escapeHtml(entry.address) : `${escapeHtml(segmentName(entry.segment_id))} <span class="muted">(${t("segment")})</span>`}</td>
                    <td><span class="risk-badge">${escapeHtml(enumLabel(entry.reason, "suppressionReason"))}</span></td>
                    <td class="muted">${dateTime(entry.suppressed_at)}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table></div>`
          : `<div class="empty-inline">${t("suppressionEmpty")}</div>`
      }
    </section>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sendRef")}</th><th>${t("subject")}</th><th>${t("type")}</th><th>${t("spf")}</th><th>${t("dkim")}</th><th>${t("dmarc")}</th><th>${t("spamScore")}</th><th>${t("inboxReadiness")}</th><th>${t("verdict")}</th><th>${t("deliverability")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const d = item.deliverability || {};
              return `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(item.send_id)}">#${item.ref}</a></td>
              <td><span class="strong">${escapeHtml(item.subject)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td class="${d.spf_pass ? "ok" : "warn"}">${d.spf_pass ? "✓" : "✗"}</td>
              <td class="${d.dkim_pass ? "ok" : "warn"}">${d.dkim_pass ? "✓" : "✗"}</td>
              <td class="${d.dmarc_pass ? "ok" : "warn"}">${d.dmarc_pass ? "✓" : "✗"}</td>
              <td class="num">${escapeHtml(String(d.spam_score ?? ""))}</td>
              <td class="num">${pct(d.inbox_readiness)}</td>
              <td>${item.quality_gate ? verdictBadge(item.quality_gate.verdict) : `<span class="muted">—</span>`}</td>
              <td>${deliverabilityBadge(d)}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderPerformance() {
  els.title.textContent = t("performance");
  const items = sends()
    .filter((item) => item.performance)
    .filter(matchesQuery);
  els.subtitle.textContent = `${items.length} ${t("done")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sendRef")}</th><th>${t("subject")}</th><th>${t("type")}</th><th>${t("delivered")}</th><th>${t("openRate")}</th><th>${t("clickRate")}</th><th>${t("unsubRate")}</th><th>${t("bounceRate")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item) => {
              const p = item.performance || {};
              return `
            <tr>
              <td><a href="#/campaigns/${encodeURIComponent(item.send_id)}">#${item.ref}</a></td>
              <td><span class="strong">${escapeHtml(item.subject)}</span></td>
              <td>${typeBadge(item.type)}</td>
              <td class="num">${count(p.delivered)}</td>
              <td class="num">${pct(p.open_rate)}</td>
              <td class="num">${pct(p.click_rate)}</td>
              <td class="num">${pct(p.unsub_rate)}</td>
              <td class="num">${pct(p.bounce_rate)}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("noSends")}</div>`;
}

function bindCampaignEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.campaignFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".phase-chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.phaseFilter = button.dataset.phase;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.send;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll('.queue-card input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const id = radio.closest(".queue-card").dataset.send;
      state.edits[id] = { ...state.edits[id], chosen_variant: radio.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.send, button.dataset.action, card);
    });
  });
}

async function submitDecision(sendId, action, card) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = card.querySelector('[data-field="body"]')?.value ?? "";
  const note = card.querySelector('[data-field="note"]')?.value ?? "";
  const chosenVariant = card.querySelector('input[type="radio"]:checked')?.value;
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ send_id: sendId, action, comment: note, body, chosen_variant: chosenVariant }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = payload.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[sendId];
  state.notice = t("saved");
  await loadState();
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
  const brand = summary.brand || {};
  const esp = summary.esp || {};
  const policy = summary.sending_policy || {};
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
        <h2>${t("brand")} · ${t("esp")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(brand.name || "")}</dd>
          <dt>${t("unsubUrl")}</dt><dd>${escapeHtml(brand.unsubscribe_url || "")}</dd>
          <dt>${t("esp")}</dt><dd>${escapeHtml(esp.display_name || "")}</dd>
          <dt>${t("provider")}</dt><dd>${escapeHtml(esp.provider || "")}</dd>
          <dt>${t("secretsReady")}</dt><dd class="${esp.secrets_ready ? "ok" : "warn"}">${esp.secrets_ready ? t("secretsReady") : t("missingSecrets")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("sendingPolicy")}</h2>
        <dl>
          <dt>${t("dailyCap")}</dt><dd>${count(policy.daily_send_cap)}</dd>
          <dt>${t("hourlyCap")}</dt><dd>${count(policy.hourly_send_cap)}</dd>
          <dt>${t("minInboxReadiness")}</dt><dd>${pct(policy.min_inbox_readiness)}</dd>
          <dt>${t("maxSpamScore")}</dt><dd>${escapeHtml(String(policy.max_spam_score ?? ""))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("fromIdentities")}</h2>
        ${
          (summary.from_identities || [])
            .map(
              (identity) => `
          <div class="settings-channel">
            <strong>${escapeHtml(identity.from_name || "")}</strong>
            <span>${escapeHtml(identity.from_email || "")}</span>
            <span class="muted">${(identity.use_when || []).map((v) => escapeHtml(enumLabel(v, "type"))).join(", ")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("segments")}</h2>
        ${
          (summary.segments || [])
            .map(
              (segment) => `
          <div class="settings-channel">
            <strong>${escapeHtml(segment.name || "")}</strong>
            <span class="muted">${escapeHtml(segment.description || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
