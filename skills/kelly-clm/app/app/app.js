import { messages } from "./i18n/messages.js";
import {
  RISK_LEVELS,
  STAGES,
  atRiskObligationsCount,
  buildContract,
  computeMetrics,
  isObligationDueSoon,
  obligationsWithContract,
  renewalWatchCount,
} from "./js/clm-model.js?v=0.1.0";
import { closeConnectGate, passConnectGate, renderSetupRequired } from "./js/connect-gate.js?v=0.1.0";
import { getProvider } from "./js/providers/index.js?v=0.1.0";

const qs = new URLSearchParams(location.search);
const state = {
  contracts: [],
  obligations: [],
  approvals: [],
  metrics: { contracts: 0, renewals_90d: 0, obligations_at_risk: 0, approvals: 0 },
  settings: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(qs.get("lang") || localStorage.getItem("kelly-clm-language") || "auto"),
  demo: qs.has("demo"),
  busy: false,
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
  newContractBtn: document.querySelector("#newContractBtn"),
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
  if (els.newContractBtn) els.newContractBtn.textContent = t("newContract");
}

function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] ? decodeURIComponent(parts[1]) : "" };
}

function setRoute() {
  state.route = parseRoute();
  render();
  if (isMobileLayout()) setMobileSidebarOpen(false);
}

async function loadState() {
  const provider = await getProvider();
  const data = await provider.getState();
  closeConnectGate();
  state.contracts = data.contracts || [];
  state.obligations = data.obligations || [];
  state.approvals = data.approvals || [];
  state.metrics = data.metrics || state.metrics;
  state.settings = data;
  window.dispatchEvent(new CustomEvent("kelly-clm:state", { detail: data }));
  render();
}

function recomputeDemoMetrics() {
  state.metrics = computeMetrics(state.contracts, state.obligations, state.approvals, state.settings?.generated_at);
}

function contracts() {
  const q = state.query.trim().toLowerCase();
  const rows = state.contracts || [];
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
  return obligationsWithContract(state.obligations, state.contracts);
}

function approvalsNeedingReview() {
  return (state.metrics?.approvals ?? 0) || 0;
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
  const m = state.metrics;
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
  const stageRows = STAGES.map((stage) => {
    const items = state.contracts.filter((item) => item.stage === stage);
    if (!items.length) return "";
    return `<div class="pipeline-row"><span>${badge(stage)}</span><strong>${items.length}</strong><span>${items.map((item) => e(item.name)).join(", ")}</span></div>`;
  }).join("");
  const renewalRows = state.contracts
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
  if (state.route.id === "new") return renderNewContract();
  if (state.route.id) return renderContractDetail(state.route.id);
  els.content.innerHTML = contractTable(contracts());
}

function contractFormHtml(item = {}) {
  const disabled = state.busy ? "disabled" : "";
  return `
    <form id="contractForm" class="contract-form">
      <label>${t("name")}<input name="name" required value="${e(item.name || "")}" ${disabled}></label>
      <label>${t("counterparty")}<input name="counterparty" value="${e(item.counterparty || "")}" ${disabled}></label>
      <label>${t("type")}<input name="type" value="${e(item.type || "")}" ${disabled}></label>
      <label>${t("stage")}<select name="stage" ${disabled}>${STAGES.map((stage) => `<option value="${stage}" ${item.stage === stage ? "selected" : ""}>${e(enumLabel(stage))}</option>`).join("")}</select></label>
      <label>${t("owner")}<input name="owner" value="${e(item.owner || "")}" ${disabled}></label>
      <label>${t("businessOwner")}<input name="business_owner" value="${e(item.business_owner || "")}" ${disabled}></label>
      <label>${t("value")}<input name="value" value="${e(item.value || "")}" ${disabled}></label>
      <label>${t("start")}<input name="start_date" type="date" value="${e(item.start_date || "")}" ${disabled}></label>
      <label>${t("end")}<input name="end_date" type="date" value="${e(item.end_date || "")}" ${disabled}></label>
      <label>${t("renewal")}<input name="renewal_date" type="date" value="${e(item.renewal_date || "")}" ${disabled}></label>
      <label>${t("notice")}<input name="notice_deadline" type="date" value="${e(item.notice_deadline || "")}" ${disabled}></label>
      <label>${t("next")}<textarea name="next_action" rows="3" ${disabled}>${e(item.next_action || "")}</textarea></label>
      <label>${t("riskLabel")}<select name="risk" ${disabled}>${RISK_LEVELS.map((risk) => `<option value="${risk}" ${item.risk === risk ? "selected" : ""}>${e(enumLabel(risk))}</option>`).join("")}</select></label>
      <div class="form-actions">
        <button type="submit" ${disabled}>${item.id ? t("update") : t("save")}</button>
      </div>
    </form>
  `;
}

