import { messages, resolveLanguage } from "./js/i18n.js";
import { icon } from "./js/icons.js";
import { createProvider, isDemo } from "./js/providers/index.js";
import { shouldUseLocalGateway } from "./js/runtime.js";
import { buildTimeline, monthGrid, totals } from "./js/view-model.js";
// 遛狗日历 — a read-only calendar of the agent's daily walk decisions, the judge's verdicts, monthly
// totals, the playbook's version timeline, and a "still on v1" control per month.
//
// No approve button anywhere, on purpose: the agent proposes playbook changes as Busabase
// ChangeRequests and a person merges them in Busabase. This app only shows what happened.
import { createAirAppConnectGate } from "./vendor/busabase-airapp-gate.js";

const root = document.getElementById("app");
const lang = resolveLanguage(window.location.search, navigator.languages || []);
const t = messages[lang];
document.documentElement.lang = t.htmlLang;
document.title = t.brand;

const FAMILIES = ["ink-paper", "rose-ochre", "mauve-plum", "coral-amber", "sage-clay", "ink-blush", "graphite"];
const THEME_KEY = "kelly-dog-walk:theme"; // presentation only; changes nothing about the data
const savedTheme = (() => {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
})();
if (FAMILIES.includes(savedTheme)) document.documentElement.dataset.theme = savedTheme;

const state = {
  snapshot: null,
  cache: new Map(), // month → full month view, loaded one bounded page at a time
  loading: new Set(),
  error: null,
  collapsed: false,
  mobileOpen: false,
  background: "#/calendar",
};
let provider = null;

const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const VERDICT_CLASS = { 没淋: "v-dry", 淋雨: "v-wet", 太热: "v-hot", 不方便: "v-off", 待判: "v-pending" };
const VERDICTS = ["没淋", "淋雨", "太热", "不方便", "待判"];
const METRICS = [
  ["wet", "淋雨", () => t.metricWet],
  ["hot", "太热", () => t.metricHot],
  ["off", "不方便", () => t.metricOff],
];

const RULE_EN = {
  default: "Kept the default hour",
  "switched-rain": "The default hour looked wet, so it moved to the driest convenient hour",
  driest: "Picked the driest hour of the day",
  "skipped-heat": "The default hour was forecast too hot, so it moved to a cooler hour",
  "kept-wettest": "The default hour looked wet, but no hour was drier",
};

// ── routing ─────────────────────────────────────────────────────────────────

const parseRoute = () => {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [page = "calendar", month = "", date = ""] = parts;
  return { page: ["calendar", "timeline", "help"].includes(page) ? page : "calendar", month, date };
};

const index = () => state.snapshot?.index || [];
/** Months whose full view is loaded, in calendar order. */
const months = () =>
  index()
    .map((item) => state.cache.get(item.month))
    .filter(Boolean);
const targetMonth = (month) => (index().some((item) => item.month === month) ? month : index().at(-1)?.month || "");
const findMonth = (month) => state.cache.get(targetMonth(month)) || null;

/** Load each month's page once; re-render when it lands. */
const ensureMonths = (list) => {
  for (const month of list) {
    if (!month || state.cache.has(month) || state.loading.has(month) || !provider) continue;
    state.loading.add(month);
    provider
      .loadMonth(month)
      .then((view) => {
        if (view) state.cache.set(month, view);
      })
      .catch((error) => {
        state.error = error;
      })
      .finally(() => {
        state.loading.delete(month);
        render();
      });
  }
};

const timeline = () => {
  const snap = state.snapshot;
  return buildTimeline(snap.playbookMarkdown, months(), { closed: snap.closed, judgeChanges: snap.judgeChanges });
};
const calendarHref = (month, date) => `#/calendar/${month}${date ? `/${date}` : ""}`;
const withLang = (code) => {
  const params = new URLSearchParams(window.location.search);
  params.set("lang", code);
  return `?${params.toString()}${window.location.hash}`;
};

// ── small pieces ────────────────────────────────────────────────────────────

const verdictBadge = (verdict, { withText = true } = {}) =>
  `<span class="verdict ${VERDICT_CLASS[verdict] || "v-pending"}">${icon(verdict)}${withText ? `<span>${h(t.verdict[verdict] || verdict)}</span>` : ""}</span>`;

const versionsLabel = (month) => month?.versions?.join(" / ") || "";

