import { messages } from "./i18n/messages.js";

const state = {
  snapshot: null,
  settings: null,
  route: parseRoute(),
  query: "",
  month: "",
  lang: normalizeLang(
    new URLSearchParams(location.search).get("lang") || localStorage.getItem("kelly-family-fund-language") || "auto",
  ),
  demo: new URLSearchParams(location.search).get("demo") || "",
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "kelly-family-fund.sidebarCollapsed";

const DONUT_COLORS = ["#334155", "#0d9488", "#2563eb", "#9333ea", "#d97706", "#dc2626", "#65a30d", "#0891b2"];

const els = {
  title: document.querySelector("#page-title"),
  subtitle: document.querySelector("#page-subtitle"),
  content: document.querySelector("#content"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh"),
  mobileRefresh: document.querySelector("#mobileRefresh"),
  monthSelect: document.querySelector("#monthSelect"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileSidebarToggle: document.querySelector("#mobileSidebarToggle"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  mobileViewTitle: document.querySelector("#mobileViewTitle"),
  mobileViewMeta: document.querySelector("#mobileViewMeta"),
  syncStatus: document.querySelector("#sync-status"),
  balanceCount: document.querySelector("#count-balance"),
  familyCount: document.querySelector("#count-families"),
  entryCount: document.querySelector("#count-entries"),
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

function categoryLabel(value) {
  if (!value) return "";
  const key = String(value);
  return messages[activeLang()]?.enum?.category?.[key] || messages.en.enum?.category?.[key] || key;
}

function baseCurrency() {
  return state.snapshot?.base_currency || "CNY";
}

function money(value, currency = baseCurrency()) {
  return new Intl.NumberFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function signedPct(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function parseRoute() {
  const parts = (location.hash || "#/overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: parts[0] || "overview", id: parts[1] || "" };
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
  const monthKeys = months().map((m) => m.month);
  if (!monthKeys.includes(state.month)) state.month = monthKeys.length ? monthKeys[monthKeys.length - 1] : "";
  applyDemoRoute();
  render();
}

function applyDemoRoute() {
  if (!state.settings?.demo || location.hash) return;
  const scenario = state.settings.demo_scenario || "overview";
  const map = {
    ledger: "#/ledger",
    family: "#/family",
    detail: "#/family/fam-01",
    category: "#/category",
    overview: "#/overview",
  };
  const route = map[scenario] || "#/overview";
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

function fund() {
  return state.snapshot?.fund || {};
}

function beneficiaries() {
  return state.snapshot?.beneficiaries || [];
}

function families() {
  return state.snapshot?.families || [];
}

function incomeRows() {
  return state.snapshot?.income || [];
}

function expenseRows() {
  return state.snapshot?.expenses || [];
}

function months() {
  return state.snapshot?.months || [];
}

function totals() {
  return state.snapshot?.totals || {};
}

function byCategory() {
  return state.snapshot?.by_category || [];
}

function byFamily() {
  return state.snapshot?.by_family || [];
}

function hasData() {
  return months().length > 0;
}

function monthRow(month) {
  return months().find((m) => m.month === month) || {};
}

function maxDeviation() {
  const rows = byFamily();
  if (!rows.length) return 0;
  return rows.reduce((best, row) => (Math.abs(row.deviation_pct) > Math.abs(best) ? row.deviation_pct : best), 0);
}

function syncMonthSelect() {
  if (!els.monthSelect) return;
  const monthKeys = months().map((m) => m.month);
  const showSelect = ["overview", "ledger"].includes(state.route.view) && monthKeys.length > 0;
  els.monthSelect.hidden = !showSelect;
  if (!showSelect) return;
  const options = [`<option value="">${escapeHtml(t("allMonths"))}</option>`].concat(
    monthKeys.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`),
  );
  els.monthSelect.innerHTML = options.join("");
  els.monthSelect.value = state.month || "";
}

function renderShell() {
  applyI18n();
  const balance = totals().balance || 0;
  const familyCount = families().length;
  const entries = incomeRows().length + expenseRows().length;
  els.syncStatus.textContent = hasData() ? `${entries} ${t("entryCount")}` : t("needsEntry");
  if (els.balanceCount) els.balanceCount.textContent = money(balance);
  if (els.familyCount) els.familyCount.textContent = familyCount;
  if (els.entryCount) els.entryCount.textContent = entries;
  if (els.mobileViewTitle) els.mobileViewTitle.textContent = viewLabel(state.route.view);
  if (els.mobileViewMeta) {
    els.mobileViewMeta.textContent = hasData()
      ? `${money(balance)} · ${familyCount} ${t("familyCount")}`
      : t("needsEntry");
  }
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === state.route.view);
  });
  syncMonthSelect();
}

function viewLabel(view) {
  if (view === "ledger") return t("ledger");
  if (view === "family") return t("family");
  if (view === "category") return t("category");
  if (view === "settings") return t("settings");
  return t("overview");
}

function subtitleLine() {
  if (!hasData()) return t("needsEntry");
  const monthKeys = months().map((m) => m.month);
  const last = monthKeys[monthKeys.length - 1] || "";
  return `${fund().name || t("fund")} · ${t("statsAsOf")} ${last} · ${families().length} ${t("familyCount")}`;
}

function donut(rows, labelFn, valueFn) {
  const data = rows.map((row) => ({ row, value: Number(valueFn(row)) || 0 })).filter((item) => item.value > 0);
  const sum = data.reduce((acc, item) => acc + item.value, 0);
  if (!data.length || sum <= 0) return `<div class="empty">${t("empty")}</div>`;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data
    .map((item, index) => {
      const fraction = item.value / sum;
      const dash = fraction * circumference;
      const seg = `<circle r="${radius}" cx="80" cy="80" fill="none" stroke="${DONUT_COLORS[index % DONUT_COLORS.length]}" stroke-width="28" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"></circle>`;
      offset += dash;
      return seg;
    })
    .join("");
  const legend = data
    .map(
      (item, index) => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${DONUT_COLORS[index % DONUT_COLORS.length]}"></span>
        <span>${escapeHtml(labelFn(item.row))}</span>
        <span class="legend-value">${pct((item.value / sum) * 100)}</span>
      </div>
    `,
    )
    .join("");
  return `
    <div class="alloc-panel">
      <svg class="donut" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Allocation">
        ${segments}
        <circle r="46" cx="80" cy="80" fill="var(--panel)"></circle>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

function allocBars(rows, labelFn, valueFn, metaFn) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  const max = Math.max(...rows.map((row) => Number(valueFn(row)) || 0), 1);
  return `
    <div class="alloc-list">
      ${rows
        .map(
          (row) => `
        <div class="alloc-row">
          <span class="alloc-label">${escapeHtml(labelFn(row))}</span>
          <span class="alloc-track"><span class="alloc-fill" style="width:${Math.max(((Number(valueFn(row)) || 0) / max) * 100, 2)}%"></span></span>
          <span class="alloc-value">${escapeHtml(metaFn(row))}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function balanceTrend() {
  const rows = months();
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  const values = rows.map((row) => Number(row.balance_end) || 0);
  const max = Math.max(...values, 1);
  return `
    <div class="alloc-list">
      ${rows
        .map(
          (row) => `
        <div class="alloc-row">
          <span class="alloc-label">${escapeHtml(row.month)}</span>
          <span class="alloc-track"><span class="alloc-fill" style="width:${Math.max(((Number(row.balance_end) || 0) / max) * 100, 2)}%"></span></span>
          <span class="alloc-value">${money(row.balance_end)} · <span class="${(row.net || 0) < 0 ? "negative" : "positive"}">${money(row.net)}</span></span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function insightText(insight) {
  const templates = messages[activeLang()]?.insightTemplates || messages.en.insightTemplates || {};
  const template = templates[insight.code] || messages.en.insightTemplates?.[insight.code] || insight.code;
  const params = insight.params || {};
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    let value = params[key];
    if (value === undefined || value === null) return "";
    if (key === "amount") value = money(value);
    else if (key === "delta") {
      const n = Number(value) || 0;
      value = `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
    } else if (key === "pct") value = (Number(value) || 0).toFixed(1);
    return escapeHtml(String(value));
  });
}

function insightsPanel() {
  const items = state.snapshot?.insights || [];
  const body = items.length
    ? items
        .map(
          (insight) => `
      <div class="insight-row">
        <span class="badge sev-${escapeHtml(insight.severity || "info")}">${escapeHtml(severityLabel(insight.severity))}</span>
        <span class="insight-text">${insightText(insight)}</span>
      </div>
    `,
        )
        .join("")
    : `<div class="muted insight-empty">${t("noFlags")}</div>`;
  return `
    <div class="overview-panel wide">
      <h2>${t("insights")}</h2>
      <div class="muted insight-note">${t("insightsNote")}</div>
      <div class="insight-list">${body}</div>
    </div>
  `;
}

function severityLabel(severity) {
  if (severity === "high") return t("sevHigh");
  if (severity === "watch") return t("sevWatch");
  return t("sevInfo");
}

function metricsCards() {
  const total = totals();
  const row = monthRow(state.month || months()[months().length - 1]?.month);
  const net = row.net || 0;
  const dev = maxDeviation();
  return `
    <div class="metrics">
      <div class="metric"><span>${t("balance")}</span><strong>${money(total.balance)}</strong></div>
      <div class="metric"><span>${t("monthIncome")}</span><strong>${money(row.income_total)}</strong></div>
      <div class="metric"><span>${t("monthExpense")}</span><strong>${money(row.expense_total)}</strong></div>
      <div class="metric"><span>${t("monthNet")}</span><strong class="${net < 0 ? "negative" : "positive"}">${money(net)}</strong></div>
    </div>
    <div class="metrics">
      <div class="metric"><span>${t("careTotal")}</span><strong>${money(total.care_total)}</strong></div>
      <div class="metric"><span>${t("familyTotal")}</span><strong>${money(total.family_total)}</strong></div>
      <div class="metric"><span>${t("avgBenefit")}</span><strong>${money(total.avg_family_benefit)}</strong></div>
      <div class="metric"><span>${t("maxDeviation")}</span><strong class="${Math.abs(dev) >= 20 ? "negative" : "positive"}">${signedPct(dev)}</strong></div>
    </div>
  `;
}

function renderOverview() {
  els.title.textContent = t("overview");
  els.subtitle.textContent = subtitleLine();
  const cats = byCategory();
  els.content.innerHTML = `
    ${metricsCards()}
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("headlineAllocation")}</h2>
        ${donut(
          cats,
          (row) => categoryLabel(row.category),
          (row) => row.amount,
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("balanceTrend")}</h2>
        ${balanceTrend()}
      </div>
      ${insightsPanel()}
    </section>
  `;
}

function familyName(familyId) {
  if (!familyId) return "";
  return families().find((f) => f.id === familyId)?.name || familyId;
}

function ledgerEntries() {
  const query = state.query.trim().toLowerCase();
  const entries = [];
  for (const row of incomeRows()) {
    entries.push({
      kind: "income",
      month: row.month,
      date: row.month,
      category: "",
      amount: row.amount,
      label: beneficiaryName(row.beneficiary_id),
      occasion: row.note || "",
      family_id: null,
      shared: false,
    });
  }
  for (const row of expenseRows()) {
    entries.push({
      kind: "expense",
      month: row.month,
      date: row.date || row.month,
      category: row.category,
      amount: row.amount,
      label: row.payee || "",
      occasion: row.occasion || "",
      family_id: row.family_id,
      shared: row.shared,
    });
  }
  return entries
    .filter((entry) => {
      if (state.month && entry.month !== state.month) return false;
      if (!query) return true;
      return [entry.label, entry.occasion, categoryLabel(entry.category), familyName(entry.family_id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function beneficiaryName(id) {
  return beneficiaries().find((b) => b.id === id)?.name || id;
}

function familyTag(entry) {
  if (entry.kind === "income") return `<span class="badge">${t("income")}</span>`;
  if (entry.category === "care") return `<span class="badge">${t("care")}</span>`;
  if (entry.shared) return `<span class="badge">${t("sharedTag")}</span>`;
  if (entry.family_id) return `<span class="badge">${escapeHtml(familyName(entry.family_id))}</span>`;
  return "";
}

function renderLedger() {
  els.title.textContent = t("ledger");
  els.subtitle.textContent = subtitleLine();
  const entries = ledgerEntries();
  els.content.innerHTML = entries.length
    ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("date")}</th><th>${t("type")}</th><th>${t("payee")}</th><th>${t("occasion")}</th><th>${t("directedTo")}</th><th>${t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
            <tr>
              <td>${escapeHtml(entry.date)}</td>
              <td>${entry.kind === "income" ? `<span class="badge sev-info">${t("income")}</span>` : `<span class="badge">${escapeHtml(categoryLabel(entry.category))}</span>`}</td>
              <td><div class="strong">${escapeHtml(entry.label)}</div></td>
              <td>${escapeHtml(entry.occasion)}</td>
              <td>${familyTag(entry)}</td>
              <td class="num ${entry.kind === "income" ? "positive" : ""}">${entry.kind === "income" ? "+" : "-"}${money(entry.amount)}</td>
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

function renderFamily() {
  els.title.textContent = t("fairnessTitle");
  els.subtitle.textContent = `${t("avgBenefit")} ${money(totals().avg_family_benefit)} · ${families().length} ${t("familyCount")}`;
  const rows = byFamily();
  const maxBenefit = Math.max(...rows.map((row) => row.benefit_total || 0), 1);
  els.content.innerHTML = `
    <div class="overview-panel">
      <div class="muted insight-note">${t("fairnessNote")}</div>
      <div class="fairness-list">
        ${rows
          .map((row) => {
            const dev = Number(row.deviation_pct) || 0;
            const cls = Math.abs(dev) >= 20 ? "negative" : dev >= 0 ? "positive" : "muted-num";
            return `
          <a class="fairness-row" href="#/family/${encodeURIComponent(row.family_id)}">
            <span class="fairness-name"><strong>${escapeHtml(row.name)}</strong></span>
            <span class="fairness-track"><span class="fairness-fill" style="width:${Math.max(((row.benefit_total || 0) / maxBenefit) * 100, 2)}%"></span></span>
            <span class="fairness-benefit num">${money(row.benefit_total)}</span>
            <span class="fairness-share num">${pct(row.share_pct)}</span>
            <span class="fairness-dev num ${cls}">${signedPct(dev)}</span>
          </a>
        `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderFamilyDetail() {
  const family = families().find((f) => f.id === state.route.id);
  if (!family) {
    renderFamily();
    return;
  }
  const roll = byFamily().find((row) => row.family_id === family.id) || {};
  const numFamilies = families().length || 1;
  const directed = expenseRows().filter((row) => row.category !== "care" && !row.shared && row.family_id === family.id);
  const shared = expenseRows().filter((row) => row.category !== "care" && row.shared);
  els.title.textContent = family.name;
  els.subtitle.textContent = `${t("benefit")} ${money(roll.benefit_total)} · ${signedPct(roll.deviation_pct)}`;
  els.content.innerHTML = `
    <section class="detail">
      <div class="detail-main">
        <div class="metrics">
          <div class="metric"><span>${t("benefit")}</span><strong>${money(roll.benefit_total)}</strong></div>
          <div class="metric"><span>${t("sharePct")}</span><strong>${pct(roll.share_pct)}</strong></div>
          <div class="metric"><span>${t("deviation")}</span><strong class="${Math.abs(roll.deviation_pct || 0) >= 20 ? "negative" : "positive"}">${signedPct(roll.deviation_pct)}</strong></div>
          <div class="metric"><span>${t("avgBenefit")}</span><strong>${money(totals().avg_family_benefit)}</strong></div>
        </div>
        <h2 style="margin:8px 0">${t("directedExpenses")}</h2>
        ${expenseTable(directed, false)}
        <h2 style="margin:16px 0 8px">${t("sharedShare")}</h2>
        ${expenseTable(shared, true, numFamilies)}
      </div>
      <aside class="detail-side">
        <h2>${t("familyDetail")}</h2>
        <dl>
          <dt>${t("head")}</dt><dd>${escapeHtml(family.head || "")}</dd>
          <dt>${t("members")}</dt><dd>${escapeHtml(String(family.members_count || 0))}</dd>
          <dt>${t("family")}</dt><dd>${escapeHtml(family.id)}</dd>
        </dl>
      </aside>
    </section>
  `;
}

function expenseTable(rows, shared, numFamilies = 1) {
  if (!rows.length) return `<div class="empty">${t("empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>${t("date")}</th><th>${t("type")}</th><th>${t("occasion")}</th><th>${shared ? t("sharedShare") : t("amount")}</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.date || row.month)}</td>
              <td><span class="badge">${escapeHtml(categoryLabel(row.category))}</span></td>
              <td>${escapeHtml(row.occasion || row.payee || "")}</td>
              <td class="num">${money(shared ? (row.amount || 0) / numFamilies : row.amount)}${shared ? `<div class="muted">${money(row.amount)} ÷ ${numFamilies}</div>` : ""}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategory() {
  els.title.textContent = t("categoryTitle");
  els.subtitle.textContent = subtitleLine();
  const rows = byCategory();
  const total = totals();
  const careVsFamily = [
    { key: "care", label: t("care"), amount: total.care_total || 0 },
    { key: "family", label: t("familyTotal"), amount: total.family_total || 0 },
  ];
  els.content.innerHTML = `
    <section class="overview-grid">
      <div class="overview-panel">
        <h2>${t("allocation")}</h2>
        ${donut(
          rows,
          (row) => categoryLabel(row.category),
          (row) => row.amount,
        )}
      </div>
      <div class="overview-panel">
        <h2>${t("careVsFamily")}</h2>
        ${allocBars(
          careVsFamily,
          (row) => row.label,
          (row) => row.amount,
          (row) => `${money(row.amount)} · ${pct(total.expense_total ? (row.amount / total.expense_total) * 100 : 0)}`,
        )}
      </div>
    </section>
    <div class="table-wrap" style="margin-top:14px">
      <table>
        <thead><tr><th>${t("category")}</th><th>${t("amount")}</th><th>${t("pctOfExpense")}</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr><td class="strong">${escapeHtml(categoryLabel(row.category))}</td><td class="num">${money(row.amount)}</td><td class="num">${pct(row.pct)}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const fundMeta = summary.fund || fund();
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("baseCurrency")}</dt><dd>${escapeHtml(summary.base_currency || "CNY")}</dd>
          <dt>${t("fundName")}</dt><dd>${escapeHtml(fundMeta.name || "")}</dd>
          <dt>${t("steward")}</dt><dd>${escapeHtml(fundMeta.steward || "")}</dd>
          <dt>${t("deviationThreshold")}</dt><dd>${escapeHtml(String(summary.deviation_threshold_pct ?? 20))}%</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("beneficiaries")}</h2>
        ${
          (summary.beneficiaries || beneficiaries())
            .map(
              (b) => `
          <div class="settings-account">
            <strong>${escapeHtml(b.name)}</strong>
            <span>${escapeHtml(b.relation || "")}</span>
            <span>${t("pensionMonthly")} ${money(b.pension_monthly)}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("families")}</h2>
        ${
          (summary.families || families())
            .map(
              (f) => `
          <div class="settings-account">
            <strong>${escapeHtml(f.name)}</strong>
            <span>${escapeHtml(f.head || "")}</span>
            <span>${t("members")} ${escapeHtml(String(f.members_count || 0))}</span>
          </div>
        `,
            )
            .join("") || `<div class="empty">${t("setupNeeded")}</div>`
        }
      </section>
    </div>
  `;
}

function render() {
  renderShell();
  if (state.route.view === "family" && state.route.id) renderFamilyDetail();
  else if (state.route.view === "family") renderFamily();
  else if (state.route.view === "ledger") renderLedger();
  else if (state.route.view === "category") renderCategory();
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
els.monthSelect?.addEventListener("change", () => {
  state.month = els.monthSelect.value;
  render();
});
els.refresh.addEventListener("click", () => loadState());
els.mobileRefresh?.addEventListener("click", () => loadState());
els.language.value = state.lang;
els.language.addEventListener("change", () => {
  state.lang = normalizeLang(els.language.value);
  localStorage.setItem("kelly-family-fund-language", state.lang);
  render();
});

syncResponsiveShell();
loadState().catch((error) => {
  els.content.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