function readContractForm(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || ""),
    counterparty: String(data.get("counterparty") || ""),
    type: String(data.get("type") || ""),
    stage: String(data.get("stage") || "intake"),
    owner: String(data.get("owner") || ""),
    business_owner: String(data.get("business_owner") || ""),
    value: String(data.get("value") || ""),
    start_date: String(data.get("start_date") || ""),
    end_date: String(data.get("end_date") || ""),
    renewal_date: String(data.get("renewal_date") || ""),
    notice_deadline: String(data.get("notice_deadline") || ""),
    next_action: String(data.get("next_action") || ""),
    risk: String(data.get("risk") || "low"),
  };
}

function renderNewContract() {
  els.title.textContent = t("newContract");
  els.subtitle.textContent = "";
  els.content.innerHTML = `<div class="panel">${contractFormHtml()}</div>`;
  document.querySelector("#contractForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const contract = await submitCreateContract(readContractForm(event.target));
    if (contract) location.hash = `#/contracts/${contract.id}`;
  });
}

function renderContractDetail(id) {
  const item = state.contracts.find((contract) => contract.id === id);
  if (!item) return renderContracts();
  const ownObligations = obligations().filter((row) => row.contract_id === id);
  els.title.textContent = item.name;
  els.subtitle.textContent = `${item.counterparty} · ${enumLabel(item.stage)}`;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = item.name;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <a class="back-link" href="#/contracts">← ${t("contracts")}</a>
        <section class="panel"><h2>${t("next")}</h2><p>${e(item.next_action)}</p></section>
        ${contractTable([item])}
        <section class="panel"><h2>${t("obligations")}</h2>${obligationTable(ownObligations)}</section>
      </div>
      <aside class="detail-side">
        <h2>${t("editContract")}</h2>
        ${contractFormHtml(item)}
      </aside>
    </section>
  `;
  document.querySelector("#contractForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitUpdateContract(id, readContractForm(event.target));
  });
  bindObligationActions(els.content);
}

function obligationTable(rows, { actionable = true } = {}) {
  return `<div class="table-wrap"><table><thead><tr><th>${t("obligation")}</th><th>${t("contract")}</th><th>${t("owner")}</th><th>${t("due")}</th><th>${t("status")}</th><th>${t("evidence")}</th>${actionable ? "<th></th>" : ""}</tr></thead><tbody>${rows
    .map((item) => {
      const dueSoon = isObligationDueSoon(item, state.settings?.generated_at);
      const action =
        item.status === "done"
          ? `<button type="button" class="ghost" data-obligation-action="reopen" data-id="${e(item.id)}" ${state.busy ? "disabled" : ""}>${t("reopen")}</button>`
          : `<button type="button" data-obligation-action="done" data-id="${e(item.id)}" ${state.busy ? "disabled" : ""}>${t("markDone")}</button>`;
      return `<tr><td><strong>${e(item.title)}</strong></td><td>${e(item.contract?.name || "")}</td><td>${e(item.owner)}</td><td class="${dueSoon ? "due-soon" : ""}">${date(item.due_date)}</td><td>${badge(item.status)}</td><td>${e(item.evidence)}</td>${actionable ? `<td>${action}</td>` : ""}</tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function bindObligationActions(container) {
  container.querySelectorAll("[data-obligation-action]").forEach((button) => {
    button.addEventListener("click", () => {
      submitMarkObligationDone(button.dataset.id, button.dataset.obligationAction === "done");
    });
  });
}

function renderObligations() {
  els.content.innerHTML = obligationTable(obligations());
  bindObligationActions(els.content);
}

function renewalTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>${t("contract")}</th><th>${t("counterparty")}</th><th>${t("stage")}</th><th>${t("renewal")}</th><th>${t("notice")}</th><th></th></tr></thead><tbody>${rows
    .map((item) => {
      const acknowledged = Boolean(item.notice_acknowledged_at);
      const action = !item.notice_deadline
        ? ""
        : acknowledged
          ? `<span class="badge active">${t("acknowledged")}</span>`
          : `<button type="button" data-acknowledge-id="${e(item.id)}" ${state.busy ? "disabled" : ""}>${t("acknowledge")}</button>`;
      return `<tr><td><a href="#/contracts/${item.id}"><strong>${e(item.name)}</strong></a></td><td>${e(item.counterparty)}</td><td>${badge(item.stage)}</td><td>${date(item.renewal_date)}</td><td>${date(item.notice_deadline)}</td><td>${action}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function renderRenewals() {
  const rows = state.contracts.filter((item) => item.renewal_date || item.notice_deadline);
  els.content.innerHTML = renewalTable(rows);
  els.content.querySelectorAll("[data-acknowledge-id]").forEach((button) => {
    button.addEventListener("click", () => submitAcknowledgeRenewal(button.dataset.acknowledgeId));
  });
}

function renderApprovals() {
  els.content.innerHTML = `<div class="card-grid">${state.approvals
    .map(
      (item) =>
        `<article class="card panel"><h2>${e(item.title)}</h2><p class="muted">${e(item.summary)}</p><p>${badge(item.status)}</p><div class="actions"><button type="button" data-action="approve" data-id="${e(item.id)}" title="${t("approve")}" ${state.busy ? "disabled" : ""}>${t("approve")}</button><button type="button" data-action="changes" data-id="${e(item.id)}" title="${t("changes")}" ${state.busy ? "disabled" : ""}>${t("changes")}</button><button type="button" data-action="block" data-id="${e(item.id)}" title="${t("block")}" ${state.busy ? "disabled" : ""}>${t("block")}</button></div></article>`,
    )
    .join("")}</div>`;
  els.content.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => submitApprovalDecision(button.dataset.id, button.dataset.action));
  });
}

function renderSettings() {
  els.content.innerHTML = `<section class="settings panel"><h2>${t("profile")}</h2><dl><dt>${t("appName")}</dt><dd>Kelly CLM</dd><dt>${t("source")}</dt><dd>${e(state.settings?.profile?.company || "")}</dd><dt>${t("dataProvider")}</dt><dd>${e(state.settings?.data_provider || "")}</dd><dt>${t("status")}</dt><dd>${state.settings?.demo ? t("demoMode") : t("localOnly")}</dd></dl><p>${e(state.settings?.profile?.boundary || "")}</p><p class="muted">${t("generated")} ${datetime(state.settings?.generated_at)}</p></section>`;
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
  const renewals = renewalWatchCount(state.contracts);
  const risks = atRiskObligationsCount(state.obligations);
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
  const view = state.route.view;
  renderShell();
  if (view !== "contracts" || !state.route.id || state.route.id === "new") {
    els.title.textContent = viewLabel(view);
    els.subtitle.textContent = `${state.settings?.profile?.company || ""} · ${t("generated")} ${datetime(state.settings?.generated_at)}`;
  }
  if (view === "contracts") renderContracts();
  else if (view === "obligations") renderObligations();
  else if (view === "renewals") renderRenewals();
  else if (view === "approvals") renderApprovals();
  else if (view === "settings") renderSettings();
  else renderOverview();
}

// ---- Direct writes: create/edit a contract, mark an obligation done,
// acknowledge a renewal notice, and record an approval decision -- applied
// straight through the active provider (Busabase or demo), the same way
// kelly-revshare-simulator's scenario create/edit/decision writes work. This
// is a direct-manipulation control panel, not a review/approval queue: there
// is no separate decisions.json-equivalent bucket (the retired
// app/server/store.ts's decisions.json is replaced by direct field writes on
// each record). Demo mode never reaches Busabase; it mutates the in-memory
// snapshot already rendered so ?demo=1 stays fully interactive for
// screenshots/docs. ----

function showError(error) {
  els.content.insertAdjacentHTML("afterbegin", `<div class="empty-inline">${e(error?.message || error)}</div>`);
}

async function submitCreateContract(input) {
  if (state.demo) {
    const contract = buildContract(input);
    state.contracts.push(contract);
    recomputeDemoMetrics();
    render();
    return contract;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    const contract = await provider.createContract(input);
    await loadState();
    return contract;
  } catch (error) {
    showError(error);
    return null;
  } finally {
    state.busy = false;
  }
}

async function submitUpdateContract(id, input) {
  if (state.demo) {
    const index = state.contracts.findIndex((item) => item.id === id);
    if (index !== -1) {
      const existing = state.contracts[index];
      state.contracts[index] = buildContract({ ...existing, ...input, id, created_at: existing.created_at });
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.updateContract(id, input);
    await loadState();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

async function submitMarkObligationDone(id, done) {
  if (state.demo) {
    const index = state.obligations.findIndex((item) => item.id === id);
    if (index !== -1) {
      state.obligations[index] = {
        ...state.obligations[index],
        status: done ? "done" : "open",
        updated_at: new Date().toISOString(),
      };
      recomputeDemoMetrics();
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.markObligationDone(id, done);
    await loadState();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

async function submitAcknowledgeRenewal(contractId) {
  if (state.demo) {
    const index = state.contracts.findIndex((item) => item.id === contractId);
    if (index !== -1) {
      state.contracts[index] = { ...state.contracts[index], notice_acknowledged_at: new Date().toISOString() };
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.acknowledgeRenewal(contractId);
    await loadState();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

async function submitApprovalDecision(id, action, note = "") {
  if (state.demo) {
    const index = state.approvals.findIndex((item) => item.id === id);
    if (index !== -1) {
      const status = { approve: "approved", changes: "changes_requested", block: "blocked" }[action] || action;
      state.approvals[index] = {
        ...state.approvals[index],
        status,
        decision_note: note,
        decided_at: new Date().toISOString(),
      };
      recomputeDemoMetrics();
    }
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    const provider = await getProvider();
    await provider.saveApprovalDecision(id, action, note);
    await loadState();
  } catch (error) {
    showError(error);
  } finally {
    state.busy = false;
  }
}

window.addEventListener("hashchange", setRoute);
window.addEventListener("resize", syncResponsiveShell);
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.sidebarToggle?.addEventListener("click", toggleSidebar);
els.mobileSidebarToggle?.addEventListener("click", toggleSidebar);
els.sidebarScrim?.addEventListener("click", () => setMobileSidebarOpen(false));
els.newContractBtn?.addEventListener("click", () => {
  location.hash = "#/contracts/new";
});
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-clm-language", state.lang);
  render();
});

syncResponsiveShell();

async function boot() {
  const ready = await passConnectGate({ onReady: boot });
  if (!ready) return;
  try {
    await loadState();
  } catch (error) {
    if (String(error?.message || error).startsWith("SETUP_")) {
      renderSetupRequired(error, boot);
      return;
    }
    els.content.innerHTML = `<div class="empty-inline">${e(error.message)}</div>`;
  }
}

boot();