const translateVersion = (entry) => {
  const en = lang === "en" ? state.snapshot.translations?.versions?.[entry.version] : null;
  return { change: en?.change || entry.change, why: en ? en.why : entry.why };
};

/**
 * The control chart: the playbook in force vs "still on v1", for 淋雨 / 太热 / 不方便.
 * Emphasis form — the playbook in force is ink, the baseline is a recessive grey — with the value
 * at each bar's tip, a legend, a tooltip per bar, and the same numbers as a table for screen readers.
 * Bars are scaled to the days in the month, so every month shares one axis.
 */
const compareChart = (month, { compact = false } = {}) => {
  const snap = state.snapshot;
  if (!month.baseline) return `<p class="muted-note">${h(t.compareMissing)}</p>`;
  const current = compact ? t.seriesCurrentShort(month.versions) : t.seriesCurrent(month.versions);
  const baseline = compact
    ? t.seriesBaselineShort(snap.baseline.version)
    : t.seriesBaseline(snap.baseline.version, snap.baseline.hour);
  const scale = Math.max(month.summary.days, 1);
  const bar = (series, kind, value, label) =>
    `<div class="bar-row"><span class="bar ${kind}" style="--w:${((value / scale) * 100).toFixed(2)}%" tabindex="0" data-tip="${h(t.chartTip(series, label, value))}" aria-label="${h(t.chartTip(series, label, value))}"></span><b class="bar-value">${value}</b></div>`;
  const groups = METRICS.map(
    ([key, verdict, label]) =>
      `<div class="bar-group"><div class="bar-label">${icon(verdict)}<span>${h(compact ? t.verdictShort[verdict] : label())}</span></div><div class="bar-pair">${bar(current, "is-current", month.summary[key], label())}${bar(baseline, "is-baseline", month.baseline.summary[key], label())}</div></div>`,
  ).join("");
  const coverage =
    month.baseline.covered < month.summary.days
      ? `<p class="muted-note">${h(t.compareCoverage(month.baseline.covered, month.summary.days))}</p>`
      : "";
  const table = `<div class="sr-only"><table><caption>${h(t.compareTitle(snap.baseline.version))}</caption><thead><tr><th></th>${METRICS.map(([, , label]) => `<th>${h(label())}</th>`).join("")}</tr></thead><tbody><tr><th>${h(current)}</th>${METRICS.map(([key]) => `<td>${month.summary[key]}</td>`).join("")}</tr><tr><th>${h(baseline)}</th>${METRICS.map(([key]) => `<td>${month.baseline.summary[key]}</td>`).join("")}</tr></tbody></table></div>`;
  return `<figure class="compare ${compact ? "is-compact" : ""}">
    ${compact ? "" : `<figcaption class="section-title">${h(t.compareTitle(snap.baseline.version))}</figcaption>`}
    <div class="compare-legend"><span><i class="swatch is-current"></i>${h(current)}</span><span><i class="swatch is-baseline"></i>${h(baseline)}</span></div>
    <div class="bars">${groups}</div>${coverage}${table}
  </figure>`;
};

const metricBand = (month) =>
  `<div class="metric-band">${METRICS.map(
    ([key, verdict, label]) =>
      `<div class="metric"><span class="metric-label">${verdictBadge(verdict, { withText: false })}${h(label())}</span><span class="metric-value">${month.summary[key]}</span><span class="metric-sub">${key === "wet" ? h(t.ofDays(month.summary.days)) : ""}</span></div>`,
  ).join("")}</div>`;

// ── pages ───────────────────────────────────────────────────────────────────

