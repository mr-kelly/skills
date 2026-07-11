import {
  BOARD_STATUSES,
  CATEGORIES,
  DISPATCH_STATUSES,
  URGENCIES,
  categoryBadge,
  channelBadge,
  crewName,
  date,
  els,
  enumLabel,
  escapeHtml,
  filteredIntake,
  filteredProposals,
  filteredTickets,
  formatAge,
  intakeItems,
  proposals,
  render,
  slaBadge,
  state,
  statusBadge,
  t,
  ticketById,
  tickets,
  urgencyBadge,
  warnings,
} from "../app.js";
export function renderIntake() {
  const items = filteredIntake();
  els.title.textContent = t("intake");
  els.subtitle.textContent = `${items.length} ${t("intakeItems")}`;
  els.content.innerHTML = items.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("channel")}</th><th>${t("received")}</th><th>${t("reporter")}</th><th>${t("unit")} / ${t("location")}</th><th>${t("text")}</th><th>${t("urgencyGuess")}</th><th>${t("triageState")}</th><th>${t("ticket")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${channelBadge(item.channel)}</td>
              <td>${date(item.received_at)}</td>
              <td>${escapeHtml(item.reporter)}</td>
              <td>${escapeHtml([item.unit, item.location].filter(Boolean).join(" · "))}</td>
              <td class="cell-text"><a href="#/intake/${encodeURIComponent(item.id)}"><span class="strong">${escapeHtml(item.text)}</span></a></td>
              <td>${urgencyBadge(item.urgency_guess)}</td>
              <td>${statusBadge(item.triage_state, "triage")}</td>
              <td>${item.ticket_id ? `<a class="ticket-link" href="#/board/${encodeURIComponent(item.ticket_id)}">${escapeHtml(item.ticket_id)}</a>` : ""}</td>
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

function classificationEditor(item) {
  const locked = Boolean(state.settings?.lock);
  const done = item.triage_state === "ticketed" || item.triage_state === "ignored";
  const disabled = locked || done ? "disabled" : "";
  return `
    <div class="editor-panel">
      <h2>${t("classification")}</h2>
      <div class="editor-grid">
        <label>${t("category")}
          <select data-field="category" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${CATEGORIES.map((category) => `<option value="${category}" ${category === item.category_guess ? "selected" : ""}>${escapeHtml(enumLabel(category, "category"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("urgency")}
          <select data-field="urgency" data-for="${escapeHtml(item.id)}" ${disabled}>
            ${URGENCIES.map((urgency) => `<option value="${urgency}" ${urgency === item.urgency_guess ? "selected" : ""}>${escapeHtml(enumLabel(urgency, "urgency"))}</option>`).join("")}
          </select>
        </label>
        <label>${t("unit")}
          <input type="text" data-field="unit" data-for="${escapeHtml(item.id)}" value="${escapeHtml(item.unit || "")}" ${disabled}>
        </label>
      </div>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(item.id)}" rows="2" ${disabled}></textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="convert_to_ticket" data-id="${escapeHtml(item.id)}" ${disabled}>${t("convertToTicket")}</button>
        <button type="button" class="danger" data-decision="ignore" data-id="${escapeHtml(item.id)}" ${disabled}>${t("ignore")}</button>
      </div>
      ${
        item.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(item.decision.action, "action"))}</strong>
          ${item.decision.note ? `<span>${escapeHtml(item.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(item.decision.decided_at ? new Date(item.decision.decided_at).toLocaleString() : "")} · ${t("agentQueued")}</small>
        </div>
      `
          : ""
      }
      ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    </div>
  `;
}

export function renderIntakeDetail() {
  const item = intakeItems().find((entry) => entry.id === state.route.id);
  if (!item) {
    renderIntake();
    return;
  }
  els.title.textContent = `${enumLabel(item.channel, "channel")} · ${item.reporter}`;
  els.subtitle.textContent = `${date(item.received_at)} · ${enumLabel(item.triage_state, "triage")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/intake">← ${t("intake")}</a>
    <section class="detail">
      <div class="detail-main">
        <div class="text-panel">
          <div class="text-head">${channelBadge(item.channel)} ${urgencyBadge(item.urgency_guess)} ${statusBadge(item.triage_state, "triage")}</div>
          <p class="full-text">${escapeHtml(item.text)}</p>
          ${item.attachments_note ? `<p class="muted">${t("attachments")}: ${escapeHtml(item.attachments_note)}</p>` : ""}
        </div>
        ${classificationEditor(item)}
      </div>
      <aside class="detail-side">
        <h2>${t("intakeDetail")}</h2>
        <dl>
          <dt>${t("channel")}</dt><dd>${escapeHtml(enumLabel(item.channel, "channel"))} ${item.external_id ? `· ${escapeHtml(item.external_id)}` : ""}</dd>
          <dt>${t("received")}</dt><dd>${date(item.received_at)}</dd>
          <dt>${t("reporter")}</dt><dd>${escapeHtml(item.reporter)}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(item.contact_masked || "")}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(item.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(item.location || "")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(enumLabel(item.category_guess, "category"))}</dd>
          <dt>${t("linkedTicket")}</dt><dd>${item.ticket_id ? `<a class="ticket-link" href="#/board/${encodeURIComponent(item.ticket_id)}">${escapeHtml(item.ticket_id)}</a>` : "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function dispatchFilters() {
  const all = proposals();
  const chip = (key, count) => `
    <button type="button" class="chip ${state.dispatchFilter === key ? "active" : ""}" data-dispatch-filter="${key}" title="${key === "all" ? t("dispatchQueue") : escapeHtml(enumLabel(key, "proposal_status"))}">
      ${key === "all" ? t("dispatchQueue") : escapeHtml(enumLabel(key, "proposal_status"))} <span>${count}</span>
    </button>
  `;
  return `
    <div class="chip-row">
      ${chip("all", all.length)}
      ${DISPATCH_STATUSES.map((status) => chip(status, all.filter((proposal) => proposal.status === status).length)).join("")}
    </div>
  `;
}

function proposalCard(proposal) {
  const ticket = ticketById(proposal.ticket_id);
  const locked = Boolean(state.settings?.lock);
  const terminal = ["done"].includes(proposal.status);
  const disabled = locked || terminal ? "disabled" : "";
  return `
    <article class="proposal-card status-edge-${escapeHtml(proposal.status)}">
      <header class="proposal-head">
        <span class="ref">Dispatch #${proposal.ref}</span>
        ${statusBadge(proposal.status, "proposal_status")}
        <span class="badge priority-${escapeHtml(proposal.priority)}">${escapeHtml(proposal.priority)}</span>
        ${ticket ? slaBadge({ sla_state: ticket.sla_state, sla_due_at: proposal.sla_due_at }) : ""}
      </header>
      <h3>${escapeHtml(proposal.title)}</h3>
      <p class="muted">
        <a class="ticket-link" href="#/board/${encodeURIComponent(proposal.ticket_id)}">${escapeHtml(proposal.ticket_id)}</a>
        ${escapeHtml(proposal.summary)}
      </p>
      <dl class="proposal-meta">
        <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(proposal.proposed_crew_id))}${proposal.proposed_assignee ? ` · ${escapeHtml(proposal.proposed_assignee)}` : ""}</dd>
        <dt>${t("priority")}</dt><dd>${escapeHtml(proposal.priority)}</dd>
        <dt>${t("slaTarget")}</dt><dd>${date(proposal.sla_due_at)} (${proposal.sla_hours}${t("hours")})</dd>
      </dl>
      <div class="reason"><span>${t("reason")}</span>${escapeHtml(proposal.reason)}</div>
      <label class="note-label">${t("noteToCrew")}
        <textarea data-draft-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.note_to_crew || "")}</textarea>
      </label>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(proposal.id)}" rows="2" ${disabled}>${escapeHtml(proposal.decision?.note || "")}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(proposal.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(proposal.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(proposal.id)}" title="${t("saveNote")}" ${disabled}>${t("saveNote")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(proposal.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
      ${
        proposal.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(proposal.decision.action, "action"))}</strong>
          ${proposal.decision.note ? `<span>${escapeHtml(proposal.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(proposal.decision.decided_at ? new Date(proposal.decision.decided_at).toLocaleString() : "")}</small>
        </div>
      `
          : ""
      }
      ${
        proposal.execution
          ? `
        <div class="execution-info">
          ${(proposal.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(op.target || "")} ${escapeHtml(op.detail || "")}</div>`).join("")}
          <small>${escapeHtml(proposal.execution.detail || "")}</small>
        </div>
      `
          : ""
      }
    </article>
  `;
}

export function renderDispatch() {
  const items = filteredProposals();
  els.title.textContent = t("dispatch");
  els.subtitle.textContent = `${proposals().filter((proposal) => proposal.status === "needs_review").length} ${t("dispatchToApprove")}`;
  els.content.innerHTML = `
    ${dispatchFilters()}
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    ${state.settings?.lock ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.settings.lock.message || "Agent lock present")}</strong></div></div>` : ""}
    <div class="proposal-list">
      ${items.map((proposal) => proposalCard(proposal)).join("") || `<div class="empty">${t("empty")}</div>`}
    </div>
  `;
}

function boardTable(items) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("ticket")}</th><th>${t("category")}</th><th>${t("unit")} / ${t("location")}</th><th>${t("crew")}</th><th>${t("age")}</th><th>${t("sla")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (ticket) => `
            <tr>
              <td class="cell-text"><a href="#/board/${encodeURIComponent(ticket.id)}"><span class="ticket-link">${escapeHtml(ticket.id)}</span> <span class="strong">${escapeHtml(ticket.title)}</span></a></td>
              <td>${categoryBadge(ticket.category)} ${urgencyBadge(ticket.urgency)}</td>
              <td>${escapeHtml([ticket.unit, ticket.location].filter(Boolean).join(" · "))}</td>
              <td>${escapeHtml(crewName(ticket.crew_id)) || "—"}</td>
              <td>${formatAge(ticket.created_at)}</td>
              <td>${slaBadge(ticket)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderBoard() {
  const items = filteredTickets();
  els.title.textContent = t("board");
  els.subtitle.textContent = `${items.length} ${t("tickets")}`;
  els.content.innerHTML =
    BOARD_STATUSES.map((status) => {
      const group = items.filter((ticket) => ticket.status === status);
      if (!group.length) return "";
      return `
      <section class="board-group">
        <h2>${escapeHtml(enumLabel(status, "ticket_status"))} <span class="muted">${group.length}</span></h2>
        ${boardTable(group)}
      </section>
    `;
    }).join("") || `<div class="empty">${t("empty")}</div>`;
}

export function renderBoardDetail() {
  const ticket = tickets().find((entry) => entry.id === state.route.id);
  if (!ticket) {
    renderBoard();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const relatedIntake = intakeItems().filter((item) => (ticket.intake_ids || []).includes(item.id));
  els.title.textContent = `${ticket.id} · ${ticket.title}`;
  els.subtitle.textContent = `${enumLabel(ticket.status, "ticket_status")} · ${enumLabel(ticket.category, "category")} · ${enumLabel(ticket.urgency, "urgency")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/board">← ${t("board")}</a>
    ${warnings()}
    <section class="detail">
      <div class="detail-main">
        <div class="timeline-panel">
          <h2>${t("timeline")}</h2>
          <ol class="timeline">
            ${(ticket.history || [])
              .map(
                (event) => `
              <li class="timeline-item event-${escapeHtml(event.event)}">
                <div class="timeline-head">
                  <strong>${escapeHtml(enumLabel(event.event, "event"))}</strong>
                  <span class="muted">${escapeHtml(event.actor || "")} · ${date(event.at)}</span>
                </div>
                ${event.note ? `<p>${escapeHtml(event.note)}</p>` : ""}
              </li>
            `,
              )
              .join("")}
          </ol>
        </div>
        <div class="editor-panel">
          <label class="note-label">${t("resolutionNote")}
            <textarea data-note-for="${escapeHtml(ticket.id)}" rows="3" ${locked ? "disabled" : ""}>${escapeHtml(ticket.resolution_note || "")}</textarea>
          </label>
          <div class="actions">
            <button type="button" class="primary" data-decision="revise" data-id="${escapeHtml(ticket.id)}" title="${t("saveNote")}" ${locked ? "disabled" : ""}>${t("saveNote")}</button>
          </div>
          ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("ticketDetail")}</h2>
        <dl>
          <dt>${t("status")}</dt><dd>${statusBadge(ticket.status, "ticket_status")}</dd>
          <dt>${t("category")}</dt><dd>${escapeHtml(enumLabel(ticket.category, "category"))}</dd>
          <dt>${t("urgency")}</dt><dd>${escapeHtml(enumLabel(ticket.urgency, "urgency"))}</dd>
          <dt>${t("unit")}</dt><dd>${escapeHtml(ticket.unit || "")}</dd>
          <dt>${t("location")}</dt><dd>${escapeHtml(ticket.location || "")}</dd>
          <dt>${t("crew")}</dt><dd>${escapeHtml(crewName(ticket.crew_id)) || "—"}</dd>
          <dt>${t("assignee")}</dt><dd>${escapeHtml(ticket.assignee || "")}</dd>
          <dt>${t("created")}</dt><dd>${date(ticket.created_at)}</dd>
          <dt>${t("updated")}</dt><dd>${date(ticket.updated_at)}</dd>
          <dt>${t("slaTarget")}</dt><dd>${slaBadge(ticket)}</dd>
          <dt>${t("reporter")}</dt><dd>${escapeHtml(ticket.reporter || "")}</dd>
          <dt>${t("reporterContact")}</dt><dd>${escapeHtml(ticket.contact_masked || "")}</dd>
          <dt>${t("intake")}</dt><dd>${relatedIntake.map((item) => `<a href="#/intake/${encodeURIComponent(item.id)}">${escapeHtml(item.id)}</a>`).join(", ") || "—"}</dd>
        </dl>
      </aside>
    </section>
  `;
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("property")}</dt><dd>${escapeHtml(summary.property?.name || "")} · ${summary.property?.buildings || 0} ${t("buildings")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(summary.property?.timezone || "")}</dd>
          <dt>${t("channels")}</dt><dd>${(summary.channels || []).map((channel) => channelBadge(channel)).join(" ")}</dd>
          <dt>${t("categories")}</dt><dd>${(summary.categories || []).map((category) => categoryBadge(category)).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("crews")}</h2>
        ${
          (summary.crews || [])
            .map(
              (crew) => `
          <div class="settings-account">
            <strong>${escapeHtml(crew.name)}</strong>
            <span>${escapeHtml((crew.skills || []).map((skill) => enumLabel(skill, "category")).join(" · "))}</span>
            <span><code>${escapeHtml(crew.contact_env || "")}</code> ${crew.contact_ready ? t("contactReady") : t("contactMissing")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("slaRules")}</h2>
        ${
          (summary.sla_rules || [])
            .map(
              (rule) => `
          <div class="settings-account">
            <strong>${escapeHtml(rule.category === "*" ? "*" : enumLabel(rule.category, "category"))}</strong>
            <span>${escapeHtml(enumLabel(rule.urgency, "urgency"))}</span>
            <span>${rule.hours}${t("hours")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
        <p class="muted">${t("defaultSla")}: ${summary.sla_default_hours || 72}${t("hours")}</p>
      </section>
    </div>
  `;
}

export async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  const fields = {};
  document.querySelectorAll(`[data-field][data-for="${cssAttr(id)}"]`).forEach((input) => {
    fields[input.dataset.field] = input.value;
  });
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      fields: Object.keys(fields).length ? fields : null,
      decided_at: new Date().toISOString(),
    };
    render();
    return;
  }
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      fields: Object.keys(fields).length ? fields : null,
    }),
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

function cssAttr(value) {
  return String(value).replaceAll('"', '\\"');
}
