import { createAirAppConnectGate } from "../vendor/busabase-airapp-gate.js";
import { createIcons, icons } from "../vendor/lucide.js";
import { appConfig, kinds, statuses, topics } from "./config.js";
import { copy as c } from "./messages.js";
import { calendarRange, dayKey, filterRows, mergeRows, monthGrid, safeUrl } from "./model.js";
import { getRuntime } from "./runtime.js";

const root = document.getElementById("app");
const isDemo = new URLSearchParams(location.search).get("demo") === "1";
const now = isDemo ? new Date(2026, 8, 29) : new Date();
const families = [
  ["graphite", "石墨"],
  ["ink-paper", "墨与纸"],
  ["rose-ochre", "玫瑰与赭石"],
  ["mauve-plum", "紫灰与梅色"],
  ["coral-amber", "珊瑚与琥珀"],
  ["sage-clay", "鼠尾草与陶土"],
  ["ink-blush", "墨与胭脂"],
];
const state = {
  records: { sources: [], articles: [] },
  pages: {},
  counts: {},
  groups: [],
  filters: { query: "", topic: "", status: "" },
  calendar: [],
  calendarTotal: 0,
  calendarPage: 1,
  calendarPages: 1,
  year: now.getFullYear(),
  month: now.getMonth(),
  busy: false,
  collapsed: false,
  mobileOpen: false,
  resources: null,
};
let provider;
let gate;
let generation = 0;
const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const label = (choices, value) => choices.find((choice) => choice.id === value)?.name || value || "未设置";
const badge = (status) =>
  `<span class="badge status-${h(status)}"><span class="status-dot"></span>${h(label(statuses, status))}</span>`;
const verified = (value) =>
  `<span class="verification ${value ? "is-verified" : "is-unverified"}">${icon(value ? "circle-check" : "circle-alert")}${value ? c.verified : c.unverified}</span>`;
const date = (value) => dayKey(value) || "未排期";
const route = () => location.hash.slice(2).split("/").filter(Boolean);
const link = (key, id) => `#/${key}/${encodeURIComponent(id)}`;
const names = (row) =>
  row.fields.sources.map(
    (id) => state.records.sources.find((source) => source.id === id)?.fields.title || "查看关联资料",
  );
const native = (key, view, id) => {
  const url = provider.nativeUrl(key, view, id);
  return url
    ? `<a class="button native-link" href="${h(url)}" target="_blank" rel="noopener">${icon("external-link")}${c.native}</a>`
    : "";
};
const countLabel = (key) => `${state.records[key].length}${state.pages[key]?.nextCursor ? "+" : ""}`;