const dayDetail = (month, date) => {
  const day = month.days.find((item) => item.date === date);
  if (!day) return `<section class="day-detail is-empty"><p>${h(t.dayDetailEmpty)}</p></section>`;
  const fmt = (value, unit) => (value === null || value === undefined ? "—" : `${value}${unit}`);
  const extras = [
    day.wet && day.verdict !== "淋雨" ? "淋雨" : "",
    day.hot && day.verdict !== "太热" ? "太热" : "",
    day.off && day.verdict !== "不方便" ? "不方便" : "",
  ].filter(Boolean);
  const reason = lang === "en" && RULE_EN[day.rule] ? RULE_EN[day.rule] : day.reason;
  return `<section class="day-detail ${VERDICT_CLASS[day.verdict] || ""}" aria-live="polite">
    <div class="day-detail-head"><h2 class="section-title">${h(t.dayTitle(day.date, day.weekday))}</h2>${verdictBadge(day.verdict)}</div>
    ${extras.length ? `<p class="also">${h(t.alsoFlags)} ${extras.map((flag) => verdictBadge(flag)).join(" ")}</p>` : ""}
    <dl class="facts">
      <div><dt>${h(t.dayHour)}</dt><dd class="fact-hour">${h(day.hour === null ? "—" : t.hourLabel(day.hour))}</dd></div>
      <div><dt>${h(t.dayVersion)}</dt><dd>${h(day.version || "—")}</dd></div>
      <div><dt>${h(t.dayProb)}</dt><dd>${h(fmt(day.prob, "%"))}</dd></div>
      <div><dt>${h(t.dayFtemp)}</dt><dd>${h(fmt(day.ftemp, "°C"))}</dd></div>
      <div><dt>${h(t.dayRain)}</dt><dd>${h(fmt(day.rain, " mm"))}</dd></div>
      <div><dt>${h(t.dayTemp)}</dt><dd>${h(fmt(day.temp, "°C"))}</dd></div>
    </dl>
    <p class="reason"><span>${h(t.dayReason)}</span>${h(reason || "—")}</p>
  </section>`;
};

const legend = () =>
  `<div class="legend" aria-label="${h(t.legend)}">${VERDICTS.map((verdict) => `<span title="${h(t.verdictHint[verdict])}">${verdictBadge(verdict)}</span>`).join("")}</div>`;

const calendarPage = (route) => {
  const target = targetMonth(route.month);
  if (!target) return `<div class="page"><p class="empty-note">${h(t.noData)}</p></div>`;
  const month = findMonth(route.month);
  if (!month) {
    ensureMonths([target]);
    return `<div class="page"><p class="loading-note" role="status">${h(t.loading)}</p></div>`;
  }
  const byDate = new Map(month.days.map((day) => [day.date, day]));
  const entry = timeline().versions.find((item) => item.version === month.versions[0]);
  const lede = entry ? translateVersion(entry).change : "";
  const cells = monthGrid(month.month)
    .map((date) => {
      if (!date) return '<span class="day-cell is-blank" aria-hidden="true"></span>';
      const day = byDate.get(date);
      const n = Number(date.slice(8));
      if (!day)
        return `<span class="day-cell is-missing"><span class="day-num">${n}</span><span class="day-hour">—</span></span>`;
      const extra = [
        day.wet && day.verdict !== "淋雨" ? "淋雨" : "",
        day.hot && day.verdict !== "太热" ? "太热" : "",
        day.off && day.verdict !== "不方便" ? "不方便" : "",
      ]
        .filter(Boolean)
        .map((flag) => `<span class="flag ${VERDICT_CLASS[flag]}" title="${h(t.verdict[flag])}">${icon(flag)}</span>`)
        .join("");
      return `<a class="day-cell ${VERDICT_CLASS[day.verdict] || "v-pending"} ${route.date === date ? "is-selected" : ""}" href="${calendarHref(month.month, date)}" aria-label="${h(`${t.dayTitle(date, day.weekday)} · ${day.hour === null ? "—" : t.hourLabel(day.hour)} · ${t.verdict[day.verdict] || day.verdict}`)}">
        <span class="day-num">${n}</span>
        <span class="day-hour">${day.hour === null ? "—" : `${day.hour}<small>${h(t.hourUnit)}</small>`}</span>
        <span class="day-verdict">${icon(day.verdict)}<span>${h(t.verdictShort[day.verdict] || day.verdict)}</span></span>
        ${extra ? `<span class="day-flags">${extra}</span>` : ""}
      </a>`;
    })
    .join("");
  const tabs = index()
    .map(
      (item) =>
        `<a class="month-tab ${item.month === month.month ? "is-active" : ""}" href="${calendarHref(item.month)}" ${item.month === month.month ? 'aria-current="page"' : ""}><span>${h(t.monthName(item.month))}</span><small>${h(versionsLabel(state.cache.get(item.month) || item))}</small></a>`,
    )
    .join("");
  return `<div class="page page-calendar">
    <header class="page-head">
      <p class="eyebrow">${h(t.calendarEyebrow(month.month, month.versions, month.judgeVersion))}</p>
      <h1 class="headline">${h(t.calendarHeadline(month.month, month.summary.wet))}</h1>
      ${lede ? `<p class="lede">${h(lede)}</p>` : ""}
    </header>
    <nav class="month-tabs" aria-label="${h(t.navCalendar)}">${tabs}</nav>
    <div class="calendar-layout">
      <section class="calendar-panel">
        <div class="weekday-row">${t.weekdays.map((name) => `<span>${h(name)}</span>`).join("")}</div>
        <div class="calendar-grid">${cells}</div>
        ${legend()}
      </section>
      <aside class="side-panel">
        ${metricBand(month)}
        ${compareChart(month)}
        ${dayDetail(month, route.date)}
      </aside>
    </div>
  </div>`;
};

