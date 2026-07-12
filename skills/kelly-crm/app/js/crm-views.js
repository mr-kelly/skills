import {
  companyName,
  contactById,
  date,
  dealById,
  deals,
  decisionFor,
  effectiveStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredContacts,
  filteredDeals,
  filteredFollowups,
  followups,
  interactions,
  loadState,
  lockBanner,
  metricCards,
  money,
  noticeBanner,
  relationshipBadge,
  render,
  riskBadges,
  stageBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
export function renderDeals() {
  els.title.textContent = t("deals");
  const items = filteredDeals();
  els.subtitle.textContent = `${items.filter((item) => item.status === "open").length} ${t("openDeals")}`;
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
              <th>${t("deal")}</th><th>${t("stage")}</th><th>${t("company")}</th><th>${t("contact")}</th><th>${t("amount")}</th><th>${t("probability")}</th><th>${t("nextStep")}</th><th>${t("owner")}</th><th>${t("lastActivity")}</th><th>${t("status")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const contact = contactById(item.primary_contact_id);
                return `
                <tr>
                  <td><a href="#/deals/${encodeURIComponent(item.deal_id)}"><span class="strong">${escapeHtml(item.name)}</span></a></td>
                  <td>${stageBadge(item.stage)}</td>
                  <td>${escapeHtml(companyName(item.company_id))}</td>
                  <td>${contact ? `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a>` : ""}</td>
                  <td class="num">${money(item.amount, item.currency)}</td>
                  <td class="num">${Math.round(Number(item.probability || 0) * 100)}%</td>
                  <td>${escapeHtml(item.next_step || "")}</td>
                  <td>${escapeHtml(item.owner || "")}</td>
                  <td>${date(item.last_activity_at)}</td>
                  <td>${statusBadge(item.status)}</td>
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

export function renderDealDetail() {
  const item = dealById(state.route.id);
  if (!item) {
    renderDeals();
    return;
  }
  const linked = (item.contact_ids || [item.primary_contact_id]).map(contactById).filter(Boolean);
  const timeline = interactions()
    .filter((entry) => entry.deal_id === item.deal_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const related = followups().filter((entry) => entry.deal_id === item.deal_id);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${companyName(item.company_id)} · ${enumLabel(item.stage, "stage")} · ${money(item.amount, item.currency)}`;
  els.content.innerHTML = `
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="agent-panel">
          <h2>${t("agentNextAction")}</h2>
          <p>${escapeHtml(item.agent_next_action || item.next_step || "")}</p>
        </div>
        ${
          item.notes
            ? `
        <div class="overview-panel">
          <h2>${t("notes")}</h2>
          <p>${escapeHtml(item.notes)}</p>
        </div>
        `
            : ""
        }
        <div class="overview-panel">
          <h2>${t("timeline")}</h2>
          ${
            timeline
              .map(
                (entry) => `
            <div class="timeline-row">
              <span class="badge">${escapeHtml(enumLabel(entry.type, "type"))}</span>
              <span><strong>${escapeHtml(contactById(entry.contact_id)?.name || "")}</strong> <small class="muted">${escapeHtml(enumLabel(entry.direction, "direction"))} · ${date(entry.occurred_at)}</small><small>${escapeHtml(entry.summary)}</small></span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("empty")}</div>`
          }
        </div>
        ${
          related.length
            ? `
          <div class="overview-panel">
            <h2>${t("relatedFollowups")}</h2>
            ${related
              .map(
                (entry) => `
              <a class="due-row" href="#/followups">
                <span><strong>${t("followupRef")} #${entry.ref}</strong><small>${escapeHtml(entry.subject || entry.reason)}</small></span>
                <span class="due-meta">${statusBadge(effectiveStatus(entry))}<small>${date(entry.due_at)}</small></span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
      <aside class="detail-side">
        <h2>${t("dealDetail")}</h2>
        <dl>
          <dt>${t("stage")}</dt><dd>${stageBadge(item.stage)}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(item.status)}</dd>
          <dt>${t("amount")}</dt><dd>${money(item.amount, item.currency)} ${escapeHtml(item.currency)}</dd>
          <dt>${t("probability")}</dt><dd>${Math.round(Number(item.probability || 0) * 100)}%</dd>
          <dt>${t("owner")}</dt><dd>${escapeHtml(item.owner || "")}</dd>
          <dt>${t("expectedClose")}</dt><dd>${date(item.expected_close)}</dd>
          <dt>${t("nextStep")}</dt><dd>${escapeHtml(item.next_step || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(companyName(item.company_id))}</dd>
          <dt>${t("linkedContacts")}</dt><dd>${linked.map((contact) => `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a>`).join("<br>")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

export function renderContacts() {
  els.title.textContent = t("contacts");
  const items = filteredContacts();
  els.subtitle.textContent = `${items.length} ${t("contactsLower")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th><th>${t("company")}</th><th>${t("role")}</th><th>${t("relationship")}</th><th>${t("tags")}</th><th>${t("lastTouch")}</th><th>${t("nextFollowup")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td><a href="#/contacts/${encodeURIComponent(item.contact_id)}"><span class="strong">${escapeHtml(item.name)}</span></a><div class="muted">${escapeHtml(item.email || "")}</div></td>
              <td>${escapeHtml(companyName(item.company_id))}</td>
              <td>${escapeHtml(item.role || "")}</td>
              <td>${relationshipBadge(item.relationship)}</td>
              <td>${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</td>
              <td>${date(item.last_touch_at)}</td>
              <td>${item.next_followup_at ? date(item.next_followup_at) : `<span class="muted">—</span>`}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export function renderContactDetail() {
  const item = contactById(state.route.id);
  if (!item) {
    renderContacts();
    return;
  }
  const timeline = interactions()
    .filter((entry) => entry.contact_id === item.contact_id)
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const openDeals = deals().filter(
    (entry) => (entry.contact_ids || [entry.primary_contact_id]).includes(item.contact_id) && entry.status === "open",
  );
  els.title.textContent = item.name;
  els.subtitle.textContent = `${item.role || ""} · ${companyName(item.company_id)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        ${
          item.agent_notes
            ? `
          <div class="agent-panel">
            <h2>${t("agentNotes")}</h2>
            <p>${escapeHtml(item.agent_notes)}</p>
          </div>
        `
            : ""
        }
        ${
          openDeals.length
            ? `
          <div class="overview-panel">
            <h2>${t("openDealsFor")}</h2>
            ${openDeals
              .map(
                (entry) => `
              <a class="due-row" href="#/deals/${encodeURIComponent(entry.deal_id)}">
                <span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.next_step || "")}</small></span>
                <span class="due-meta">${stageBadge(entry.stage)}<small class="num">${money(entry.amount, entry.currency)}</small></span>
              </a>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="overview-panel">
          <h2>${t("timeline")}</h2>
          ${
            timeline
              .map(
                (entry) => `
            <div class="timeline-row">
              <span class="badge">${escapeHtml(enumLabel(entry.type, "type"))}</span>
              <span><strong>${escapeHtml(enumLabel(entry.direction, "direction"))}</strong> <small class="muted">${date(entry.occurred_at)}</small><small>${escapeHtml(entry.summary)}</small></span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("empty")}</div>`
          }
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("profile")}</h2>
        <dl>
          <dt>${t("email")}</dt><dd>${escapeHtml(item.email || "")}</dd>
          <dt>${t("company")}</dt><dd>${escapeHtml(companyName(item.company_id))}</dd>
          <dt>${t("role")}</dt><dd>${escapeHtml(item.role || "")}</dd>
          <dt>${t("relationship")}</dt><dd>${relationshipBadge(item.relationship)}</dd>
          <dt>${t("tags")}</dt><dd>${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</dd>
          <dt>${t("lastTouch")}</dt><dd>${date(item.last_touch_at)}</dd>
          <dt>${t("nextFollowup")}</dt><dd>${item.next_followup_at ? date(item.next_followup_at) : "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function followupFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all" ? followups().length : followups().filter((item) => effectiveStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.followupFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function renderFollowups() {
  els.title.textContent = t("followups");
  const items = filteredFollowups();
  const reviewCount = followups().filter((item) => effectiveStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("needReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${followupFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveStatus(item);
            const contact = contactById(item.contact_id);
            const deal = dealById(item.deal_id);
            const decision = decisionFor(item.followup_id);
            const edits = state.edits[item.followup_id] || {};
            const draft = edits.draft ?? decision?.draft ?? item.suggested_reply ?? "";
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-followup="${escapeHtml(item.followup_id)}">
            <header class="queue-head">
              <span class="queue-ref">${t("followupRef")} #${item.ref}</span>
              ${statusBadge(status)}
              ${riskBadges(item.risk)}
              <span class="queue-due muted">${t("due")} ${date(item.due_at)}</span>
            </header>
            <div class="queue-meta">
              ${contact ? `<a href="#/contacts/${encodeURIComponent(contact.contact_id)}">${escapeHtml(contact.name)}</a> · ${escapeHtml(companyName(contact.company_id))}` : ""}
              ${deal ? ` · <a href="#/deals/${encodeURIComponent(deal.deal_id)}">${escapeHtml(deal.name)}</a>` : ""}
              · <span class="badge">${escapeHtml(enumLabel(item.channel_type, "type"))}</span>
            </div>
            ${item.subject ? `<div class="queue-subject strong">${escapeHtml(item.subject)}</div>` : ""}
            <p class="queue-reason"><span class="muted">${t("reason")}:</span> ${escapeHtml(item.reason || "")}</p>
            <label class="queue-label">${t("draft")}</label>
            <textarea class="queue-draft" data-field="draft" rows="7" ${disabled}>${escapeHtml(draft)}</textarea>
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
          .join("") || `<div class="empty">${t("noFollowups")}</div>`
      }
    </div>
  `;
  bindFollowupEvents();
}

function bindFollowupEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.followupFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.followup;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      submitDecision(card.dataset.followup, button.dataset.action, card);
    });
  });
}

async function submitDecision(followupId, action, card) {
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
    body: JSON.stringify({ followup_id: followupId, action, comment: note, draft }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = body.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[followupId];
  state.notice = t("saved");
  await loadState();
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const operator = summary.operator || {};
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
        <h2>${t("stages")}</h2>
        <div class="stage-list">${(summary.pipeline_stages || []).map((stage) => stageBadge(stage)).join(" ")}</div>
        <dl>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "USD")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("channels")}</h2>
        ${
          (summary.channels || [])
            .map(
              (channel) => `
          <div class="settings-channel">
            <strong>${escapeHtml(channel.display_name)}</strong>
            <span>${escapeHtml(channel.type)}${channel.handoff_skill ? ` · ${escapeHtml(channel.handoff_skill)}` : ""}</span>
            <span class="${channel.secrets_ready ? "ok" : "warn"}">${channel.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}
