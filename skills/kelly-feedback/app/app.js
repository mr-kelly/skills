import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-feedback-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
  edits: { draft: {}, note: {}, effort: {}, assign: {} },
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-feedback.sidebarCollapsed";

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
  decisionCount: document.querySelector("#count-decisions"),
  newCount: document.querySelector("#count-new"),
  needsInfoCount: document.querySelector("#count-needsinfo"),
  language: document.querySelector("#language"),
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
  return String(lang || "auto")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : lang || "auto";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value, group = "status") {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[group]?.[key] || messages.en.enum?.[group]?.[key] || key.replaceAll("_", " ");
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return t("notAvailable");
  const ref = state.snapshot?.generated_at ? new Date(state.snapshot.generated_at) : new Date();
  const diffMs = ref.getTime() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  const rtf = new Intl.RelativeTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", { numeric: "always" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
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
  const scenario = state.settings.demo_scenario || "overview";
  const route =
    scenario === "inbox"
      ? "#/inbox"
      : scenario === "requests"
        ? "#/requests"
        : scenario === "roadmap"
          ? "#/roadmap"
          : scenario === "detail"
            ? "#/requests/req-csv-export"
            : "#/overview";
  history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
  state.route = parseRoute();
}

function applyI18n() {
  document.documentElement.lang = activeLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  const languageLabels =
    activeLang() === "zh" ? { auto: "自动", en: "English", zh: "中文" } : { auto: "Auto", en: "English", zh: "中文" };
  for (const option of els.language.options) {
    option.textContent = languageLabels[option.value] || option.textContent;
  }
  els.search.placeholder = t("search");
  els.refresh.textContent = t("refresh");
  if (els.mobileRefresh) els.mobileRefresh.title = t("refresh");
}

function feedbackItems() {
  return (state.snapshot?.feedback || []).map(effectiveFeedback);
}

function requests() {
  return state.snapshot?.requests || [];
}

function proposals() {
  return (state.snapshot?.proposals || []).map(effectiveProposal);
}

function decisions() {
  return state.settings?.decisions || { proposals: {}, feedback: {}, requests: {} };
}

function effectiveProposal(proposal) {
  const decision = decisions().proposals?.[proposal.proposal_id];
  if (!decision) return proposal;
  const statusByAction = { approve: "approved", request_changes: "changes_requested", block: "blocked" };
  return {
    ...proposal,
    status: statusByAction[decision.action] || proposal.status,
    review_note: decision.review_note || proposal.review_note,
    draft: typeof decision.draft === "string" ? decision.draft : proposal.draft,
    decided_at: decision.decided_at || proposal.decided_at,
  };
}

function effectiveFeedback(item) {
  const decision = decisions().feedback?.[item.feedback_id];
  if (!decision) return item;
  const triageByAction = { assign: "clustered", ignore: "ignored", insight: "insight" };
  return {
    ...item,
    triage: triageByAction[decision.action] || item.triage,
    request_id: decision.action === "assign" ? decision.request_id || item.request_id : item.request_id,
  };
}

function decisionsWaiting() {
  return proposals().filter((item) => item.status === "needs_review").length;
}

function renderShell() {
  applyI18n();
  const snapshot = state.snapshot;
  const waiting = decisionsWaiting();
  const fresh = feedbackItems().filter((item) => item.triage === "new").length;
  const needsInfo = requests().filter((item) => item.status === "needs_info").length;
  const total = feedbackItems().length;
  els.syncStatus.textContent =
    snapshot && total ? `${total} ${t("items")} · ${requests().length} ${t("requests").toLowerCase()}` : t("empty");
  if (els.decisionCount) els.decisionCount.textContent = waiting;
  if (els.newCount) els.newCount.textContent = fresh;
  if (els.needsInfoCount) els.needsInfoCount.textContent = needsInfo;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = waiting
      ? `${waiting} ${t("decisionsWaiting")}`
      : fresh
        ? `${fresh} ${t("newUncategorized")}`
        : `${total} ${t("items")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function viewLabel(view) {
  if (view === "inbox") return t("inbox");
  if (view === "requests") return t("requests");
  if (view === "roadmap") return t("roadmap");
  if (view === "settings") return t("settings");
  return t("overview");
}

function lockBanner() {
  if (!state.settings?.lock) return "";
  return `<div class="lock-banner">${escapeHtml(t("lockActive"))}${state.settings.lock.message ? ` — ${escapeHtml(state.settings.lock.message)}` : ""}</div>`;
}

function channelBadge(channel) {
  return `<span class="channel-badge channel-${escapeHtml(channel)}">${escapeHtml(enumLabel(channel, "channel"))}</span>`;
}

function sentimentBadge(sentiment) {
  return `<span class="sentiment ${escapeHtml(sentiment)}">${escapeHtml(enumLabel(sentiment, "sentiment"))}</span>`;
}

function triageBadge(triage) {
  return `<span class="triage-badge triage-${escapeHtml(triage)}">${escapeHtml(enumLabel(triage, "triage"))}</span>`;
}

function statusBadge(status) {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(enumLabel(status))}</span>`;
}

