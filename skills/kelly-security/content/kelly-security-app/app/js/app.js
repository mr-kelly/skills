import { appConfig } from "./config.js";
import { cancelDialog, hostDialog, requestDialog, settingsDialog } from "./dialogs.js";
import { esc, ref, runFilters, snapshotReport, validAlias } from "./model.js";
import { getProvider, isDemo } from "./providers/index.js";
import { renderView } from "./views.js";

const state = {
  hosts: [],
  runs: [],
  checks: [],
  evidence: [],
  findings: [],
  settings: [],
  summary: {},
  cursors: {},
  filters: {},
  pageDepth: {},
  selected: new Set(),
  view: "overview",
  runId: "",
  item: "",
  batch: "",
  demo: isDemo(),
  loading: true,
  error: "",
  flash: "",
};
const content = document.getElementById("content");
const dialog = document.getElementById("actionDialog");
let provider;
let gate;
let generation = 0;
let busy = false;
let requestIntent;
let previousHash = "#/overview";

const notice = (message) => {
  const element = document.getElementById("notice");
  element.textContent = message;
  element.hidden = !message;
};
const route = () => {
  const [path, query] = (location.hash || "#/overview").slice(2).split("?");
  const params = new URLSearchParams(query);
  return {
    view: ["overview", "hosts", "runs", "checklist", "timeline", "findings", "settings"].includes(path)
      ? path
      : "overview",
    runId: params.get("run") || state.runId,
    item: params.get("item") || "",
  };
};
const render = () => {
  content.innerHTML = renderView(state);
  document.getElementById("attentionCount").textContent = String(state.summary.attention ?? "—");
  document.getElementById("hostCount").textContent = String(state.summary.hosts ?? "—");
  document.getElementById("providerLabel").textContent = state.demo
    ? "演示 · 不连接服务器"
    : "Busabase · 本机 Agent 执行";
  document
    .querySelectorAll("[data-nav]")
    .forEach((element) => element.classList.toggle("active", element.getAttribute("data-nav") === state.view));
};
const openDialog = ({ title, body }) => {
  document.getElementById("dialogTitle").textContent = title;
  document.getElementById("dialogBody").innerHTML = body;
  if (!dialog.open) dialog.showModal();
};
const closeDialog = () => {
  dialog.close();
  if (route().view === "settings") location.hash = previousHash;
};
const setPage = (key, page, preserve = false) => {
  if (preserve) {
    const fresh = new Map(page.records.map((row) => [row.id, row]));
    const previousIds = new Set(state[key].map((row) => row.id));
    state[key] = [
      ...page.records.filter((row) => !previousIds.has(row.id)),
      ...state[key].map((row) => fresh.get(row.id) || row),
    ];
    if ((state.pageDepth[key] || 1) === 1) state.cursors[key] = page.nextCursor;
  } else {
    state[key] = page.records;
    state.cursors[key] = page.nextCursor;
    state.pageDepth[key] = 1;
  }
};

const loadEvidence = async (ticket, preserve = false) => {
  const checkIds = state.checks.map((row) => row.id);
  const filters = [{ any: checkIds.map((id) => ({ fieldSlug: "check-reference", operator: "eq", value: id })) }];
  const same = JSON.stringify(filters) === JSON.stringify(state.filters.evidence);
  state.filters.evidence = filters;
  if (!checkIds.length) {
    setPage("evidence", { records: [], nextCursor: null });
    return;
  }
  const evidence = await provider.page("evidence", { valueFilters: filters });
  if (ticket !== generation) return;
  if (evidence.records.some((row) => !checkIds.includes(ref(row.fields.check))))
    throw new Error("证据来源与当前检查不匹配，请重试。");
  setPage("evidence", evidence, preserve && same);
};