const timelinePage = () => {
  const snap = state.snapshot;
  const known = new Set(index().map((item) => item.month));
  // One bounded page per version's first month; capped so a long history stays a fixed budget.
  ensureMonths(
    timeline()
      .versions.slice(-8)
      .map((entry) => entry.month)
      .filter((month) => known.has(month)),
  );
  const tl = timeline();
  const first = tl.versions[0]?.version;
  const cards = tl.versions
    .map((entry) => {
      const text = translateVersion(entry);
      const result = entry.monthResult;
      const retired = entry.retired
        ? lang === "en" && snap.translations?.retired?.[entry.version]
          ? snap.translations.retired[entry.version]
          : entry.retired
        : null;
      const closed = tl.closed
        .filter((item) => item.afterVersion === entry.version)
        .map((item) => {
          const en = lang === "en" ? item.en : null;
          return `<aside class="note note-closed"><p class="note-title">${icon("x")}${h(t.closedTitle)} · ${h(item.id)}</p><p class="note-rule">${h(t.quote(en?.rule || item.rule))}</p><p>${h(en?.evidence || item.evidence)}</p><p>${h(en?.reason || item.reason)}</p></aside>`;
        })
        .join("");
      const judge = tl.judgeChanges
        .filter((item) => item.afterVersion === entry.version)
        .map(
          (item) =>
            `<aside class="note note-judge"><p class="note-title">${icon("gavel")}${h(t.judgeChangeTitle(item.from, item.to))}</p><p>${h(lang === "en" ? item.en : item.text)}</p></aside>`,
        )
        .join("");
      return `<article class="version-card ${entry.isCurrent ? "is-current" : ""} ${retired ? "is-retired" : ""}">
        <header class="version-head">
          <span class="version-tag">${h(entry.version)}</span>
          <span class="eyebrow">${h(entry.month ? t.monthFrom(entry.month) : entry.from)}</span>
          ${entry.isCurrent ? `<span class="pill is-current">${h(t.versionCurrent)}</span>` : ""}
          ${retired ? `<span class="pill is-retired">${icon("archive")}${h(t.versionRetired)}</span>` : ""}
        </header>
        <h2 class="version-change">${h(text.change)}</h2>
        ${text.why ? `<p class="version-why"><b>${h(t.versionWhy)}</b> ${h(text.why)}</p>` : ""}
        ${retired ? `<p class="retired-note"><b>${h(t.retiredReason)}</b> ${h(retired.reason)}</p>` : ""}
        ${
          result
            ? `<div class="version-result"><p class="result-line"><a href="${calendarHref(result.month)}">${h(t.versionMonth(result.month))}</a></p>${compareChart(result, { compact: true })}</div>`
            : ""
        }
        ${closed}${judge}
      </article>`;
    })
    .join("");
  const shown = tl.versions.map((entry) => entry.monthResult).filter(Boolean);
  const sum = totals(shown);
  const hasBaseline = shown.length > 1 && shown.every((month) => month.baseline);
  const totalsBlock = hasBaseline
    ? `<section class="head-totals" aria-label="${h(t.totalsTitle(shown.length))}"><p class="eyebrow">${h(t.totalsTitle(shown.length))} · ${h(t.totalsLegend(snap.baseline.version))}</p><div class="totals-grid">${METRICS.map(
        ([key, verdict, label]) =>
          `<div class="total"><span class="metric-label">${verdictBadge(verdict, { withText: false })}${h(label())}</span><span class="total-values"><span class="total-pair"><b>${sum.inForce[key]}</b></span><span class="total-pair is-baseline"><span class="total-vs">/</span><b>${sum.baseline[key]}</b></span></span></div>`,
      ).join("")}</div></section>`
    : "";
  return `<div class="page page-timeline">
    <header class="page-head ${totalsBlock ? "has-aside" : ""}">
      <div>
        <p class="eyebrow">${h(t.timelineEyebrow)}</p>
        <h1 class="headline">${h(t.timelineHeadline(first, tl.current))}</h1>
        <p class="lede">${h(t.timelineLede)}</p>
      </div>
      ${totalsBlock}
    </header>
    <div class="timeline">${cards}</div>
  </div>`;
};