function trendArrow(trend) {
  const glyph = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return `<span class="trend trend-${escapeHtml(trend)}" title="${escapeHtml(enumLabel(trend, "trend"))}">${glyph} ${escapeHtml(enumLabel(trend, "trend"))}</span>`;
}

function productName(productId) {
  return state.snapshot?.products?.find((product) => product.product_id === productId)?.display_name || productId;
}

function requestById(requestId) {
  return requests().find((item) => item.request_id === requestId);
}

function requestLink(requestId) {
  const request = requestById(requestId);
  if (!request) return `<span class="muted">${escapeHtml(t("noRequest"))}</span>`;
  return `<a class="request-link" href="#/requests/${encodeURIComponent(request.request_id)}">${escapeHtml(request.title)}</a>`;
}

function preview(text, length = 110) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

// ---------- Overview ----------

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = state.snapshot?.generated_at
    ? `${t("generated")} ${new Date(state.snapshot.generated_at).toLocaleString()}`
    : t("empty");
  const metrics = state.snapshot?.metrics || {};
  const waiting = decisionsWaiting();
  const fresh = feedbackItems().filter((item) => item.triage === "new").length;
  const needsInfo = requests().filter((item) => item.status === "needs_info").length;
  els.content.innerHTML = `
    ${lockBanner()}
    <div class="metrics attention-cards">
      <a class="metric attention-card" href="#/roadmap"><span>${t("decisionsWaiting")}</span><strong>${waiting}</strong></a>
      <a class="metric attention-card" href="#/inbox"><span>${t("newUncategorized")}</span><strong>${fresh}</strong></a>
      <a class="metric attention-card" href="#/requests"><span>${t("needsInfo")}</span><strong>${needsInfo}</strong></a>
      <a class="metric attention-card" href="#/inbox"><span>${t("feedback")}</span><strong>${metrics.feedback_count ?? feedbackItems().length}</strong></a>
    </div>
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("inflowThisWeek")}</h2>
        ${inflowPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("sentimentSplit")}</h2>
        ${sentimentPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("topClusters")}</h2>
        ${topClustersPanel()}
      </div>
      <div class="overview-panel">
        <h2>${t("freshnessBySource")}</h2>
        ${freshnessPanel()}
      </div>
    </section>
  `;
}

function inflowPanel() {
  const inflow = state.snapshot?.metrics?.week_inflow || {};
  const entries = Object.entries(inflow).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">${t("empty")}</div>`;
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return entries
    .map(
      ([channel, count]) => `
    <div class="inflow-row">
      ${channelBadge(channel)}
      <span class="inflow-bar"><span style="width:${Math.round((count / max) * 100)}%"></span></span>
      <strong class="num">${count}</strong>
    </div>
  `,
    )
    .join("");
}