const loadRun = async (ticket, preserve = false) => {
  if (!state.runId) {
    state.checks = [];
    state.evidence = [];
    state.findings = [];
    return;
  }
  let run = state.runs.find((row) => row.id === state.runId);
  if (!run) {
    run = await provider.get("runs", state.runId);
    if (ticket !== generation) return;
    state.runs.unshift(run);
  }
  const hostId = ref(run.fields.host);
  if (hostId && !state.hosts.some((row) => row.id === hostId)) {
    const host = await provider.get("hosts", hostId);
    if (ticket !== generation) return;
    state.hosts.push(host);
  }
  state.batch = String(run.fields["batch-reference"] || "");
  const group = state.batch ? state.runs.filter((row) => row.fields["batch-reference"] === state.batch) : [run];
  const runIds = new Set(group.map((row) => row.id));
  const filters = [{ any: [...runIds].map((id) => runFilters(id)[0]) }];
  const [checks, findings] = await Promise.all([
    provider.page("checks", { valueFilters: filters }),
    provider.page("findings", { valueFilters: filters }),
  ]);
  if (ticket !== generation) return;
  if ([...checks.records, ...findings.records].some((row) => !runIds.has(ref(row.fields.run))))
    throw new Error("服务端未按选定任务过滤结果，请检查服务器版本；没有展示可能混淆的记录。");
  const same = JSON.stringify(filters) === JSON.stringify(state.filters.checks);
  setPage("checks", checks, preserve && same);
  setPage("findings", findings, preserve && same);
  state.filters.checks = filters;
  state.filters.findings = filters;
  await loadEvidence(ticket, preserve);
};

