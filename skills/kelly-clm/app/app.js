const qs = new URLSearchParams(location.search);
const state = {
  data: null,
  route: parseRoute(),
  query: "",
  lang: normalizeLang(qs.get("lang") || localStorage.getItem("kelly-clm-lang") || "auto"),
};

const labels = {
  en: {
    overview: "Overview",
    contracts: "Contracts",
    obligations: "Obligations",
    renewals: "Renewals",
    approvals: "Approvals",
    settings: "Settings",
    generated: "Generated",
    lifecycle: "Lifecycle Pipeline",
    upcoming: "Upcoming Renewals",
    atRisk: "At-risk Obligations",
    owner: "Owner",
    businessOwner: "Business owner",
    contract: "Contract",
    counterparty: "Counterparty",
    type: "Type",
    stage: "Stage",
    value: "Value",
    start: "Start",
    end: "End",
    renewal: "Renewal",
    notice: "Notice deadline",
    next: "Next action",
    due: "Due",
    status: "Status",
    evidence: "Evidence",
    approve: "Approve",
    changes: "Request changes",
    block: "Block",
    demoDecision: "Demo mode: local handoff only.",
    search: "Search",
  },
  zh: {
    overview: "总览",
    contracts: "合同库",
    obligations: "义务",
    renewals: "续约",
    approvals: "审批",
    settings: "设置",
    generated: "生成于",
    lifecycle: "生命周期管道",
    upcoming: "即将续约",
    atRisk: "高风险义务",
    owner: "负责人",
    businessOwner: "业务负责人",
    contract: "合同",
    counterparty: "相对方",
    type: "类型",
    stage: "阶段",
    value: "金额/事项",
    start: "开始",
    end: "结束",
    renewal: "续约",
    notice: "通知截止",
    next: "下一步",
    due: "到期",
    status: "状态",
    evidence: "证据",
    approve: "批准",
    changes: "要求修改",
    block: "拦截",
    demoDecision: "演示模式：仅写本地交接。",
    search: "搜索",
  },
};

const enumLabels = {
  en: {
    intake: "intake",
    review: "review",
    negotiation: "negotiation",
    approval: "approval",
    signature_ready: "signature-ready",
    active: "active",
    renewal: "renewal",
    closed: "closed",
    open: "open",
    at_risk: "at risk",
    blocked: "blocked",
    needs_review: "needs review",
  },
  zh: {
    intake: "需求接入",
    review: "审阅",
    negotiation: "谈判",
    approval: "审批",
    signature_ready: "待签署",
    active: "生效中",
    renewal: "续约",
    closed: "已关闭",
    open: "未完成",
    at_risk: "有风险",
    blocked: "已阻塞",
    needs_review: "待审核",
  },
};

const els = {
  title: document.querySelector("#title"),
  subtitle: document.querySelector("#subtitle"),
  content: document.querySelector("#content"),
  sync: document.querySelector("#sync"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  language: document.querySelector("#language"),
};

function normalizeLang(lang) {
  if (String(lang).toLowerCase().startsWith("zh")) return "zh";
  if (lang === "en") return "en";
  return "auto";
}

function activeLang() {
  if (state.lang !== "auto") return state.lang;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key) {
  return labels[activeLang()][key] || key;
}

function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

function label(value) {
  return enumLabels[activeLang()][value] || String(value || "");
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

function badge(value) {
  return `<span class="badge ${e(value)}">${e(label(value))}</span>`;
}

function date(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
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
    .map(
      (item) =>
        `<a class="list-row" href="#/contracts/${item.id}"><strong>${e(item.name)}</strong><span>${t("notice")}: ${date(item.notice_deadline)}</span>${badge(item.stage)}</a>`,
    )
    .join("");
  const riskRows = obligations()
    .filter((item) => item.status === "at_risk" || item.status === "blocked")
    .map(
      (item) =>
        `<a class="list-row" href="#/contracts/${item.contract_id}"><strong>${e(item.title)}</strong><span>${e(item.contract?.name || "")} · ${date(item.due_date)}</span>${badge(item.status)}</a>`,
    )
    .join("");
  els.content.innerHTML = `${metrics()}<div class="grid"><section class="panel wide"><h2>${t("lifecycle")}</h2><div class="pipeline">${stageRows}</div></section><section class="panel"><h2>${t("upcoming")}</h2>${renewalRows}</section><section class="panel"><h2>${t("atRisk")}</h2>${riskRows}</section></div>`;
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
  els.subtitle.textContent = `${item.counterparty} · ${badge(item.stage)}`;
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
  els.content.innerHTML = `<div class="grid">${state.data.approvals
    .map(
      (item) =>
        `<article class="card panel"><h2>${e(item.title)}</h2><p class="muted">${e(item.summary)}</p><p>${badge(item.status)}</p><div class="actions"><button data-action="approve" data-id="${item.id}">${t("approve")}</button><button data-action="changes" data-id="${item.id}">${t("changes")}</button><button data-action="block" data-id="${item.id}">${t("block")}</button></div></article>`,
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
  els.content.innerHTML = `<section class="panel"><h2>Kelly CLM</h2><p>${e(state.data.profile.boundary)}</p><p class="muted">${t("generated")} ${new Date(state.data.generated_at).toLocaleString()}</p></section>`;
}

function render() {
  if (!state.data) return;
  const view = state.route.view;
  if (view !== "contracts" || !state.route.id) {
    els.title.textContent = t(view) || t("overview");
    els.subtitle.textContent = `${state.data.profile.company} · ${t("generated")} ${new Date(state.data.generated_at).toLocaleString()}`;
  }
  els.sync.textContent = `${state.data.metrics.approvals} ${t("approvals")}`;
  els.search.placeholder = t("search");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === view));
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
});
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  render();
});
els.refresh.addEventListener("click", load);
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-clm-lang", state.lang);
  load();
});
load();