function sentimentPanel() {
  const sentiment = state.snapshot?.metrics?.sentiment || {};
  const rows = [
    ["positive", "#1f7a4d", sentiment.positive || 0],
    ["neutral", "#64748b", sentiment.neutral || 0],
    ["negative", "#b42318", sentiment.negative || 0],
  ];
  const max = Math.max(...rows.map(([, , count]) => count), 1);
  const barWidth = 210;
  const svgRows = rows
    .map(([key, color, count], index) => {
      const y = index * 26 + 6;
      const width = Math.max(3, Math.round((count / max) * barWidth));
      return `
      <text x="0" y="${y + 11}" class="svg-label">${escapeHtml(enumLabel(key, "sentiment"))}</text>
      <rect x="72" y="${y}" width="${barWidth}" height="14" rx="4" fill="#eef1f5"></rect>
      <rect x="72" y="${y}" width="${width}" height="14" rx="4" fill="${color}" fill-opacity="0.82"></rect>
      <text x="${72 + barWidth + 10}" y="${y + 11}" class="svg-count">${count}</text>
    `;
    })
    .join("");
  return `<svg class="sentiment-svg" viewBox="0 0 320 86" role="img" aria-label="${escapeHtml(t("sentimentSplit"))}">${svgRows}</svg>`;
}

function topClustersPanel() {
  const trendRank = { up: 2, flat: 1, down: 0 };
  const top = [...requests()]
    .sort((a, b) => trendRank[b.trend] - trendRank[a.trend] || b.weighted_score - a.weighted_score)
    .slice(0, 5);
  if (!top.length) return `<div class="empty">${t("empty")}</div>`;
  return top
    .map(
      (request) => `
    <a class="cluster-row" href="#/requests/${encodeURIComponent(request.request_id)}">
      <span class="cluster-copy">
        <strong>${escapeHtml(request.title)}</strong>
        <small>${escapeHtml(productName(request.product))} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}</small>
      </span>
      ${trendArrow(request.trend)}
      ${statusBadge(request.status)}
    </a>
  `,
    )
    .join("");
}

function freshnessPanel() {
  const sources = state.snapshot?.sources || [];
  if (!sources.length) return `<div class="empty">${t("setupNeeded")}</div>`;
  return sources
    .map(
      (source) => `
    <div class="freshness-row">
      ${channelBadge(source.channel)}
      <span class="cluster-copy">
        <strong>${escapeHtml(source.name)}</strong>
        <small>${escapeHtml(source.collection || "")}</small>
      </span>
      <span class="muted">${escapeHtml(relativeTime(source.last_ingest_at))}</span>
      <strong class="num">${source.item_count ?? 0}</strong>
    </div>
  `,
    )
    .join("");
}

// ---------- Inbox ----------