const load = async ({ quiet = false } = {}) => {
  const ticket = ++generation;
  state.error = "";
  if (!quiet) {
    state.loading = true;
    render();
  }
  try {
    const ready = await provider.ready();
    if (ticket !== generation) return;
    if (!ready.ok) {
      state.loading = false;
      content.innerHTML =
        '<div class="empty-state"><h1>初始化核查工作台</h1><p>为此应用创建独立的服务器、任务、检查、证据、发现与设置资源。</p><button class="button primary" data-action="initialize">初始化工作台</button></div>';
      return;
    }
    const [hosts, runs, settings, summary, pending] = await Promise.all([
      provider.page("hosts"),
      provider.page("runs", { sort: { fieldSlug: "requested-at", direction: "desc" } }),
      provider.page("settings"),
      provider.summary().catch(() => ({})),
      provider.pending().catch(() => ({ count: null, nextCursor: null })),
    ]);
    if (ticket !== generation) return;
    setPage("hosts", hosts, quiet);
    setPage("runs", runs, quiet);
    setPage("settings", settings);
    state.summary = summary;
    if (pending.count)
      notice(`${pending.count}${pending.nextCursor ? "+" : ""} 项更改正在等待工作区审核；待审核的检查请求尚不能执行。`);
    state.runId = route().runId || runs.records[0]?.id || "";
    await loadRun(ticket, quiet);
    if (ticket !== generation) return;
    state.loading = false;
    render();
  } catch (error) {
    if (ticket !== generation) return;
    state.loading = false;
    state.error = error instanceof Error ? error.message : "数据读取失败，请重试。";
    render();
  }
};
const outcomeNotice = async (outcome) => {
  if (state.demo) notice("演示：操作已在当前页面生效，没有写入 Busabase 或连接服务器。");
  else {
    const { airAppWriteMessage } = await import("../vendor/busabase-airapp.js");
    notice(airAppWriteMessage(outcome, { locale: "zh-CN" }));
  }
};
const submit = async (form, submitter) => {
  if (busy) return;
  busy = true;
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  const values = new FormData(form);
  try {
    let outcome;
    if (form.id === "hostForm") {
      const alias = String(values.get("ssh-alias") || "").trim();
      if (!validAlias(alias)) throw new Error("SSH 别名只能包含字母、数字、点、短横线和下划线；不能填写命令。");
      outcome = await provider.create(
        "hosts",
        {
          title: String(values.get("title")).trim(),
          "ssh-alias": alias,
          role: String(values.get("role") || ""),
          "scope-note": String(values.get("scope-note")),
          summary: "unassessed",
          "is-example": false,
        },
        (form.dataset.intent ||= crypto.randomUUID()),
      );
    } else if (form.id === "requestForm") {
      const ids = values.getAll("hosts").map(String);
      if (!ids.length) throw new Error("请至少选择一台已获授权的服务器。");
      const start = new Date(String(values.get("since")));
      const end = new Date(String(values.get("until")));
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end)
        throw new Error("请检查调查开始和结束时间。");
      requestIntent ||= { id: crypto.randomUUID(), done: new Set() };
      const outcomes = [];
      for (const id of ids) {
        if (requestIntent.done.has(id)) continue;
        const host = state.hosts.find((row) => row.id === id);
        if (!host || (!state.demo && host.fields["is-example"])) throw new Error("示例服务器不能执行检查。");
        const result = await provider.create(
          "runs",
          {
            title: `${host.fields.title} · 入侵核查`,
            host: id,
            "scope-reference": String(values.get("scope-reference")).trim(),
            "window-start": start.toISOString(),
            "window-end": end.toISOString(),
            "check-profile": "intrusion-triage",
            status: "requested",
            "requested-at": new Date().toISOString(),
            "batch-reference": requestIntent.id,
          },
          `${requestIntent.id}:${id}`,
        );
        requestIntent.done.add(id);
        outcomes.push(result);
      }
      outcome = outcomes.find((result) => result.status === "queued") || outcomes.at(-1) || { status: "saved" };
    } else if (form.id === "settingsForm") {
      const fields = {
        title: "核查配置",
        operator: String(values.get("operator")).trim(),
        "scope-note": String(values.get("scope-note")).trim(),
        "evidence-policy": String(values.get("evidence-policy")).trim(),
        "execution-mode": "local-agent",
        "onboarding-version": 1,
        "onboarding-state": "complete",
        "onboarding-completed-at": new Date().toISOString(),
      };
      if (!fields.operator || !fields["scope-note"] || !fields["evidence-policy"])
        throw new Error("请填写调查负责人、授权说明和证据处理规则。");
      outcome = state.settings[0]
        ? await provider.update("settings", state.settings[0], fields)
        : await provider.create("settings", fields, "kelly-security-onboarding-v1");
    } else if (form.id === "reviewForm") {
      const row = state.findings.find((item) => item.id === form.dataset.record);
      const verdict = submitter?.value;
      const note = String(values.get("review-note") || "").trim();
      if (!row || !["explained-benign", "needs-investigation", "confirmed-malicious"].includes(verdict) || !note)
        throw new Error("请选择复核结论并填写理由。");
      outcome = await provider.update("findings", row, {
        verdict,
        "review-note": note,
        "reviewed-at": new Date().toISOString(),
      });
      if (outcome.status === "saved") state.flash = row.id;
    } else if (form.id === "cancelForm") {
      const row = state.runs.find((item) => item.id === form.dataset.record);
      if (!row || !["requested", "running"].includes(row.fields.status))
        throw new Error("此任务不在可停止的状态，请刷新。");
      outcome = await provider.update("runs", row, { status: "cancelled" });
    }
    if (outcome) await outcomeNotice(outcome);
    closeDialog();
    await load({ quiet: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败，请重试。";
    const field = dialog.open ? document.getElementById("dialogError") : null;
    if (field) field.textContent = message;
    else notice(message);
  } finally {
    busy = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (
    !(form instanceof HTMLFormElement) ||
    !["hostForm", "requestForm", "settingsForm", "reviewForm", "cancelForm"].includes(form.id)
  )
    return;
  event.preventDefault();
  void submit(form, event.submitter);
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.host) {
    target.checked ? state.selected.add(target.dataset.host) : state.selected.delete(target.dataset.host);
  }
  if (target.id === "runSelect") location.hash = `#/${state.view}?run=${encodeURIComponent(target.value)}`;
});
document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, [data-host-runs]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "sidebar") {
    if (matchMedia("(max-width:720px)").matches) {
      document.body.classList.toggle("sidebar-open");
      document.querySelector(".sidebar-scrim").hidden = !document.body.classList.contains("sidebar-open");
    } else document.body.classList.toggle("sidebar-collapsed");
  } else if (action === "close-dialog") closeDialog();
  else if (action === "open-settings") {
    closeDialog();
    location.hash = "#/settings";
  } else if (action === "add-host") openDialog(hostDialog());
  else if (action === "request") {
    requestIntent = null;
    openDialog(requestDialog(state));
  } else if (action === "refresh") await load();
  else if (action === "initialize") {
    target.disabled = true;
    try {
      await provider.initialize();
      await load();
    } catch (error) {
      notice(error instanceof Error ? error.message : "初始化失败");
      target.disabled = false;
    }
  } else if (action === "export") {
    const blob = new Blob([snapshotReport(state)], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "linux-investigation-loaded-page.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (target.dataset.cancel) {
    const row = state.runs.find((item) => item.id === target.dataset.cancel);
    if (row) openDialog(cancelDialog(row));
  }
  if (target.dataset.hostRuns) {
    const run = state.runs.find((row) => ref(row.fields.host) === target.dataset.hostRuns);
    if (run) location.hash = `#/checklist?run=${encodeURIComponent(run.id)}`;
    else notice("这台服务器尚无已加载任务，请发起检查或加载更多任务。");
  }
  if (target.dataset.tab) {
    dialog.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== target.dataset.tab;
    });
    dialog.querySelectorAll("[data-tab]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === target)));
  }
  if (target.dataset.more && !busy) {
    busy = true;
    target.disabled = true;
    const key = target.dataset.more;
    try {
      const page = await provider.page(key, { cursor: state.cursors[key], valueFilters: state.filters[key] });
      const ids = new Set(state[key].map((row) => row.id));
      state[key].push(...page.records.filter((row) => !ids.has(row.id)));
      state.cursors[key] = page.nextCursor;
      state.pageDepth[key] = (state.pageDepth[key] || 1) + 1;
      if (key === "checks") await loadEvidence(generation);
      render();
    } catch {
      notice("读取下一页失败，请重试。");
    } finally {
      busy = false;
      target.disabled = false;
    }
  }
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
window.addEventListener("hashchange", async () => {
  document.body.classList.remove("sidebar-open");
  document.querySelector(".sidebar-scrim").hidden = true;
  const next = route();
  if (next.view === "settings") {
    openDialog(settingsDialog(state));
    return;
  }
  previousHash = location.hash || "#/overview";
  if (dialog.open) dialog.close();
  const changedRun = next.runId !== state.runId;
  Object.assign(state, next);
  if (changedRun) await load();
  else render();
});

document.getElementById("demoBanner").hidden = !state.demo;
Object.assign(state, route());
try {
  provider = await getProvider();
  if (!state.demo) {
    const { getRuntime, shouldUseLocalGateway } = await import("./runtime.js");
    const { createAirAppConnectGate } = await import("../vendor/busabase-airapp-gate.js");
    const runtime = await getRuntime();
    gate = createAirAppConnectGate({
      appName: "Kelly Security",
      shouldGate: () => !isDemo() && shouldUseLocalGateway(runtime),
      demoHref: "?demo=1",
      onProvision: () => provider.initialize(),
    });
    if (await gate.pass({ onReady: () => load() })) await load();
  } else await load();
  if (route().view === "settings") openDialog(settingsDialog(state));
} catch (error) {
  state.loading = false;
  state.error = error instanceof Error ? error.message : "连接失败";
  render();
}
setInterval(() => {
  if (provider && !busy && !dialog.open && !["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName))
    void load({ quiet: true });
}, 8000);