const helpModal = () => {
  const snap = state.snapshot;
  const theme = document.documentElement.dataset.theme;
  return `<div class="modal-scrim" data-action="close-help"></div>
  <section class="modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <header class="modal-head"><h2 id="helpTitle" class="section-title">${h(t.helpTitle)}</h2><button class="icon-button" data-action="close-help" aria-label="${h(t.close)}">${icon("close")}</button></header>
    <div class="modal-body">
      <h3>${h(t.helpWhatTitle)}</h3><p>${h(t.helpWhat)}</p>
      <h3>${h(t.helpApproveTitle)}</h3><p>${h(t.helpApprove)}</p>
      <h3>${h(t.helpDataTitle)}</h3><p>${h(snap?.mode === "demo" ? t.helpDataDemo : t.helpDataLive(snap?.folderName || "—", snap?.place?.name))}</p>
      ${snap?.judge ? `<p>${h(t.helpJudge(snap.judge))}</p>` : ""}
      <h3>${h(t.helpStyleTitle)}</h3>
      <div class="family-picker">${FAMILIES.map((family) => `<button class="family ${family === theme ? "is-active" : ""}" data-action="theme" data-family="${family}" aria-pressed="${family === theme}">${h(t.families[family])}</button>`).join("")}</div>
      <h3>${h(t.helpLangTitle)}</h3>
      <div class="lang-picker"><a href="${h(withLang("zh-CN"))}" class="${lang === "zh" ? "is-active" : ""}">中文</a><a href="${h(withLang("en"))}" class="${lang === "en" ? "is-active" : ""}">English</a></div>
    </div>
  </section>`;
};

// ── shell ───────────────────────────────────────────────────────────────────

const sidebar = (route) => {
  const snap = state.snapshot;
  const focusMonth = route.page === "calendar" ? targetMonth(route.month) : index().at(-1)?.month;
  const focus = index().find((item) => item.month === focusMonth);
  const focusView = state.cache.get(focusMonth);
  const monthLinks = index()
    .map(
      (item) =>
        `<a class="nav-sub ${route.page === "calendar" && item.month === focusMonth ? "is-active" : ""}" href="${calendarHref(item.month)}"><span>${h(t.monthName(item.month))}</span><small>${h(versionsLabel(state.cache.get(item.month) || item))}</small><span class="nav-count" title="${h(t.metricWet)}">${item.wet}</span></a>`,
    )
    .join("");
  return `<aside class="sidebar" id="sidebar">
    <div class="brand"><span class="brand-icon">${icon("dog")}</span><div class="brand-copy"><strong class="brand-title">${h(t.brand)}</strong><span class="brand-subtitle">${h(t.brandSub)}</span></div><button class="icon-button collapse-button" data-action="sidebar" aria-label="${h(t.menu)}">${icon("panel")}</button></div>
    ${
      focus
        ? `<div class="attention"><p class="eyebrow">${h(t.attentionEyebrow)} · ${h(t.monthName(focus.month))}</p><p class="attention-value">${verdictBadge("淋雨", { withText: false })}<b>${h(t.attentionWet(focus.wet))}</b></p>${focusView ? `<p class="attention-meta">${h(t.attentionMeta(versionsLabel(focusView), focusView.judgeVersion))}</p>` : ""}<p class="attention-approve">${icon("merge")}<span>${h(snap?.pending === null || snap?.pending === undefined ? t.approvalsWhere : `${t.approvalsPending(snap.pending)} · ${t.approvalsWhere}`)}</span></p></div>`
        : ""
    }
    <nav class="nav" aria-label="${h(t.brand)}">
      <a class="nav-link ${route.page === "calendar" ? "is-active" : ""}" href="${focusMonth ? calendarHref(focusMonth) : "#/calendar"}">${icon("calendar")}<span>${h(t.navCalendar)}</span></a>
      <div class="nav-months">${monthLinks}</div>
      <a class="nav-link ${route.page === "timeline" ? "is-active" : ""}" href="#/timeline">${icon("timeline")}<span>${h(t.navTimeline)}</span></a>
    </nav>
    <div class="sidebar-bottom">
      <a class="nav-link" href="#/help">${icon("help")}<span>${h(t.navHelp)}</span></a>
      <p class="mode"><span class="mode-dot ${snap?.mode === "demo" ? "is-demo" : ""}"></span>${h(snap?.mode === "demo" ? t.modeDemo : t.modeLive)}</p>
    </div>
  </aside>`;
};