function filteredFeedback() {
  const query = state.query.trim().toLowerCase();
  return feedbackItems().filter((item) => {
    if (!query) return true;
    const request = requestById(item.request_id);
    return [
      item.text,
      item.user?.handle,
      item.channel,
      item.product,
      item.sentiment,
      item.triage,
      request?.title,
      item.source_id,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function feedbackTable(items) {
  if (!items.length) return `<div class="empty">${t("empty")}</div>`;
  const sorted = [...items].sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("received")}</th><th>${t("user")}</th><th>${t("feedback")}</th><th>${t("channel")}</th><th>${t("sentiment")}</th><th>${t("clusterLink")}</th><th>${t("triage")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map(
              (item) => `
            <tr>
              <td class="nowrap">${date(item.received_at)}</td>
              <td><div class="strong">${escapeHtml(item.user?.handle || "")}</div><div class="muted">${escapeHtml(productName(item.product))} · ${escapeHtml(enumLabel(item.user?.plan || "", "status") || item.user?.plan || "")}</div></td>
              <td class="feedback-cell"><a href="#/inbox/${encodeURIComponent(item.feedback_id)}">${escapeHtml(preview(item.text))}</a></td>
              <td>${channelBadge(item.channel)}</td>
              <td>${sentimentBadge(item.sentiment)}</td>
              <td>${requestLink(item.request_id)}</td>
              <td>${triageBadge(item.triage)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInbox() {
  els.title.textContent = t("inbox");
  const items = filteredFeedback();
  els.subtitle.textContent = `${items.length} ${t("items")} · ${items.filter((item) => item.triage === "new").length} ${t("newUncategorized")}`;
  els.content.innerHTML = `${lockBanner()}${feedbackTable(items)}`;
}

function renderInboxDetail() {
  const item = feedbackItems().find((entry) => entry.feedback_id === state.route.id);
  if (!item) {
    renderInbox();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = item.user?.handle || item.feedback_id;
  els.subtitle.textContent = `${enumLabel(item.channel, "channel")} · ${productName(item.product)} · ${date(item.received_at)}`;
  const assignValue = state.edits.assign[item.feedback_id] || item.request_id || "";
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/inbox">← ${t("inbox")}</a>
        <div class="panel">
          <h2>${t("fullText")}</h2>
          <blockquote class="feedback-text">${escapeHtml(item.text)}</blockquote>
          ${item.agent_note ? `<p class="agent-note"><strong>${t("agentNote")}</strong> ${escapeHtml(item.agent_note)}</p>` : ""}
        </div>
        <div class="panel triage-panel">
          <h2>${t("triage")}</h2>
          <div class="triage-actions">
            <select id="assignSelect" ${locked ? "disabled" : ""}>
              <option value="">${escapeHtml(t("noRequest"))}</option>
              ${requests()
                .map(
                  (request) =>
                    `<option value="${escapeHtml(request.request_id)}" ${request.request_id === assignValue ? "selected" : ""}>${escapeHtml(request.title)}</option>`,
                )
                .join("")}
            </select>
            <button type="button" data-action="assign" ${locked ? "disabled" : ""}>${t("assignToRequest")}</button>
            <button type="button" data-action="ignore" ${locked ? "disabled" : ""}>${t("ignore")}</button>
            <button type="button" data-action="insight" ${locked ? "disabled" : ""}>${t("markInsight")}</button>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("userContext")}</h2>
        <dl>
          <dt>${t("user")}</dt><dd>${escapeHtml(item.user?.handle || "")}</dd>
          <dt>${t("plan")}</dt><dd>${escapeHtml(item.user?.plan || "")}</dd>
          <dt>${t("tenure")}</dt><dd>${item.user?.tenure_months ?? 0} ${t("months")}</dd>
          <dt>${t("weight")}</dt><dd>${item.user?.weight ?? 1}</dd>
          <dt>${t("channel")}</dt><dd>${channelBadge(item.channel)}</dd>
          <dt>${t("source")}</dt><dd>${escapeHtml(item.source_id)}</dd>
          <dt>${t("sentiment")}</dt><dd>${sentimentBadge(item.sentiment)}</dd>
          <dt>${t("triage")}</dt><dd>${triageBadge(item.triage)}</dd>
          <dt>${t("clusterLink")}</dt><dd>${requestLink(item.request_id)}</dd>
          <dt>${t("permalink")}</dt><dd>${item.permalink ? `<a href="${escapeHtml(item.permalink)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.permalink)}</a>` : t("notAvailable")}</dd>
        </dl>
      </aside>
    </section>
  `;
  const select = els.content.querySelector("#assignSelect");
  select?.addEventListener("change", () => {
    state.edits.assign[item.feedback_id] = select.value;
  });
  els.content.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      submitDecision({
        kind: "feedback",
        id: item.feedback_id,
        action,
        request_id: action === "assign" ? (state.edits.assign[item.feedback_id] ?? item.request_id ?? "") : "",
      });
    });
  });
}

// ---------- Requests ----------

function filteredRequests() {
  const query = state.query.trim().toLowerCase();
  if (!query) return requests();
  return requests().filter((request) =>
    [request.title, request.product, request.status, request.problem_statement]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function renderRequests() {
  els.title.textContent = t("requests");
  const items = filteredRequests();
  els.subtitle.textContent = `${items.length} ${t("requests").toLowerCase()} · ${items.filter((item) => item.status === "needs_info").length} ${t("needsInfo")}`;
  const sorted = [...items].sort((a, b) => b.weighted_score - a.weighted_score);
  els.content.innerHTML = `
    ${lockBanner()}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("requests")}</th><th>${t("product")}</th><th class="num">${t("frequency")}</th><th class="num">${t("weightedScore")}</th><th>${t("trend")}</th><th>${t("status")}</th><th class="num">${t("linked")}</th><th>${t("updated")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((request) => {
              const linked = feedbackItems().filter((item) => item.request_id === request.request_id).length;
              return `
              <tr>
                <td><a href="#/requests/${encodeURIComponent(request.request_id)}"><strong>${escapeHtml(request.title)}</strong></a><div class="muted">${escapeHtml(preview(request.problem_statement, 90))}</div></td>
                <td><span class="badge">${escapeHtml(productName(request.product))}</span></td>
                <td class="num">${request.frequency}</td>
                <td class="num strong">${request.weighted_score}</td>
                <td>${trendArrow(request.trend)}</td>
                <td>${statusBadge(request.status)}</td>
                <td class="num">${linked}</td>
                <td class="nowrap">${date(request.updated_at)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRequestDetail() {
  const request = requests().find((item) => item.request_id === state.route.id);
  if (!request) {
    renderRequests();
    return;
  }
  const locked = Boolean(state.settings?.lock);
  const linked = feedbackItems().filter((item) => item.request_id === request.request_id);
  const quoteItems = (request.representative_feedback_ids || [])
    .map((id) => feedbackItems().find((item) => item.feedback_id === id))
    .filter(Boolean);
  const effortDecision = decisions().requests?.[request.request_id]?.effort_estimate;
  const effortValue = state.edits.effort[request.request_id] ?? effortDecision ?? request.effort_estimate ?? "";
  els.title.textContent = request.title;
  els.subtitle.textContent = `${productName(request.product)} · ${enumLabel(request.status)} · ${request.frequency} × ${t("weight").toLowerCase()} = ${request.weighted_score}`;
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/requests">← ${t("requests")}</a>
        <div class="panel">
          <h2>${t("problemStatement")}</h2>
          <p>${escapeHtml(request.problem_statement || "")}</p>
          <h2>${t("specSummary")}</h2>
          <p>${escapeHtml(request.spec_summary || "")}</p>
        </div>
        ${
          quoteItems.length
            ? `
          <div class="panel">
            <h2>${t("quotes")}</h2>
            ${quoteItems
              .map(
                (item) => `
              <blockquote class="quote">
                <p>${escapeHtml(item.text)}</p>
                <footer>${escapeHtml(item.user?.handle || "")} · ${channelBadge(item.channel)} · ${date(item.received_at)}</footer>
              </blockquote>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="panel">
          <h2>${t("allLinkedFeedback")} (${linked.length})</h2>
          ${feedbackTable(linked)}
        </div>
      </div>
      <aside class="detail-side">
        <h2>${t("requests")}</h2>
        <dl>
          <dt>${t("product")}</dt><dd>${escapeHtml(productName(request.product))}</dd>
          <dt>${t("status")}</dt><dd>${statusBadge(request.status)}</dd>
          <dt>${t("frequency")}</dt><dd>${request.frequency}</dd>
          <dt>${t("weightedScore")}</dt><dd>${request.weighted_score}</dd>
          <dt>${t("trend")}</dt><dd>${trendArrow(request.trend)}</dd>
          <dt>${t("created")}</dt><dd>${date(request.created_at)}</dd>
          <dt>${t("updated")}</dt><dd>${date(request.updated_at)}</dd>
        </dl>
        <div class="effort-field">
          <label for="effortInput">${t("effortEstimate")}</label>
          <input id="effortInput" type="text" value="${escapeHtml(effortValue)}" ${locked ? "disabled" : ""}>
          <button type="button" id="effortSave" ${locked ? "disabled" : ""}>${t("save")}</button>
        </div>
        <h2>${t("decisionHistory")}</h2>
        <div class="history">
          ${
            (request.decision_history || [])
              .map(
                (entry) => `
            <div class="history-row">
              <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
              <span>${escapeHtml(entry.actor || "")} · ${date(entry.at)}</span>
              ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
            </div>
          `,
              )
              .join("") || `<div class="muted">${t("notAvailable")}</div>`
          }
        </div>
      </aside>
    </section>
  `;
  const effortInput = els.content.querySelector("#effortInput");
  effortInput?.addEventListener("input", () => {
    state.edits.effort[request.request_id] = effortInput.value;
  });
  els.content.querySelector("#effortSave")?.addEventListener("click", () => {
    submitDecision({
      kind: "request",
      id: request.request_id,
      effort_estimate: state.edits.effort[request.request_id] ?? effortValue,
    });
  });
}

// ---------- Roadmap ----------

function renderRoadmap() {
  const items = proposals();
  const waiting = items.filter((item) => item.status === "needs_review").length;
  els.title.textContent = t("roadmap");
  els.subtitle.textContent = `${items.length} ${t("proposal").toLowerCase()} · ${waiting} ${t("decisionsWaiting")}`;
  const roadmap = state.snapshot?.roadmap || { now: [], next: [], later: [] };
  els.content.innerHTML = `
    ${lockBanner()}
    <section class="proposal-list">
      <h2 class="section-title">${t("decisionQueue")}</h2>
      ${items.map((proposal) => proposalCard(proposal)).join("") || `<div class="empty">${t("empty")}</div>`}
    </section>
    <section class="roadmap-board">
      <h2 class="section-title">${t("currentRoadmap")}</h2>
      <div class="roadmap-columns">
        ${["now", "next", "later"]
          .map(
            (laneKey) => `
          <div class="roadmap-column">
            <h3>${escapeHtml(enumLabel(laneKey, "lane"))}</h3>
            ${
              (roadmap[laneKey] || [])
                .map(
                  (item) => `
              <div class="roadmap-card">
                <strong>${escapeHtml(item.title)}</strong>
                ${item.note ? `<p class="muted">${escapeHtml(item.note)}</p>` : ""}
                ${item.request_id ? `<div>${requestLink(item.request_id)}</div>` : ""}
              </div>
            `,
                )
                .join("") || `<div class="muted roadmap-empty">${t("notAvailable")}</div>`
            }
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
  bindProposalCards();
}

function proposalCard(proposal) {
  const locked = Boolean(state.settings?.lock);
  const decided = ["approved", "done", "blocked"].includes(proposal.status);
  const draftValue = state.edits.draft[proposal.proposal_id] ?? proposal.draft ?? "";
  const noteValue = state.edits.note[proposal.proposal_id] ?? proposal.review_note ?? "";
  const showDraft = Boolean(proposal.draft || proposal.draft_kind);
  return `
    <article class="proposal-card" data-proposal="${escapeHtml(proposal.proposal_id)}">
      <header class="proposal-header">
        <span class="proposal-ref">${t("proposal")} #${proposal.ref}</span>
        <span class="badge">${escapeHtml(enumLabel(proposal.type, "type"))}</span>
        ${proposal.target_lane ? `<span class="badge">${t("targetLane")}: ${escapeHtml(enumLabel(proposal.target_lane, "lane"))}</span>` : ""}
        ${statusBadge(proposal.status)}
      </header>
      <h3>${escapeHtml(proposal.title)}</h3>
      <p class="proposal-reason"><strong>${t("reason")}</strong> ${escapeHtml(proposal.reason)}</p>
      ${proposal.evidence ? `<p class="proposal-evidence"><strong>${t("evidence")}</strong> ${escapeHtml(proposal.evidence)}</p>` : ""}
      ${proposal.request_id ? `<p class="proposal-request">${requestLink(proposal.request_id)}${(proposal.request_ids || []).length > 1 ? ` + ${proposal.request_ids.length - 1}` : ""}</p>` : ""}
      ${
        showDraft
          ? `
        <label class="field-label">${t("draft")}${proposal.draft_kind ? ` · ${escapeHtml(proposal.draft_kind.replaceAll("_", " "))}` : ""}</label>
        <textarea class="proposal-draft" data-field="draft" rows="4" ${locked || decided ? "disabled" : ""}>${escapeHtml(draftValue)}</textarea>
      `
          : ""
      }
      <label class="field-label">${t("reviewNote")}</label>
      <textarea class="proposal-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${locked ? "disabled" : ""}>${escapeHtml(noteValue)}</textarea>
      <footer class="proposal-actions">
        <button type="button" data-verdict="approve" class="primary" ${locked || decided ? "disabled" : ""}>${t("approve")}</button>
        <button type="button" data-verdict="request_changes" ${locked || proposal.status === "done" ? "disabled" : ""}>${t("requestChanges")}</button>
        <button type="button" data-verdict="block" ${locked || decided ? "disabled" : ""}>${t("block")}</button>
        ${proposal.decided_at ? `<span class="muted decided-at">${t("decided")} ${date(proposal.decided_at)}</span>` : ""}
      </footer>
    </article>
  `;
}

function bindProposalCards() {
  els.content.querySelectorAll(".proposal-card").forEach((card) => {
    const proposalId = card.dataset.proposal;
    card.querySelectorAll("textarea[data-field]").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        state.edits[textarea.dataset.field === "draft" ? "draft" : "note"][proposalId] = textarea.value;
      });
    });
    card.querySelectorAll("button[data-verdict]").forEach((button) => {
      button.addEventListener("click", () => {
        submitDecision({
          kind: "proposal",
          id: proposalId,
          action: button.dataset.verdict,
          review_note: state.edits.note[proposalId] ?? "",
          draft: state.edits.draft[proposalId],
        });
      });
    });
  });
}

// ---------- Settings ----------

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const scoring = summary.scoring || {};
  const planWeights = Object.entries(scoring.plan_weights || {});
  const syncLog = [...(state.snapshot?.sync_log || [])].reverse().slice(0, 8);
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
          <dt>${t("roadmapLanes")}</dt><dd>${(summary.roadmap_lanes || []).map((laneKey) => escapeHtml(enumLabel(laneKey, "lane"))).join(" · ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("products")}</h2>
        ${
          (summary.products || [])
            .map(
              (product) => `
          <div class="settings-row">
            <strong>${escapeHtml(product.display_name)}</strong>
            <span>${escapeHtml(product.product_id)}</span>
            <span class="muted">${escapeHtml(product.tagline || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("sources")}</h2>
        ${
          (summary.sources || [])
            .map(
              (source) => `
          <div class="settings-row">
            <strong>${escapeHtml(source.name)}</strong>
            <span>${channelBadge(source.channel)} ${escapeHtml(source.collection || "")}</span>
            <span class="${source.secrets_ready ? "positive" : "negative"}">${source.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("scoringWeights")}</h2>
        <dl>
          ${planWeights.map(([plan, weight]) => `<dt>${t("planWeights")} · ${escapeHtml(plan)}</dt><dd>${escapeHtml(String(weight))}</dd>`).join("")}
          <dt>${t("defaultWeight")}</dt><dd>${escapeHtml(String(scoring.default_weight ?? 1))}</dd>
          <dt>${t("recencyHalfLife")}</dt><dd>${escapeHtml(String(scoring.recency_half_life_days ?? 30))}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("syncLog")}</h2>
        ${
          syncLog
            .map(
              (entry) => `
          <div class="settings-row">
            <strong>${escapeHtml(enumLabel(entry.action, "action"))}</strong>
            <span class="muted">${date(entry.at)}</span>
            <span>${escapeHtml(entry.detail || "")}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("empty")}</div>`
        }
      </section>
    </div>
  `;
}

// ---------- Decisions ----------

async function submitDecision(payload) {
  if (state.settings?.lock) {
    toast(t("lockActive"));
    return;
  }
  if (state.settings?.demo) {
    applyDecisionLocally(payload);
    render();
    toast(t("demoNotPersisted"));
    return;
  }
  try {
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const body = await res.json();
    if (state.settings) state.settings.decisions = body.decisions;
    render();
    toast(t("decisionSaved"));
  } catch (error) {
    toast(error.message);
  }
}

function applyDecisionLocally(payload) {
  const now = new Date().toISOString();
  const store = state.settings.decisions || (state.settings.decisions = { proposals: {}, feedback: {}, requests: {} });
  if (payload.kind === "proposal") {
    store.proposals[payload.id] = {
      action: payload.action,
      review_note: payload.review_note || "",
      draft: payload.draft,
      decided_at: now,
    };
  } else if (payload.kind === "feedback") {
    store.feedback[payload.id] = { action: payload.action, request_id: payload.request_id || "", decided_at: now };
  } else if (payload.kind === "request") {
    store.requests[payload.id] = { effort_estimate: payload.effort_estimate || "", decided_at: now };
  }
}

let toastTimer = null;
function toast(message) {
  let node = document.querySelector("#toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
}

// ---------- Router ----------

function render() {
  renderShell();
  if (state.route.view === "inbox" && state.route.id) renderInboxDetail();
  else if (state.route.view === "inbox") renderInbox();
  else if (state.route.view === "requests" && state.route.id) renderRequestDetail();
  else if (state.route.view === "requests") renderRequests();
  else if (state.route.view === "roadmap") renderRoadmap();
  else if (state.route.view === "settings") renderSettings();
  else renderOverview();
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
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
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-feedback-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
