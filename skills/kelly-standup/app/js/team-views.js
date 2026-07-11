import {
  REMINDER_STATUSES,
  avatar,
  blockerAgeDays,
  blockersList,
  channelBadge,
  dateTimeLabel,
  dayBoard,
  dayByDate,
  dayLabel,
  days,
  digestPanel,
  els,
  enumLabel,
  escapeHtml,
  itemList,
  matchesQuery,
  memberById,
  memberName,
  members,
  moodDot,
  participationBar,
  reminders,
  render,
  severityBadge,
  state,
  statusBadge,
  t,
  timeLabel,
  updateBlockerRows,
} from "../app.js";
export function renderMembers() {
  const rows = members().filter((member) => matchesQuery([member.name, member.role, member.timezone, member.channel]));
  els.title.textContent = t("members");
  els.subtitle.textContent = `${rows.length} ${t("members").toLowerCase()}`;
  els.content.innerHTML = rows.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th><th>${t("timezone")}</th><th>${t("channel")}</th><th>${t("streak")}</th><th>${t("participation30d")}</th><th>${t("openBlockersLabel")}</th><th>${t("lastSubmission")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (member) => `
            <tr>
              <td class="cell-text">
                <a class="member-cell" href="#/members/${encodeURIComponent(member.member_id)}">
                  ${avatar(member)}
                  <span><span class="strong">${escapeHtml(member.name)}</span><small class="muted"> ${escapeHtml(member.role || "")}</small></span>
                </a>
              </td>
              <td>${escapeHtml(member.timezone || "")}</td>
              <td>${channelBadge(member.channel || "slack")}</td>
              <td>${member.streak ?? 0} ${t("days")}</td>
              <td><span class="participation-cell">${participationBar(Math.round((member.participation_30d || 0) * 100), 100)} ${Math.round((member.participation_30d || 0) * 100)}%</span></td>
              <td>${member.open_blockers ? `<a href="#/blockers">${member.open_blockers}</a>` : "0"}</td>
              <td>${member.last_submitted_date ? escapeHtml(dayLabel(member.last_submitted_date)) : "—"}</td>
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

export function renderMemberDetail() {
  const member = memberById(state.route.id);
  if (!member) {
    renderMembers();
    return;
  }
  const openBlockers = blockersList().filter(
    (blocker) => blocker.member_id === member.member_id && blocker.status === "open",
  );
  const timeline = days()
    .map((day) => ({ day, update: (day.updates || []).find((update) => update.member_id === member.member_id) }))
    .reverse()
    .slice(0, 10);
  els.title.textContent = member.name;
  els.subtitle.textContent = `${member.role || ""}${member.timezone ? ` · ${member.timezone}` : ""}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/members">← ${t("members")}</a>
    <section class="detail">
      <div class="detail-main">
        ${
          openBlockers.length
            ? `
          <div class="panel">
            <h2>${t("openBlockersLabel")}</h2>
            ${openBlockers
              .map(
                (blocker) => `
              <div class="blocker-row">
                ${severityBadge(blocker.severity)}
                <span class="blocker-text">${escapeHtml(blocker.text)}</span>
                <span class="muted">${escapeHtml(dayLabel(blocker.raised_date))} · ${blockerAgeDays(blocker)} ${t("days")}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="panel">
          <h2>${t("recentUpdates")}</h2>
          <ol class="timeline">
            ${timeline
              .map(
                ({ day, update }) => `
              <li class="timeline-item ${update ? "" : "missed"}">
                <div class="timeline-head">
                  <strong><a href="#/history/${encodeURIComponent(day.date)}">${escapeHtml(dayLabel(day.date))}</a></strong>
                  ${update ? `<span class="muted">${escapeHtml(timeLabel(update.submitted_at))} ${t("via")} ${escapeHtml(enumLabel(update.source, "source"))}</span> ${moodDot(update.mood)}` : `<span class="muted">${(day.on_leave || []).includes(member.member_id) ? t("onLeave") : t("notSubmitted")}</span>`}
                </div>
                ${
                  update
                    ? `
                  <div class="timeline-cols">
                    <div><h4>${t("yesterday")}</h4><ul>${itemList(update.yesterday)}</ul></div>
                    <div><h4>${t("todayPlan")}</h4><ul>${itemList(update.today)}</ul></div>
                  </div>
                  ${updateBlockerRows(update)}
                `
                    : ""
                }
              </li>
            `,
              )
              .join("")}
          </ol>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("memberDetail")}</h2>
        <dl>
          <dt>${t("role")}</dt><dd>${escapeHtml(member.role || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(member.timezone || "")}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(member.channel || "slack")}</dd>
          <dt>${t("streak")}</dt><dd>${member.streak ?? 0} ${t("days")}</dd>
          <dt>${t("participation30d")}</dt><dd>${Math.round((member.participation_30d || 0) * 100)}%</dd>
          <dt>${t("openBlockersLabel")}</dt><dd>${member.open_blockers ?? 0}</dd>
          <dt>${t("lastSubmission")}</dt><dd>${member.last_submitted_date ? escapeHtml(dayLabel(member.last_submitted_date)) : "—"}</dd>
          <dt>${t("notes")}</dt><dd>${escapeHtml(member.notes || "—")}</dd>
        </dl>
      </aside>
    </section>
  `;
}

export function renderBlockers() {
  const all = blockersList();
  const filtered = all
    .filter((blocker) => state.blockerFilter === "all" || blocker.status === state.blockerFilter)
    .filter((blocker) =>
      matchesQuery([
        blocker.text,
        memberName(blocker.member_id),
        blocker.severity,
        blocker.status,
        blocker.suggested_action,
      ]),
    );
  const chip = (key, label, count) => `
    <button type="button" class="chip ${state.blockerFilter === key ? "active" : ""}" data-blocker-filter="${key}" title="${escapeHtml(label)}">
      ${escapeHtml(label)} <span>${count}</span>
    </button>
  `;
  els.title.textContent = t("blockers");
  els.subtitle.textContent = `${all.filter((blocker) => blocker.status === "open").length} ${t("openBlockers")}`;
  els.content.innerHTML = `
    <div class="chip-row">
      ${chip("open", enumLabel("open", "blocker_status"), all.filter((blocker) => blocker.status === "open").length)}
      ${chip("resolved", enumLabel("resolved", "blocker_status"), all.filter((blocker) => blocker.status === "resolved").length)}
      ${chip("all", t("all"), all.length)}
    </div>
    <div class="blocker-list">
      ${
        filtered
          .map((blocker) => {
            const owner = memberById(blocker.member_id);
            return `
          <article class="blocker-card ${escapeHtml(blocker.status)} sev-${escapeHtml(blocker.severity)}">
            <header class="blocker-head">
              ${severityBadge(blocker.severity)}
              ${statusBadge(blocker.status, "blocker_status")}
              <a class="member-cell" href="#/members/${encodeURIComponent(blocker.member_id)}">${avatar(owner)} <span>${escapeHtml(memberName(blocker.member_id))}</span></a>
              <span class="muted">${t("raised")} ${escapeHtml(dayLabel(blocker.raised_date))} · ${t("age")} ${blockerAgeDays(blocker)} ${t("days")}</span>
            </header>
            <p class="blocker-text">${escapeHtml(blocker.text)}</p>
            ${
              blocker.suggested_action
                ? `
              <div class="reason">
                <span>${t("suggestedAction")}</span>
                ${escapeHtml(blocker.suggested_action)}
              </div>
            `
                : ""
            }
            <div class="blocker-foot">
              <a href="#/history/${encodeURIComponent(blocker.raised_date)}">${t("linkedUpdate")}: ${escapeHtml(dayLabel(blocker.raised_date))}</a>
              ${blocker.resolved_date ? `<span class="muted">${t("resolved")}: ${escapeHtml(dayLabel(blocker.resolved_date))}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noBlockers")}</div>`
      }
    </div>
  `;
}

function reminderCard(reminder) {
  const locked = Boolean(state.settings?.lock);
  const terminal = ["done"].includes(reminder.status);
  const disabled = locked || terminal ? "disabled" : "";
  const target = memberById(reminder.member_id);
  return `
    <article class="proposal-card status-edge-${escapeHtml(reminder.status)}">
      <header class="proposal-head">
        <span class="ref">Reminder #${reminder.ref}</span>
        ${statusBadge(reminder.status, "reminder_status")}
        <span class="badge type-badge">${escapeHtml(enumLabel(reminder.type, "reminder_type"))}</span>
        ${channelBadge(reminder.channel)}
      </header>
      <h3>${escapeHtml(reminder.title)}</h3>
      <p class="muted">
        ${t("target")}: <a class="member-cell inline" href="#/members/${encodeURIComponent(reminder.member_id)}">${avatar(target)} <span>${escapeHtml(memberName(reminder.member_id))}</span></a>
      </p>
      <div class="reason"><span>${t("reason")}</span>${escapeHtml(reminder.reason)}</div>
      <label class="note-label">${t("messageDraft")}
        <textarea data-draft-for="${escapeHtml(reminder.id)}" rows="3" ${disabled}>${escapeHtml(reminder.draft || "")}</textarea>
      </label>
      <label class="note-label">${t("reviewNote")}
        <textarea data-note-for="${escapeHtml(reminder.id)}" rows="2" ${disabled}>${escapeHtml(reminder.decision?.note || "")}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-decision="approve" data-id="${escapeHtml(reminder.id)}" title="${t("approve")}" ${disabled}>${t("approve")}</button>
        <button type="button" data-decision="request_changes" data-id="${escapeHtml(reminder.id)}" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
        <button type="button" data-decision="revise" data-id="${escapeHtml(reminder.id)}" title="${t("saveNote")}" ${disabled}>${t("saveNote")}</button>
        <button type="button" class="danger" data-decision="block" data-id="${escapeHtml(reminder.id)}" title="${t("block")}" ${disabled}>${t("block")}</button>
      </div>
      ${
        reminder.decision
          ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(reminder.decision.action, "action"))}</strong>
          ${reminder.decision.note ? `<span>${escapeHtml(reminder.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(reminder.decision.decided_at ? dateTimeLabel(reminder.decision.decided_at) : "")}${reminder.decision.action === "request_changes" ? ` · ${t("agentQueued")}` : ""}</small>
        </div>
      `
          : ""
      }
      ${
        reminder.execution
          ? `
        <div class="execution-info">
          ${(reminder.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(enumLabel(op.channel, "channel"))} · ${escapeHtml(memberName(op.target))}</div>`).join("")}
          <small>${escapeHtml(reminder.execution.detail || "")}</small>
        </div>
      `
          : ""
      }
    </article>
  `;
}

export function renderReminders() {
  const all = reminders();
  const filtered = all
    .filter((reminder) => state.reminderFilter === "all" || reminder.status === state.reminderFilter)
    .filter((reminder) =>
      matchesQuery([
        reminder.title,
        reminder.reason,
        reminder.draft,
        memberName(reminder.member_id),
        reminder.status,
        reminder.channel,
      ]),
    );
  const chip = (key, label, count) => `
    <button type="button" class="chip ${state.reminderFilter === key ? "active" : ""}" data-reminder-filter="${key}" title="${escapeHtml(label)}">
      ${escapeHtml(label)} <span>${count}</span>
    </button>
  `;
  els.title.textContent = t("reminders");
  els.subtitle.textContent = `${all.filter((reminder) => reminder.status === "needs_review").length} ${t("remindersToReview")}`;
  els.content.innerHTML = `
    <div class="chip-row">
      ${chip("all", t("all"), all.length)}
      ${REMINDER_STATUSES.map((status) => chip(status, enumLabel(status, "reminder_status"), all.filter((reminder) => reminder.status === status).length)).join("")}
    </div>
    ${state.demo ? `<div class="demo-note">${t("demoDecisionNote")}</div>` : ""}
    ${state.settings?.lock ? `<div class="warnings"><div class="warning"><strong>${escapeHtml(state.settings.lock.message || "Agent lock present")}</strong></div></div>` : ""}
    <div class="proposal-list">
      ${filtered.map((reminder) => reminderCard(reminder)).join("") || `<div class="empty">${t("empty")}</div>`}
    </div>
  `;
}

export function renderHistory() {
  const list = days().slice().reverse();
  els.title.textContent = t("history");
  els.subtitle.textContent = `${list.length} ${t("days")}`;
  els.content.innerHTML = list.length
    ? `
    <div class="history-list">
      ${list
        .map(
          (day) => `
        <a class="history-row" href="#/history/${encodeURIComponent(day.date)}">
          <span class="history-date"><strong>${escapeHtml(dayLabel(day.date))}</strong></span>
          <span class="history-participation">
            ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
            <span class="muted">${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</span>
          </span>
          <span class="history-digest">${escapeHtml(day.digest || "")}</span>
        </a>
      `,
        )
        .join("")}
    </div>
  `
    : `<div class="empty">${t("empty")}</div>`;
}

export function renderHistoryDetail() {
  const day = dayByDate(state.route.id);
  if (!day) {
    renderHistory();
    return;
  }
  els.title.textContent = dayLabel(day.date);
  els.subtitle.textContent = `${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0} ${t("submitted")}`;
  els.content.innerHTML = `
    <a class="back-link" href="#/history">← ${t("history")}</a>
    ${digestPanel(day)}
    <div class="participation-row">
      <span class="participation-stat"><strong>${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</strong> ${t("submitted")}</span>
      ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
    </div>
    ${dayBoard(day)}
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
          <dt>${t("team")}</dt><dd>${escapeHtml(summary.team?.name || "")}</dd>
          <dt>${t("timezone")}</dt><dd>${escapeHtml(summary.team?.timezone || "")}</dd>
          <dt>${t("workdays")}</dt><dd>${(summary.team?.workdays || []).map((day) => `<span class="badge">${escapeHtml(enumLabel(day, "workday"))}</span>`).join(" ")}</dd>
          <dt>${t("digestStyle")}</dt><dd>${escapeHtml(summary.digest_style || "")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("members")}</h2>
        ${
          (summary.members || [])
            .map(
              (member) => `
          <div class="settings-account">
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(member.role || "")}${member.timezone ? ` · ${escapeHtml(member.timezone)}` : ""} · ${escapeHtml(enumLabel(member.channel, "channel"))}</span>
            <span><code>${escapeHtml(member.contact_env || "")}</code> ${member.contact_ready ? t("contactReady") : t("contactMissing")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("standupQuestions")}</h2>
        ${
          (summary.standup_questions || [])
            .map(
              (question, index) => `
          <div class="settings-question"><span class="muted">${index + 1}.</span> ${escapeHtml(question)}</div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

/* Decisions */

export async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
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
