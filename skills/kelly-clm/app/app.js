import { messages } from "./i18n/messages.js";

const qs = new URLSearchParams(location.search);
const state = {
  data: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(qs.get("lang") || localStorage.getItem("kelly-clm-language") || "auto"),
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-clm.sidebarCollapsed";

const els = {
  title: document.querySelector("#title"),
  subtitle: document.querySelector("#subtitle"),
  content: document.querySelector("#content"),
  sync: document.querySelector("#sync"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  approvalsCount: document.querySelector("#count-approvals"),
  renewalsCount: document.querySelector("#count-renewals"),
  riskCount: document.querySelector("#count-risk"),
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
  document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed));
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
    syncSidebarState();
    setMobileSidebarOpen(false);
    return;
  }
  setMobileSidebarOpen(false);
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1", { persist: false });
}

function normalizeLang(lang) {
  const value = String(lang || "auto").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value === "en") return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.languages?.some((lang) => lang.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function t(key) {
  return messages[activeLang()]?.[key] || messages.en[key] || key;
}

function enumLabel(value) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.[key] || messages.en.enum?.[key] || key.replaceAll("_", " ");
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
  els.search.setAttribute("aria-label", t("search"));
  els.refresh.textContent = t("refresh");
  els.refresh.title = t("refresh");
  els.sidebarToggle.title = t("toggleSidebar");
  els.sidebarToggle.setAttribute("aria-label", t("toggleSidebar"));
  if (els.mobileSidebarToggle) {
    els.mobileSidebarToggle.title = t("openSidebar");
    els.mobileSidebarToggle.setAttribute("aria-label", t("openSidebar"));
  }
  if (els.mobileRefresh) {
    els.mobileRefresh.title = t("refresh");
    els.mobileRefresh.setAttribute("aria-label", t("refresh"));
  }
}

function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
}

async function load() {
  const params = new URLSearchParams();
  params.set("demo", qs.get("demo") || "overview");
  params.set("lang", state.lang);
  const res = await fetch(`/api/state?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`State request failed: ${res.status}`);
  state.data = await res.json();
  render();
}

function contracts() {
  const q = state.query.trim().toLowerCase();
  const rows = state.data?.contracts || [];
  if (!q) return rows;
  return rows.filter((item) =>
    Object.values(item).some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(q),
    ),
  );
}

function obligations() {
  const rows = state.data?.obligations || [];
  return rows.map((item) => ({
    ...item,
    contract: state.data.contracts.find((contract) => contract.id === item.contract_id),
  }));
}

function approvalsNeedingReview() {
  return (state.data?.approvals || []).filter((item) => item.status === "needs_review").length;
}

function renewalWatchCount() {
  return (state.data?.contracts || []).filter((item) => item.notice_deadline || item.renewal_date).length;
}

function atRiskCount() {
  return obligations().filter((item) => item.status === "at_risk" || item.status === "blocked").length;
}

function badge(value) {
  return `<span class="badge ${e(value)}">${e(enumLabel(value))}</span>`;
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function datetime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function metrics() {
  const m = state.data.metrics;
  return `<div class="metrics">
    <div class="metric"><span>${t("contracts")}</span><strong>${m.contracts}</strong></div>
    <div class="metric"><span>${t("renewals")}</span><strong>${m.renewals_90d}</strong></div>
    <div class="metric"><span>${t("atRisk")}</span><strong>${m.obligations_at_risk}</strong></div>
    <div class="metric"><span>${t("approvals")}</span><strong>${m.approvals}</strong></div>
  </div>`;
}

function compactItem({ href, title, meta, status }) {
  return `<a class="item-row" href="${href}"><span><strong>${e(title)}</strong>${meta ? `<small>${e(meta)}</small>` : ""}</span>${status ? badge(status) : ""}</a>`;
}

function renderOverview() {
  const stages = ["intake", "review", "negotiation", "approval", "signature_ready", "active", "renewal", "closed"];
  const stageRows = stages
    .map((stage) => {
      const items = state.data.contracts.filter((item) => item.stage === stage);
      if (!items.length) return "";
      return `<div class="pipeline-row"><span>${badge(stage)}</span><strong>${items.length}</strong><span>${items.map((item) => e(item.name)).join(", ")}</span></div>`;
    })
    .join("");
  const renewalRows = state.data.contracts
    .filter((item) => item.notice_deadline)
    .map((item) =>
      compactItem({
        href: `#/contracts/${item.id}`,
        title: item.name,
        meta: `${t("notice")}: ${date(item.notice_deadline)}`,
        status: item.stage,
      }),
    )
    .join("");
  const riskRows = obligations()
    .filter((item) => item.status === "at_risk" || item.status === "blocked")
    .map((item) =>
      compactItem({
        href: `#/contracts/${item.contract_id}`,
        title: item.title,
        meta: `${item.contract?.name || ""} · ${date(item.due_date)}`,
        status: item.status,
      }),
    )
    .join("");
  els.content.innerHTML = `${metrics()}<div class="overview-grid"><section class="panel wide"><h2>${t("lifecycle")}</h2><div class="pipeline">${stageRows}</div></section><section class="panel"><h2>${t("upcoming")}</h2><div class="stack-list">${renewalRows || `<div class="empty-inline">${t("empty")}</div>`}</div></section><section class="panel"><h2>${t("atRisk")}</h2><div class="stack-list">${riskRows || `<div class="empty-inline">${t("empty")}</div>`}</div></section></div>`;
}

function contractTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>${t("contract")}</th><th>${t("counterparty")}</th><th>${t("type")}</th><th>${t("stage")}</th><th>${t("owner")}</th><th>${t("value")}</th><th>${t("notice")}</th></tr></thead><tbody>${rows
    .map(
      (item) =>
        `<tr><td><a href="#/contracts/${item.id}"><strong>${e(item.name)}</strong></a><div class="muted">${e(item.next_action)}</div></td><td>${e(item.counterparty)}</td><td>${e(item.type)}</td><td>${badge(item.stage)}</td><td>${e(item.owner)}</td><td>${e(item.value)}</td><td>${date(item.notice_deadline)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function renderContracts() {
  if (state.route.id) return renderContractDetail(state.route.id);
  els.content.innerHTML = contractTable(contracts());
}

function renderContractDetail(id) {
  const item = state.data.contracts.find((contract) => contract.id === id);
  if (!item) return renderContracts();
  const ownObligations = obligations().filter((row) => row.contract_id === id);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${item.counterparty} · ${enumLabel(item.stage)}`;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = item.name;
  els.content.innerHTML = `<section class="panel"><h2>${t("next")}</h2><p>${e(item.next_action)}</p></section>${contractTable([item])}<section class="panel"><h2>${t("obligations")}</h2>${obligationTable(ownObligations)}</section>`;
}

function obligationTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>${t("obligation")}</th><th>${t("contract")}</th><th>${t("owner")}</th><th>${t("due")}</th><th>${t("status")}</th><th>${t("evidence")}</th></tr></thead><tbody>${rows
    .map(
      (item) =>
        `<tr><td><strong>${e(item.title)}</strong></td><td>${e(item.contract?.name || "")}</td><td>${e(item.owner)}</td><td>${date(item.due_date)}</td><td>${badge(item.status)}</td><td>${e(item.evidence)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function renderObligations() {
  els.content.innerHTML = obligationTable(obligations());
}

function renderRenewals() {
  els.content.innerHTML = contractTable(
    state.data.contracts.filter((item) => item.renewal_date || item.notice_deadline),
  );
}

function renderApprovals() {
  els.content.innerHTML = `<div class="card-grid">${state.data.approvals
    .map(
      (item) =>
        `<article class="card panel"><h2>${e(item.title)}</h2><p class="muted">${e(item.summary)}</p><p>${badge(item.status)}</p><div class="actions"><button type="button" data-action="approve" data-id="${item.id}" title="${t("approve")}">${t("approve")}</button><button type="button" data-action="changes" data-id="${item.id}" title="${t("changes")}">${t("changes")}</button><button type="button" data-action="block" data-id="${item.id}" title="${t("block")}">${t("block")}</button></div></article>`,
    )
    .join("")}</div>`;
  els.content.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await fetch("/api/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: button.dataset.id, action: button.dataset.action }),
      });
      button.closest(".card").querySelector(".muted").textContent = t("demoDecision");
    });
  });
}

function renderSettings() {
  els.content.innerHTML = `<section class="settings panel"><h2>${t("profile")}</h2><dl><dt>${t("appName")}</dt><dd>Kelly CLM</dd><dt>${t("source")}</dt><dd>${e(state.data.profile.company)}</dd><dt>${t("dataProvider")}</dt><dd>${t("localOnly")}</dd><dt>${t("status")}</dt><dd>${state.data.demo ? t("demoMode") : t("localOnly")}</dd></dl><p>${e(state.data.profile.boundary)}</p><p class="muted">${t("generated")} ${datetime(state.data.generated_at)}</p></section>`;
}

function viewLabel(view) {
  if (view === "contracts") return t("contracts");
  if (view === "obligations") return t("obligations");
  if (view === "renewals") return t("renewals");
  if (view === "approvals") return t("approvals");
  if (view === "settings") return t("settings");
  return t("overview");
}

function renderShell() {
  applyI18n();
  const approvals = approvalsNeedingReview();
  const renewals = renewalWatchCount();
  const risks = atRiskCount();
  els.sync.textContent = `${approvals} ${t("approvals")}`;
  if (els.approvalsCount) els.approvalsCount.textContent = approvals;
  if (els.renewalsCount) els.renewalsCount.textContent = renewals;
  if (els.riskCount) els.riskCount.textContent = risks;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = approvals ? `${approvals} ${t("needApproval")}` : `${risks} ${t("riskCount")}`;
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
}

function render() {
  if (!state.data) return;
  const view = state.route.view;
  renderShell();
  if (view !== "contracts" || !state.route.id) {
    els.title.textContent = viewLabel(view);
    els.subtitle.textContent = `${state.data.profile.company} · ${t("generated")} ${datetime(state.data.generated_at)}`;
  }
  if (view === "contracts") renderContracts();
  else if (view === "obligations") renderObligations();
  else if (view === "renewals") renderRenewals();
  else if (view === "approvals") renderApprovals();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

window.addEventListener("hashchange", () => {
  state.route = parseRoute();
  render();
  if (isMobileLayout()) setMobileSidebarOpen(false);
});

window.addEventListener("resize", syncResponsiveShell);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMobileSidebarOpen(false);
});

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", load);
els.mobileRefresh?.addEventListener("click", load);
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-clm-language", state.lang);
  load();
});

syncResponsiveShell();
load();