const render = () => {
  let route = parseRoute();
  const help = route.page === "help";
  if (help) route = parseBackground();
  if (state.error) return errorScreen(state.error);
  if (!state.snapshot) {
    root.innerHTML = `<div class="loading" role="status">${h(t.loading)}</div>`;
    return;
  }
  const page = route.page === "timeline" ? timelinePage() : calendarPage(route);
  root.innerHTML = `<div class="app-shell ${state.collapsed ? "sidebar-collapsed" : ""}">
    ${sidebar(route)}
    <div class="sidebar-scrim ${state.mobileOpen ? "is-open" : ""}" data-action="close-sidebar"></div>
    <main class="main">
      <header class="mobile-topbar"><button class="icon-button" data-action="sidebar" data-open-sidebar aria-label="${h(t.menu)}" aria-expanded="${state.mobileOpen}">${icon("panel")}</button><strong>${h(t.brand)}</strong><a class="icon-button" href="#/help" aria-label="${h(t.navHelp)}">${icon("help")}</a></header>
      ${page}
    </main>
    ${help ? helpModal() : ""}
  </div>`;
  document.body.classList.toggle("sidebar-open", state.mobileOpen);
  document.body.classList.toggle("modal-open", help);
};

/** Under the Help modal, keep drawing the page the operator came from. */
const parseBackground = () => {
  const parts = state.background.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [page = "calendar", month = "", date = ""] = parts;
  return { page: page === "timeline" ? "timeline" : "calendar", month, date };
};

const errorScreen = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `<div class="error-screen" role="alert"><h1 class="headline">${h(t.errorTitle)}</h1><p class="lede">${h(message.replace(/^[A-Z_]+:\s*/, ""))}</p><button class="button primary" data-action="retry">${h(t.retry)}</button></div>`;
};

const load = async () => {
  try {
    state.snapshot = await provider.load();
    state.cache = new Map();
    state.error = null;
  } catch (error) {
    state.error = error;
  }
  render();
};

let gate;
const init = async () => {
  try {
    gate ||= createAirAppConnectGate({
      appName: t.brand,
      shouldGate: () => !isDemo() && shouldUseLocalGateway(),
      demoHref: "?demo=1",
    });
    if (!(await gate.pass({ onReady: init }))) return;
    const status = !isDemo() && shouldUseLocalGateway() ? await gate.status() : null;
    const spaceId = status?.selectedSpace?.id || status?.space?.id;
    provider = await createProvider({ spaceId });
    await load();
  } catch (error) {
    state.error = error;
    render();
  }
};

root.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "sidebar") {
    if (window.matchMedia("(max-width: 720px)").matches) state.mobileOpen = !state.mobileOpen;
    else state.collapsed = !state.collapsed;
    render();
  } else if (action === "close-sidebar") {
    state.mobileOpen = false;
    render();
  } else if (action === "close-help") {
    window.location.hash = state.background;
  } else if (action === "theme") {
    const family = target.dataset.family;
    if (FAMILIES.includes(family)) {
      document.documentElement.dataset.theme = family;
      try {
        localStorage.setItem(THEME_KEY, family);
      } catch {
        // Private mode: the choice simply does not persist.
      }
      render();
    }
  } else if (action === "retry") {
    state.error = null;
    init();
  }
});

window.addEventListener("hashchange", () => {
  if (parseRoute().page !== "help") state.background = window.location.hash || "#/calendar";
  state.mobileOpen = false;
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (parseRoute().page === "help") window.location.hash = state.background;
  else if (state.mobileOpen) {
    state.mobileOpen = false;
    render();
  }
});
setInterval(() => {
  if (provider?.mode === "live" && !document.hidden && parseRoute().page !== "help") load();
}, 60_000);

if (parseRoute().page !== "help") state.background = window.location.hash || "#/calendar";
render();
init();
