import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  blockerFilter: "open",
  reminderFilter: "all",
  lang: normalizeLang(new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-standup-language") || "auto"),
  demo: new URLSearchParams(location.search).get("demo") || "",
  demoDecisions: {}
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-standup.sidebarCollapsed";
const REMINDER_STATUSES = ["needs_review", "changes_requested", "approved", "done", "blocked"];

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  reviewCount: document.querySelector("#count-review"),
  missingCount: document.querySelector("#count-missing"),
  blockerCount: document.querySelector("#count-blockers"),
  language: document.querySelector("#language")
};

function isMobileLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function syncSidebarState() {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  els.sidebarToggle?.setAttribute("aria-expanded", String(!collapsed));
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  syncSidebarState();
  if (persist) localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
}

function setMobileSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", Boolean(open));
  if (els.sidebarScrim) els.sidebarScrim.hidden = !open;
}

function toggleSidebar() {
  if (isMobileLayout()) {
    setMobileSidebarOpen(!document.body.classList.contains("sidebar-open"));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"));
}

function syncResponsiveShell() {
  if (isMobileLayout()) {
    document.body.classList.remove("sidebar-collapsed");
    setMobileSidebarOpen(false);
  } else {
    setMobileSidebarOpen(false);
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
  }
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function normalizeLang(lang) {
  return String(lang || "auto").toLowerCase().startsWith("zh") ? "zh" : (lang || "auto");
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key]
    || messages.en.enum?.[group]?.[key]
    || key.replaceAll("_", " ");
}

function locale() {
  return activeLang() === "zh" ? "zh-Hans" : "en-US";
}

function dayLabel(isoDate) {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${isoDate}T00:00:00.000Z`));
}

function timeLabel(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: teamTimezone() })
    .format(new Date(iso));
}

function dateTimeLabel(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: teamTimezone() })
    .format(new Date(iso));
}

function teamTimezone() {
  return state.snapshot?.team?.timezone || undefined;
}

function nowMs() {
  if (state.demo && state.snapshot?.generated_at) return Date.parse(state.snapshot.generated_at);
  return Date.now();
}

function ageDays(isoDate) {
  if (!isoDate) return 0;
  return Math.max(0, Math.round((nowMs() - Date.parse(`${isoDate}T00:00:00.000Z`)) / 86400000));
}

function blockerAgeDays(blocker) {
  if (blocker.status === "resolved" && blocker.resolved_date) {
    return Math.max(0, Math.round((Date.parse(`${blocker.resolved_date}T00:00:00.000Z`) - Date.parse(`${blocker.raised_date}T00:00:00.000Z`)) / 86400000));
  }
  return ageDays(blocker.raised_date);
}

function parseRoute() {
  const parts = (location.hash || "#/today").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "today", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
}

async function loadState() {
  const params = new URLSearchParams();
  if (state.demo) params.set("demo", state.demo);
  if (state.lang) params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  const data = await res.json();
  state.snapshot = data.snapshot;
  state.settings = data;
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "today";
  const route = scenario === "members"
    ? "#/members"
    : scenario === "blockers"
      ? "#/blockers"
      : scenario === "history"
        ? "#/history"
        : scenario === "detail"
          ? "#/members/alex"
          : scenario === "reminders"
            ? "#/reminders"
            : "#/today";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels = activeLang() === "zh"
    ? { auto: "自动", en: "English", zh: "中文" }
    : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

/* Data accessors */

function members() {
  return state.snapshot?.members || [];
}

function memberById(memberId) {
  return members().find((member) => member.member_id === memberId);
}

function memberName(memberId) {
  return memberById(memberId)?.name || memberId || "";
}

function days() {
  return [...(state.snapshot?.days || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function latestDay() {
  const list = days();
  return list[list.length - 1] || null;
}

function dayByDate(date) {
  return days().find((day) => day.date === date);
}

function blockersList() {
  return state.snapshot?.blockers || [];
}

function reminders() {
  const list = state.snapshot?.reminders || [];
  if (!state.demo) return list;
  return list.map((reminder) => {
    const local = state.demoDecisions[reminder.id];
    if (!local) return reminder;
    let status = reminder.status;
    if (local.action === "approve") status = "approved";
    if (local.action === "request_changes") status = "changes_requested";
    if (local.action === "block") status = "blocked";
    return { ...reminder, status, decision: local, draft: local.draft ?? reminder.draft };
  });
}

function matchesQuery(values) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
}

function missingMembers(day) {
  if (!day) return [];
  const submitted = new Set((day.updates || []).map((update) => update.member_id));
  const onLeave = new Set(day.on_leave || []);
  return members().filter((member) => member.active !== false && !submitted.has(member.member_id) && !onLeave.has(member.member_id));
}

/* Shell */

function renderShell() {
  applyI18n();
  const metrics = state.snapshot?.metrics || {};
  const reviewCount = reminders().filter((reminder) => reminder.status === "needs_review").length;
  const missing = metrics.missing_today ?? 0;
  const openBlockers = metrics.open_blockers ?? 0;
  els.syncStatus.textContent = state.snapshot?.team?.name || t("empty");
  if (els.reviewCount) els.reviewCount.textContent = reviewCount;
  if (els.missingCount) els.missingCount.textContent = missing;
  if (els.blockerCount) els.blockerCount.textContent = openBlockers;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = reviewCount
      ? `${reviewCount} ${t("remindersToReview")}`
      : `${metrics.submitted_today ?? 0}/${metrics.expected_today ?? 0} ${t("submitted")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "members") return t("members");
  if (view === "blockers") return t("blockers");
  if (view === "reminders") return t("reminders");
  if (view === "history") return t("history");
  if (view === "settings") return t("settings");
  return t("today");
}

/* Shared components */

function sourceBadge(source) {
  return `<span class="badge source-${escapeHtml(source)}">${escapeHtml(enumLabel(source, "source"))}</span>`;
}

function channelBadge(channel) {
  return `<span class="badge source-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function severityBadge(severity) {
  return `<span class="badge severity-${escapeHtml(severity)}">${escapeHtml(enumLabel(severity, "severity"))}</span>`;
}

function statusBadge(status, group) {
  return `<span class="badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status, group))}</span>`;
}

function moodDot(mood) {
  if (!mood) return "";
  return `<span class="mood-dot mood-${escapeHtml(mood)}" title="${t("mood")}: ${escapeHtml(enumLabel(mood, "mood"))}"></span>`;
}

function avatar(member) {
  const initial = (member?.name || "?").trim().charAt(0).toUpperCase();
  return `<span class="avatar">${escapeHtml(initial)}</span>`;
}

function participationBar(submitted, expected) {
  const ratio = expected ? Math.min(1, submitted / expected) : 0;
  const width = Math.round(ratio * 120);
  return `
    <svg class="participation-svg" viewBox="0 0 120 8" width="120" height="8" role="img" aria-label="${submitted}/${expected}" preserveAspectRatio="none">
      <rect x="0" y="0" width="120" height="8" rx="4" class="svg-track"></rect>
      <rect x="0" y="0" width="${width}" height="8" rx="4" class="svg-bar ${ratio >= 1 ? "full" : ""}"></rect>
    </svg>
  `;
}

function itemList(items) {
  if (!items?.length) return `<li class="muted-item">—</li>`;
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function updateBlockerRows(update) {
  if (!update.blockers?.length) return "";
  return `
    <div class="card-section blockers-section">
      <h4>${t("blockersLabel")}</h4>
      ${update.blockers.map((blocker) => `
        <a class="card-blocker ${escapeHtml(blocker.status)}" href="#/blockers">
          ${severityBadge(blocker.severity)}
          ${blocker.status === "resolved" ? statusBadge("resolved", "blocker_status") : ""}
          <span>${escapeHtml(blocker.text)}</span>
        </a>
      `).join("")}
    </div>
  `;
}

function memberCard(member, update) {
  return `
    <article class="member-card">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="#/members/${encodeURIComponent(member.member_id)}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
        ${moodDot(update.mood)}
      </header>
      <div class="member-card-meta">
        <span>${escapeHtml(timeLabel(update.submitted_at))}</span>
        ${sourceBadge(update.source)}
      </div>
      <div class="card-section">
        <h4>${t("yesterday")}</h4>
        <ul>${itemList(update.yesterday)}</ul>
      </div>
      <div class="card-section">
        <h4>${t("todayPlan")}</h4>
        <ul>${itemList(update.today)}</ul>
      </div>
      ${updateBlockerRows(update)}
    </article>
  `;
}

function lastSubmittedBefore(memberId, beforeDate) {
  let last = "";
  for (const day of days()) {
    if (beforeDate && day.date >= beforeDate) continue;
    if ((day.updates || []).some((update) => update.member_id === memberId)) last = day.date;
  }
  return last;
}

function missingCard(member, { withReminderLink = false, beforeDate = "" } = {}) {
  const reminder = withReminderLink
    ? reminders().find((item) => item.member_id === member.member_id && item.type === "missing_checkin" && ["needs_review", "changes_requested", "approved"].includes(item.status))
    : null;
  return `
    <article class="member-card missing">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="#/members/${encodeURIComponent(member.member_id)}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
      </header>
      <div class="missing-body">
        <span class="missing-label">${t("notSubmitted")}</span>
        <span class="muted">${t("lastCheckin")}: ${lastSubmittedBefore(member.member_id, beforeDate) ? escapeHtml(dayLabel(lastSubmittedBefore(member.member_id, beforeDate))) : "—"}</span>
        ${reminder ? `<a class="reminder-link" href="#/reminders">Reminder #${reminder.ref} · ${escapeHtml(enumLabel(reminder.status, "reminder_status"))}</a>` : ""}
      </div>
    </article>
  `;
}

function leaveCard(member) {
  return `
    <article class="member-card on-leave">
      <header class="member-card-head">
        ${avatar(member)}
        <span class="member-card-name">
          <a href="#/members/${encodeURIComponent(member.member_id)}"><strong>${escapeHtml(member.name)}</strong></a>
          <small>${escapeHtml(member.role || "")}</small>
        </span>
      </header>
      <div class="missing-body">
        <span class="badge status-on-leave">${t("onLeave")}</span>
      </div>
    </article>
  `;
}

function dayBoard(day, { withReminderLink = false } = {}) {
  const updatesById = new Map((day.updates || []).map((update) => [update.member_id, update]));
  const onLeave = new Set(day.on_leave || []);
  const cards = members()
    .filter((member) => member.active !== false)
    .filter((member) => matchesQuery([
      member.name,
      member.role,
      ...(updatesById.get(member.member_id)?.yesterday || []),
      ...(updatesById.get(member.member_id)?.today || [])
    ]))
    .map((member) => {
      const update = updatesById.get(member.member_id);
      if (update) return memberCard(member, update);
      if (onLeave.has(member.member_id)) return leaveCard(member);
      return missingCard(member, { withReminderLink, beforeDate: day.date });
    });
  return `<div class="board-grid">${cards.join("") || `<div class="empty">${t("empty")}</div>`}</div>`;
}

function digestPanel(day) {
  if (!day?.digest) return "";
  return `
    <section class="digest-panel">
      <h2>${t("teamDigest")}</h2>
      <p>${escapeHtml(day.digest)}</p>
    </section>
  `;
}

function warnings() {
  const items = state.snapshot?.warnings || [];
  if (!items.length) return "";
  return `<div class="warnings">${items.map((item) => `
    <div class="${escapeHtml(item.severity || "warning")}">
      <strong>${escapeHtml(item.message)}</strong>
      ${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}
    </div>
  `).join("")}</div>`;
}

/* Views */

function renderToday() {
  const day = latestDay();
  const metrics = state.snapshot?.metrics || {};
  els.title.textContent = `${t("today")}${day ? ` · ${dayLabel(day.date)}` : ""}`;
  els.subtitle.textContent = day
    ? `${metrics.submitted_today}/${metrics.expected_today} ${t("submitted")}${metrics.on_leave_today ? ` · ${metrics.on_leave_today} ${t("onLeave").toLowerCase()}` : ""}`
    : t("empty");
  if (!day) {
    els.content.innerHTML = `${warnings()}<div class="empty">${t("empty")}</div>`;
    return;
  }
  const reviewCount = reminders().filter((reminder) => reminder.status === "needs_review").length;
  els.content.innerHTML = `
    ${warnings()}
    <div class="attention-row">
      <a class="attention-card ${metrics.missing_today ? "hot" : ""}" href="#/reminders">
        <strong>${metrics.missing_today ?? 0}</strong>
        <span>${t("missingCheckins")}</span>
      </a>
      <a class="attention-card ${metrics.high_open_blockers ? "hot" : ""}" href="#/blockers">
        <strong>${metrics.open_blockers ?? 0}</strong>
        <span>${t("openBlockersLabel")}</span>
      </a>
      <a class="attention-card ${reviewCount ? "hot" : ""}" href="#/reminders">
        <strong>${reviewCount}</strong>
        <span>${t("awaitingApproval")}</span>
      </a>
    </div>
    ${digestPanel(day)}
    <div class="participation-row">
      <span class="participation-stat"><strong>${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</strong> ${t("submitted")}</span>
      ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
    </div>
    ${dayBoard(day, { withReminderLink: true })}
  `;
}

function renderMembers() {
  const rows = members().filter((member) => matchesQuery([member.name, member.role, member.timezone, member.channel]));
  els.title.textContent = t("members");
  els.subtitle.textContent = `${rows.length} ${t("members").toLowerCase()}`;
  els.content.innerHTML = rows.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("name")}</th><th>${t("timezone")}</th><th>${t("channel")}</th><th>${t("streak")}</th><th>${t("participation30d")}</th><th>${t("openBlockersLabel")}</th><th>${t("lastSubmission")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((member) => `
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
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function renderMemberDetail() {
  const member = memberById(state.route.id);
  if (!member) {
    renderMembers();
    return;
  }
  const openBlockers = blockersList().filter((blocker) => blocker.member_id === member.member_id && blocker.status === "open");
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
        ${openBlockers.length ? `
          <div class="panel">
            <h2>${t("openBlockersLabel")}</h2>
            ${openBlockers.map((blocker) => `
              <div class="blocker-row">
                ${severityBadge(blocker.severity)}
                <span class="blocker-text">${escapeHtml(blocker.text)}</span>
                <span class="muted">${escapeHtml(dayLabel(blocker.raised_date))} · ${blockerAgeDays(blocker)} ${t("days")}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
        <div class="panel">
          <h2>${t("recentUpdates")}</h2>
          <ol class="timeline">
            ${timeline.map(({ day, update }) => `
              <li class="timeline-item ${update ? "" : "missed"}">
                <div class="timeline-head">
                  <strong><a href="#/history/${encodeURIComponent(day.date)}">${escapeHtml(dayLabel(day.date))}</a></strong>
                  ${update ? `<span class="muted">${escapeHtml(timeLabel(update.submitted_at))} ${t("via")} ${escapeHtml(enumLabel(update.source, "source"))}</span> ${moodDot(update.mood)}` : `<span class="muted">${(day.on_leave || []).includes(member.member_id) ? t("onLeave") : t("notSubmitted")}</span>`}
                </div>
                ${update ? `
                  <div class="timeline-cols">
                    <div><h4>${t("yesterday")}</h4><ul>${itemList(update.yesterday)}</ul></div>
                    <div><h4>${t("todayPlan")}</h4><ul>${itemList(update.today)}</ul></div>
                  </div>
                  ${updateBlockerRows(update)}
                ` : ""}
              </li>
            `).join("")}
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

function renderBlockers() {
  const all = blockersList();
  const filtered = all
    .filter((blocker) => state.blockerFilter === "all" || blocker.status === state.blockerFilter)
    .filter((blocker) => matchesQuery([blocker.text, memberName(blocker.member_id), blocker.severity, blocker.status, blocker.suggested_action]));
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
      ${filtered.map((blocker) => {
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
            ${blocker.suggested_action ? `
              <div class="reason">
                <span>${t("suggestedAction")}</span>
                ${escapeHtml(blocker.suggested_action)}
              </div>
            ` : ""}
            <div class="blocker-foot">
              <a href="#/history/${encodeURIComponent(blocker.raised_date)}">${t("linkedUpdate")}: ${escapeHtml(dayLabel(blocker.raised_date))}</a>
              ${blocker.resolved_date ? `<span class="muted">${t("resolved")}: ${escapeHtml(dayLabel(blocker.resolved_date))}</span>` : ""}
            </div>
          </article>
        `;
      }).join("") || `<div class="empty">${t("noBlockers")}</div>`}
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
      ${reminder.decision ? `
        <div class="decision-info">
          <strong>${t("decision")}: ${escapeHtml(enumLabel(reminder.decision.action, "action"))}</strong>
          ${reminder.decision.note ? `<span>${escapeHtml(reminder.decision.note)}</span>` : ""}
          <small>${t("decided")} ${escapeHtml(reminder.decision.decided_at ? dateTimeLabel(reminder.decision.decided_at) : "")}${reminder.decision.action === "request_changes" ? ` · ${t("agentQueued")}` : ""}</small>
        </div>
      ` : ""}
      ${reminder.execution ? `
        <div class="execution-info">
          ${(reminder.execution.operations || []).map((op) => `<div><code>${escapeHtml(op.operation)}</code> → ${escapeHtml(enumLabel(op.channel, "channel"))} · ${escapeHtml(memberName(op.target))}</div>`).join("")}
          <small>${escapeHtml(reminder.execution.detail || "")}</small>
        </div>
      ` : ""}
    </article>
  `;
}

function renderReminders() {
  const all = reminders();
  const filtered = all
    .filter((reminder) => state.reminderFilter === "all" || reminder.status === state.reminderFilter)
    .filter((reminder) => matchesQuery([reminder.title, reminder.reason, reminder.draft, memberName(reminder.member_id), reminder.status, reminder.channel]));
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

function renderHistory() {
  const list = days().slice().reverse();
  els.title.textContent = t("history");
  els.subtitle.textContent = `${list.length} ${t("days")}`;
  els.content.innerHTML = list.length ? `
    <div class="history-list">
      ${list.map((day) => `
        <a class="history-row" href="#/history/${encodeURIComponent(day.date)}">
          <span class="history-date"><strong>${escapeHtml(dayLabel(day.date))}</strong></span>
          <span class="history-participation">
            ${participationBar(day.participation?.submitted ?? 0, day.participation?.expected ?? 0)}
            <span class="muted">${day.participation?.submitted ?? 0}/${day.participation?.expected ?? 0}</span>
          </span>
          <span class="history-digest">${escapeHtml(day.digest || "")}</span>
        </a>
      `).join("")}
    </div>
  ` : `<div class="empty">${t("empty")}</div>`;
}

function renderHistoryDetail() {
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

function renderSettings() {
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
        ${(summary.members || []).map((member) => `
          <div class="settings-account">
            <strong>${escapeHtml(member.name)}</strong>
            <span>${escapeHtml(member.role || "")}${member.timezone ? ` · ${escapeHtml(member.timezone)}` : ""} · ${escapeHtml(enumLabel(member.channel, "channel"))}</span>
            <span><code>${escapeHtml(member.contact_env || "")}</code> ${member.contact_ready ? t("contactReady") : t("contactMissing")}</span>
          </div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
      </section>
      <section>
        <h2>${t("standupQuestions")}</h2>
        ${(summary.standup_questions || []).map((question, index) => `
          <div class="settings-question"><span class="muted">${index + 1}.</span> ${escapeHtml(question)}</div>
        `).join("") || `<div class="empty">${t("setupNeeded")}</div>`}
      </section>
    </div>
  `;
}

/* Decisions */

async function submitDecision(id, action) {
  const note = document.querySelector(`[data-note-for="${cssAttr(id)}"]`)?.value ?? "";
  const draft = document.querySelector(`[data-draft-for="${cssAttr(id)}"]`)?.value;
  if (state.demo) {
    state.demoDecisions[id] = {
      action,
      note,
      draft: typeof draft === "string" ? draft : null,
      decided_at: new Date().toISOString()
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
      draft: typeof draft === "string" ? draft : null
    })
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

function render() {
  renderShell();
  if (state.route.view === "members" && state.route.id) renderMemberDetail();
  else if (state.route.view === "members") renderMembers();
  else if (state.route.view === "blockers") renderBlockers();
  else if (state.route.view === "reminders") renderReminders();
  else if (state.route.view === "history" && state.route.id) renderHistoryDetail();
  else if (state.route.view === "history") renderHistory();
  else if (state.route.view === "settings") renderSettings();
  else renderToday();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", () => setMobileSidebarOpen(true));
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.content.addEventListener("click", (event) => {
  const blockerFilter = event.target.closest("[data-blocker-filter]");
  if (blockerFilter) {
    state.blockerFilter = blockerFilter.dataset.blockerFilter;
    render();
    return;
  }
  const reminderFilter = event.target.closest("[data-reminder-filter]");
  if (reminderFilter) {
    state.reminderFilter = reminderFilter.dataset.reminderFilter;
    render();
    return;
  }
  const button = event.target.closest("[data-decision]");
  if (button && !button.disabled) {
    submitDecision(button.dataset.id, button.dataset.decision);
  }
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-standup-language", state.lang);
  if (state.demo) {
    loadState();
    return;
  }
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