function shell() {
  const [page = "overview"] = route();
  const nav = [
    ["overview", "layout-dashboard", c.overview],
    ["sources", "library", c.sources],
    ["articles", "notebook-pen", c.articles],
  ];
  const totalAttention = (state.counts.review || 0) + (state.counts.unverified || 0);
  root.innerHTML = `<div class="app-shell ${state.collapsed ? "sidebar-collapsed" : ""}">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><span class="brand-icon">${icon("notebook-pen")}</span><div class="brand-copy"><strong>${c.brandShort}</strong><span>公众号编辑部</span></div><button class="icon-button" data-action="sidebar" title="${c.menu}" aria-label="${c.menu}">${icon("panel-left")}</button></div>
      <a class="attention ${page === "needs-review" ? "active" : ""}" href="#/needs-review"><span class="attention-heading">${icon("inbox")}待你处理<span class="attention-count">${totalAttention}</span></span><span class="attention-copy">${state.counts.review || 0} 篇草稿待审核<br>${state.counts.unverified || 0} 份资料待核对</span></a>
      <nav class="navigation" aria-label="工作台导航">${nav.map(([key, name, title]) => `<a href="#/${key}" class="nav-link ${page === key ? "active" : ""}" title="${title}">${icon(name)}<span>${title}</span>${key !== "overview" ? `<span class="nav-count">${state.counts[key] ?? ""}</span>` : ""}</a>`).join("")}</nav>
      <div class="sidebar-bottom"><a href="#/settings" class="nav-link ${page === "settings" ? "active" : ""}" title="${c.settings}">${icon("circle-help")}<span>${c.settings}</span></a><span class="connection-dot"></span><span class="connection-label">${isDemo ? c.demo : c.live}</span></div>
    </aside>
    <button class="scrim ${state.mobileOpen ? "visible" : ""}" data-action="close-sidebar" aria-label="关闭侧栏"></button>
    <main class="main"><div class="mobile-topbar"><button class="icon-button" data-action="sidebar" aria-label="${c.menu}" aria-expanded="${state.mobileOpen}">${icon("panel-left")}</button><strong>${c.brandShort}</strong><a class="icon-button" href="#/settings" aria-label="${c.settings}">${icon("circle-help")}</a></div><div id="workspace" class="workspace"></div></main></div>`;
  document.body.classList.toggle("sidebar-open", state.mobileOpen);
}
function heading(title, subtitle, action = "") {
  return `<header class="page-header"><div><div class="eyebrow">${c.brand}</div><h1>${h(title)}</h1>${subtitle ? `<p>${h(subtitle)}</p>` : ""}</div><div class="header-actions">${action}<button class="icon-button" data-action="refresh" title="${c.refresh}" aria-label="${c.refresh}">${icon("refresh-cw")}</button></div></header>`;
}
function filters(key) {
  return `<div class="filterbar"><label class="searchbox">${icon("search")}<input type="search" id="search" placeholder="${c.search}" value="${h(state.filters.query)}" aria-label="搜索已加载记录"></label><select id="topic-filter" aria-label="主题筛选"><option value="">${c.allTopics}</option>${topics.map((topic) => `<option value="${topic.id}" ${state.filters.topic === topic.id ? "selected" : ""}>${topic.name}</option>`).join("")}</select>${key === "articles" ? `<select id="status-filter" aria-label="进度筛选"><option value="">${c.allStatuses}</option>${statuses.map((status) => `<option value="${status.id}" ${state.filters.status === status.id ? "selected" : ""}>${status.name}</option>`).join("")}</select>` : ""}</div>`;
}
function loadedNote(key) {
  return `<div class="list-footer"><span>已加载 ${countLabel(key)} 条 · 搜索和筛选作用于已加载记录</span>${state.pages[key]?.nextCursor ? `<button class="button" data-action="more" data-key="${key}" ${state.busy ? "disabled" : ""}>${icon("chevrons-down")}${c.more}</button>` : ""}</div>`;
}
function articleRows(rows) {
  if (!rows.length) return `<div class="empty">${icon("inbox")}${c.empty}</div>`;
  return `<div class="table-wrap"><table class="articles-table"><thead><tr><th>文章标题</th><th>进度</th><th>负责人</th><th>计划发布</th><th>关联资料</th></tr></thead><tbody>${rows.map((row) => `<tr><td><a class="row-title" href="${link("articles", row.id)}">${h(row.fields.title)}</a><span class="row-secondary">${h(label(topics, row.fields.topic))}</span></td><td>${badge(row.fields.status)}</td><td>${h(row.fields.owner || "未分配")}</td><td class="nowrap">${date(row.fields.publish_date)}</td><td class="source-names">${h(names(row).join("、") || c.noSource)}</td></tr>`).join("")}</tbody></table></div>`;
}
function sourceRows(rows) {
  if (!rows.length) return `<div class="empty">${icon("library")}${c.empty}</div>`;
  return `<div class="source-list">${rows.map((row) => `<a class="source-row" href="${link("sources", row.id)}"><span class="source-kind">${icon(row.fields.kind === "screenshot" ? "image" : row.fields.kind === "report" ? "file-chart-column" : "file-text")}</span><div><div class="source-top"><strong>${h(row.fields.title)}</strong>${verified(row.fields.verified)}</div><p>${h(row.fields.summary || "暂无摘要")}</p><div class="source-meta"><span>${h(label(kinds, row.fields.kind))}</span><span>${h(label(topics, row.fields.topic))}</span><span>${date(row.fields.source_date)}</span></div></div>${icon("chevron-right")}</a>`).join("")}</div>`;
}
function overview() {
  const planned = state.records.articles
    .filter((row) => row.fields.status !== "published" && row.fields.publish_date)
    .sort((a, b) => String(a.fields.publish_date).localeCompare(String(b.fields.publish_date)))
    .slice(0, 5);
  const review = state.records.articles.filter((row) => row.fields.status === "review").slice(0, 3);
  return `${heading("工作总览", `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 内容与排期`)}<div class="metrics"><a href="#/sources"><span>资料库</span><strong>${state.counts.sources ?? "—"}</strong><small>可复用的内容依据</small></a><a href="#/articles"><span>文章排期</span><strong>${state.counts.articles ?? "—"}</strong><small>从选题到发布</small></a><a href="#/needs-review"><span>草稿待审核</span><strong class="accent-number">${state.counts.review ?? "—"}</strong><small>确认内容和引用</small></a><a href="#/needs-review"><span>资料待核对</span><strong class="warning-number">${state.counts.unverified ?? "—"}</strong><small>确认出处和事实</small></a></div><div class="overview-columns"><section><div class="section-heading"><h2>接下来发布</h2><a href="#/articles/calendar">查看月历${icon("arrow-up-right")}</a></div>${articleRows(planned)}<div class="section-heading"><h2>需要你的审核</h2><a href="#/needs-review">查看全部${icon("arrow-up-right")}</a></div><div class="review-list">${review.length ? review.map((row) => `<a class="review-row" href="${link("articles", row.id)}">${badge(row.fields.status)}<strong>${h(row.fields.title)}</strong><p>${h(row.fields.review_note || "核对草稿与关联资料后再安排发布。")}</p><span>${h(row.fields.owner)} · ${date(row.fields.publish_date)}</span></a>`).join("") : `<div class="empty">没有待审核草稿</div>`}</div></section><aside class="right-column"><div class="section-heading"><h2>文章进度</h2></div><div class="progress-list">${statuses
    .map((status) => {
      const n = state.groups.find((group) => group.value === status.id)?.count || 0;
      return `<a href="#/articles/board">${badge(status.id)}<strong>${n}</strong></a>`;
    })
    .join(
      "",
    )}</div><div class="section-heading"><h2>最近整理的资料</h2><a href="#/sources">${icon("arrow-up-right")}</a></div>${sourceRows(state.records.sources.slice(0, 3))}</aside></div>`;
}
function board(rows) {
  return `<div class="board">${statuses
    .map(
      (status) =>
        `<section class="board-column"><div class="board-heading">${badge(status.id)}<span>${state.groups.find((group) => group.value === status.id)?.count || 0}</span></div><div class="board-items">${
          rows
            .filter((row) => row.fields.status === status.id)
            .map(
              (row) =>
                `<a class="board-item" href="${link("articles", row.id)}"><span class="topic-label">${h(label(topics, row.fields.topic))}</span><h3>${h(row.fields.title)}</h3><p>${h(row.fields.review_note || row.fields.outline || "")}</p><div class="board-meta"><span>${h(row.fields.owner || "未分配")}</span><span>${date(row.fields.publish_date).slice(5)}</span></div><div class="board-sources">${icon("link")}${row.fields.sources.length} 份资料</div></a>`,
            )
            .join("") || `<div class="board-empty">暂无已加载文章</div>`
        }</div></section>`,
    )
    .join("")}</div>`;
}
function calendar() {
  const rows = filterRows(state.calendar, state.filters);
  const days = monthGrid(state.year, state.month);
  return `<div class="calendar-toolbar"><h2>${state.year} 年 ${state.month + 1} 月</h2><div><button class="icon-button" data-action="prev-month" title="${c.prevMonth}" aria-label="${c.prevMonth}">${icon("chevron-left")}</button><button class="button" data-action="current-month">${c.currentMonth}</button><button class="icon-button" data-action="next-month" title="${c.nextMonth}" aria-label="${c.nextMonth}">${icon("chevron-right")}</button></div></div><div class="calendar-grid">${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<div class="weekday">周${day}</div>`).join("")}${days
    .map(
      (day) =>
        `<div class="calendar-day ${day.getMonth() !== state.month ? "outside" : ""} ${dayKey(day) === dayKey(now) ? "today" : ""}"><span class="day-number">${day.getDate()}</span>${rows
          .filter((row) => dayKey(row.fields.publish_date) === dayKey(day))
          .map(
            (row) =>
              `<a class="calendar-event status-${h(row.fields.status)}" href="${link("articles", row.id)}"><span class="status-dot"></span>${h(row.fields.title)}</a>`,
          )
          .join("")}</div>`,
    )
    .join(
      "",
    )}</div><div class="calendar-agenda"><h2>本月排期</h2>${articleRows(rows.filter((row) => new Date(row.fields.publish_date).getMonth() === state.month))}</div><div class="list-footer"><span>当前日历范围共 ${state.calendarTotal} 篇文章</span>${state.calendarPage < state.calendarPages ? `<button class="button" data-action="more-calendar">${c.more}</button>` : ""}</div>`;
}
function articles(mode = "table") {
  const rows = filterRows(state.records.articles, state.filters);
  const view = mode === "board" ? "进度看板" : mode === "calendar" ? "发布日历" : "文章列表";
  return `${heading(c.articles, "选题、写作、审核与发布排期", native("articles", view))}<div class="view-tabs" role="tablist">${[
    ["table", "table-2", c.table],
    ["board", "columns-3", c.board],
    ["calendar", "calendar-days", c.calendar],
  ]
    .map(
      ([key, name, title]) =>
        `<a role="tab" aria-selected="${key === mode}" href="#/articles/${key}" class="${key === mode ? "active" : ""}">${icon(name)}${title}</a>`,
    )
    .join(
      "",
    )}</div>${filters("articles")}${mode === "calendar" ? calendar() : mode === "board" ? board(rows) + loadedNote("articles") : articleRows(rows) + loadedNote("articles")}`;
}
function reviewPage() {
  return `${heading(c.review, "先核对内容依据，再安排发布", native("articles", "待审核"))}<div class="section-heading"><h2>草稿待审核</h2><span>${state.counts.review} 篇</span></div>${articleRows(state.records.articles.filter((row) => row.fields.status === "review"))}${loadedNote("articles")}<div class="section-heading"><h2>资料待核对</h2><span>${state.counts.unverified} 份</span></div>${sourceRows(state.records.sources.filter((row) => !row.fields.verified))}${loadedNote("sources")}`;
}
function prose(text, fallback) {
  return `<div class="prose">${h(text || fallback).replace(/\n/g, "<br>")}</div>`;
}
function detail(key, row) {
  const f = row.fields;
  const linked =
    key === "articles"
      ? f.sources.map((id) => ({ id, row: state.records.sources.find((source) => source.id === id) }))
      : state.records.articles
          .filter((article) => article.fields.sources.includes(row.id))
          .map((article) => ({ id: article.id, row: article }));
  const attachmentHtml = f.attachment
    .map((item) => {
      const url = safeUrl(typeof item === "string" ? item : item.url);
      return url
        ? `<a href="${h(url)}" target="_blank" rel="noopener">${icon("paperclip")}${h(item.name || item.fileName || "原始附件")}</a>`
        : "";
    })
    .join("");
  const imageUrl = f.kind === "screenshot" && /\.(png|jpg|jpeg|webp)(\?|$)/i.test(f.url || "") ? safeUrl(f.url) : "";
  return `<div class="detail-top"><a class="back-link" href="#/${key}">${icon("arrow-left")}${c.back}</a>${native(key, "", row.id)}</div>${heading(f.title, key === "articles" ? "文章排期 / 文章详情" : "资料库 / 资料详情")}<div class="detail-layout"><article><div class="detail-meta">${key === "articles" ? badge(f.status) : verified(f.verified)}<span>${h(label(topics, f.topic))}</span><span>${key === "articles" ? `${h(f.owner || "未分配")} · ${date(f.publish_date)}` : `${h(label(kinds, f.kind))} · ${date(f.source_date)}`}</span></div>${key === "articles" ? `<section class="detail-section"><h2>审核备注</h2>${prose(f.review_note, "暂无审核备注")}</section><section class="detail-section"><h2>文章提纲</h2>${prose(f.outline, c.noOutline)}</section><section class="detail-section"><h2>文章草稿</h2>${prose(f.draft, c.noDraft)}</section>${safeUrl(f.public_url) ? `<a class="button" href="${h(safeUrl(f.public_url))}" target="_blank" rel="noopener">${icon("external-link")}查看已发布文章</a>` : ""}` : `<section class="detail-section"><h2>资料摘要</h2>${prose(f.summary, "暂无摘要")}</section>${imageUrl ? `<figure class="source-image"><img src="${h(imageUrl)}" alt="${h(f.title)}" loading="lazy"><figcaption>${h(f.title)}</figcaption></figure>` : ""}<section class="detail-section"><h2>检索文字摘录</h2>${prose(f.search_text, "暂无文字摘录")}</section><section class="detail-section"><h2>资料备注</h2>${prose(f.notes, "暂无备注")}</section><div class="attachment-links">${attachmentHtml}${safeUrl(f.url) ? `<a class="button" href="${h(safeUrl(f.url))}" target="_blank" rel="noopener">${icon("external-link")}查看来源</a>` : ""}</div>`}</article><aside class="linked-panel"><h2>${key === "articles" ? c.sourceTitle : "引用这份资料的文章"}</h2><div class="linked-records">${linked.length ? linked.map(({ id, row: related }) => `<a class="linked-record" href="${link(key === "articles" ? "sources" : "articles", id)}">${icon(key === "articles" ? "file-text" : "notebook-pen")}<div><strong>${h(related?.fields.title || "打开关联记录")}</strong><span>${related ? (key === "articles" ? label(kinds, related.fields.kind) : label(statuses, related.fields.status)) : "读取详情"}</span></div>${icon("chevron-right")}</a>`).join("") : `<p class="muted">${key === "articles" ? c.noSource : "尚未被已加载文章引用"}</p>`}</div>${key === "sources" ? `<p class="muted small">引用列表来自已加载文章。</p>` : ""}</aside></div>`;
}
function stylePanel() {
  const active = document.documentElement.dataset.theme;
  const palettes = new Map(
    families.map(([id]) => {
      document.documentElement.dataset.theme = id;
      const computed = getComputedStyle(document.documentElement);
      return [
        id,
        { paper: computed.getPropertyValue("--canvas").trim(), accent: computed.getPropertyValue("--accent").trim() },
      ];
    }),
  );
  document.documentElement.dataset.theme = active;
  return `<section class="detail-section"><h2>界面颜色</h2><div class="theme-swatches" role="group" aria-label="颜色系列">${families.map(([id, name]) => `<button class="theme-swatch" data-action="theme" data-family="${id}" style="--swatch-paper:${h(palettes.get(id).paper)};--swatch-accent:${h(palettes.get(id).accent)}" title="${name}" aria-label="${name}" aria-pressed="${id === active}">${id === active ? icon("circle-check") : ""}</button>`).join("")}</div><p class="theme-note">明暗外观跟随系统。颜色选择仅用于本次预览。</p></section>`;
}
function settings() {
  return `${heading(c.settings, "确认当前工作台与数据位置")}${stylePanel()}<dl class="settings-list"><div><dt>工作台</dt><dd>${c.brand}</dd></div><div><dt>当前模式</dt><dd>${isDemo ? c.demo : c.live}</dd></div><div><dt>目录</dt><dd>${h(state.resources?.folder?.name || c.brand)}</dd></div>${state.resources?.folder?.spaceId ? `<div><dt>空间</dt><dd>${h(state.resources.folder.spaceId)}</dd></div>` : ""}<div><dt>资料库</dt><dd>${native("sources", "全部资料") || "演示资料"}</dd></div><div><dt>文章排期</dt><dd>${native("articles", "文章列表") || "演示文章"}</dd></div></dl><section class="detail-section"><h2>工作方式</h2><p>资料库维护一份资料，文章通过关联复用。文章提纲、草稿、审核备注和发布日期都保存在文章排期中。</p><p>需要修改时，在 Busabase 原生表格或看板中提交修改，也可以让 Agent 按同目录 Skill 整理资料、起草文章或更新排期。对外发布需要单独确认。</p></section>${!isDemo ? `<button class="button" data-action="disconnect">${icon("log-out")}断开本地连接</button>` : ""}`;
}
async function render() {
  const token = ++generation;
  const [page = "overview", sub] = route();
  shell();
  const workspace = document.getElementById("workspace");
  if (["articles", "sources"].includes(page) && sub && !["table", "board", "calendar"].includes(sub)) {
    const id = decodeURIComponent(sub);
    let row = state.records[page].find((record) => record.id === id);
    workspace.innerHTML = `<div class="loading">${c.loading}</div>`;
    try {
      row ||= await provider.detail(page, id);
      if (page === "articles" && row) {
        const missing = row.fields.sources.filter(
          (sourceId) => !state.records.sources.some((source) => source.id === sourceId),
        );
        if (missing.length > 50) throw new Error("关联资料超过单次读取限制，请在原生记录中查看。");
        const results = await Promise.all(missing.map((sourceId) => provider.detail("sources", sourceId)));
        state.records.sources = mergeRows(state.records.sources, results.filter(Boolean));
      }
      if (token !== generation) return;
      workspace.innerHTML = row
        ? detail(page, row)
        : `<div class="empty">没有找到这条记录。<a href="#/${page}">返回列表</a></div>`;
    } catch {
      if (token === generation)
        workspace.innerHTML = `<div class="empty">无法读取这条记录，请检查权限。<a href="#/${page}">返回列表</a></div>`;
    }
  } else {
    workspace.innerHTML =
      page === "sources"
        ? `${heading(c.sources, "一份资料，支持多篇文章复用", native("sources", "全部资料"))}${filters("sources")}${sourceRows(filterRows(state.records.sources, state.filters))}${loadedNote("sources")}`
        : page === "articles"
          ? articles(sub || "table")
          : page === "needs-review"
            ? reviewPage()
            : page === "settings"
              ? settings()
              : overview();
  }
  createIcons({ icons });
}

async function loadCalendar(append = false) {
  const page = append ? state.calendarPage + 1 : 1;
  const result = await provider.calendar(calendarRange(state.year, state.month), page);
  state.calendar = append ? mergeRows(state.calendar, result.records) : result.records;
  state.calendarPage = page;
  state.calendarPages = result.totalPages || 1;
  state.calendarTotal = result.total || 0;
}
async function refresh() {
  const data = await provider.load();
  Object.assign(state, data);
  state.resources = provider.resources;
  if (route()[1] === "calendar") await loadCalendar();
  await render();
}
function errorScreen(error) {
  root.innerHTML = `<div class="provider-error"><span class="brand-icon">${icon("notebook-pen")}</span><h1>${c.error}</h1><p>${h(error?.message?.replace(/^[A-Z_]+:\s*/, "") || "请检查 Busabase 连接和权限。")}</p><button class="button primary" data-action="retry">${icon("refresh-cw")}${c.retry}</button></div>`;
  createIcons({ icons });
}
async function init() {
  try {
    const runtime = await getRuntime();
    if (!runtime.determined && !isDemo) throw new Error("无法确认工作台运行环境，请刷新或重新运行应用。");
    if (!gate)
      gate = createAirAppConnectGate({
        appName: c.brand,
        shouldGate: () => !isDemo && !runtime.hosted,
        demoHref: "?demo=1",
      });
    if (!(await gate.pass({ onReady: init }))) return;
    const connection = !runtime.hosted && !isDemo ? await gate.status() : null;
    const spaceId = runtime.spaceId || connection?.selectedSpace?.id || connection?.space?.id;
    provider = isDemo
      ? await (await import("./providers/demo-provider.js")).createDemoProvider()
      : await (await import("./providers/busabase-provider.js")).createBusabaseProvider({ spaceId });
    await refresh();
  } catch (error) {
    errorScreen(error);
  }
}
root.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "sidebar") {
    if (matchMedia("(max-width: 720px)").matches) state.mobileOpen = !state.mobileOpen;
    else state.collapsed = !state.collapsed;
    await render();
    return;
  }
  if (action === "close-sidebar") {
    state.mobileOpen = false;
    await render();
    return;
  }
  if (action === "retry") {
    await init();
    return;
  }
  if (action === "theme") {
    const family = event.target.closest("[data-family]")?.dataset.family;
    if (families.some(([id]) => id === family)) {
      document.documentElement.dataset.theme = family;
      await render();
    }
    return;
  }
  if (state.busy) return;
  state.busy = true;
  try {
    if (action === "refresh") await refresh();
    else if (action === "more") {
      const key = event.target.closest("[data-key]").dataset.key;
      const page = await provider.more(key, state.pages[key].nextCursor);
      state.records[key] = mergeRows(state.records[key], page.records);
      state.pages[key] = page;
    } else if (action === "more-calendar") await loadCalendar(true);
    else if (["prev-month", "next-month", "current-month"].includes(action)) {
      const target =
        action === "current-month" ? now : new Date(state.year, state.month + (action === "prev-month" ? -1 : 1), 1);
      state.year = target.getFullYear();
      state.month = target.getMonth();
      await loadCalendar();
    } else if (action === "disconnect") {
      await fetch("auth/logout", { method: "POST" });
      location.reload();
    }
    await render();
  } catch (error) {
    errorScreen(error);
  } finally {
    state.busy = false;
  }
});
root.addEventListener("change", (event) => {
  if (event.target.id === "topic-filter") state.filters.topic = event.target.value;
  else if (event.target.id === "status-filter") state.filters.status = event.target.value;
  else return;
  render();
});
let searchTimer;
root.addEventListener("input", (event) => {
  if (event.target.id !== "search") return;
  state.filters.query = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const position = event.target.selectionStart;
    await render();
    const input = document.getElementById("search");
    input?.focus();
    if (input?.type !== "search") input?.setSelectionRange(position, position);
  }, 180);
});
window.addEventListener("hashchange", async () => {
  state.mobileOpen = false;
  state.filters = { query: "", topic: "", status: "" };
  try {
    if (provider && route()[1] === "calendar") await loadCalendar();
    if (provider) await render();
  } catch (error) {
    errorScreen(error);
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.mobileOpen) {
    state.mobileOpen = false;
    render();
  }
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (provider && route()[0] === "settings") render();
});
setInterval(() => {
  if (
    !document.hidden &&
    provider &&
    !state.busy &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    refresh().catch(errorScreen);
}, 60_000);
init();
