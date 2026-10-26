import { appConfig } from "./config.js";
import { ruleSnapshot } from "./coverage.js";
import { cancelDialog, importDialog, projectDialog, requestDialog, ruleDialog, settingsDialog } from "./dialogs.js";
import { esc, filter, href, parse, ref, snapshotReport } from "./model.js";
import { getProvider, isDemo } from "./providers/index.js";
import { parseOpenApi, redact, validateCase, validateInventory, validateOrigin } from "./validation.js";
import { renderView } from "./views.js";
const state = {
  projects: [],
  endpoints: [],
  rules: [],
  runs: [],
  checks: [],
  evidence: [],
  findings: [],
  project: null,
  run: null,
  projectId: "",
  runId: "",
  revision: "",
  view: "overview",
  item: "",
  demo: isDemo(),
  loading: true,
  error: "",
  flash: "",
  summary: {},
  cursors: {},
  filters: {},
  pageDepth: {},
};
const content = document.getElementById("content");
const dialog = document.getElementById("actionDialog");
let provider;
let generation = 0;
let busy = false;
let dirty = false;
let previousHash = location.hash || "#/overview";
let dialogRules = null;
const notice = (message) => {
  const node = document.getElementById("notice");
  node.textContent = message;
  node.hidden = !message;
};
const route = () => {
  const [view, query] = (location.hash || "#/overview").slice(2).split("?");
  const params = new URLSearchParams(query);
  return {
    view: ["overview", "projects", "endpoints", "rules", "matrix", "findings", "runs", "settings"].includes(view)
      ? view
      : "overview",
    projectId: params.has("project") ? params.get("project") : state.projectId,
    runId: params.has("run")
      ? params.get("run")
      : params.has("project") && params.get("project") !== state.projectId
        ? ""
        : state.runId,
    item: params.get("item") || "",
  };
};
const render = () => {
  content.innerHTML = renderView(state);
  document.getElementById("attentionCount").textContent = String(state.summary.attention ?? "—");
  document.getElementById("projectCount").textContent = String(state.summary.projects ?? "—");
  document.getElementById("providerLabel").textContent = state.demo
    ? "演示 · 合成 API 与业务数据"
    : "Busabase · 本机 Agent 验证";
  for (const link of document.querySelectorAll("[data-nav]")) {
    link.classList.toggle("active", link.dataset.nav === state.view);
    link.href = href(state, link.dataset.nav, "", state.runId);
  }
};
const openDialog = ({ title, body }) => {
  document.getElementById("dialogTitle").textContent = title;
  document.getElementById("dialogBody").innerHTML = body;
  dirty = false;
  if (!dialog.open) dialog.showModal();
};
const closeDialog = () => {
  dialog.close();
  dirty = false;
  if (route().view === "settings") location.hash = previousHash;
};
const setPage = (key, page, preserve = false) => {
  if (preserve) {
    const fresh = new Map(page.records.map((row) => [row.id, row]));
    const ids = new Set(state[key].map((row) => row.id));
    state[key] = [
      ...page.records.filter((row) => !ids.has(row.id)),
      ...state[key].map((row) => fresh.get(row.id) || row),
    ];
    if ((state.pageDepth[key] || 1) === 1) state.cursors[key] = page.nextCursor;
  } else {
    state[key] = page.records;
    state.cursors[key] = page.nextCursor;
    state.pageDepth[key] = 1;
  }
};
const validateScope = (key, rows) => {
  if (key === "projects") return;
  for (const row of rows) {
    if (row.fields["project-reference"] !== state.projectId || ref(row.fields.project) !== state.projectId)
      throw new Error("记录不属于当前项目，已停止展示。请刷新并核对版本。");
    if (key !== "runs" && row.fields["source-revision"] !== state.revision)
      throw new Error("记录版本与当前任务不一致，已停止展示。");
    if (
      ["checks", "evidence", "findings"].includes(key) &&
      (row.fields["run-reference"] !== state.runId || ref(row.fields.run) !== state.runId)
    )
      throw new Error("记录不属于当前任务，已停止展示。");
  }
};
const page = async (key, filters, ticket, preserve) => {
  const result = await provider.page(key, { valueFilters: filters });
  if (ticket !== generation) return;
  validateScope(key, result.records);
  const same = JSON.stringify(filters) === JSON.stringify(state.filters[key]);
  setPage(key, result, preserve && same);
  state.filters[key] = filters;
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
        '<div class="empty-state"><h1>初始化应用审计工作台</h1><p>创建此应用声明的项目、接口、规则、任务、检查、发现与证据资源。</p><button class="button primary" data-action="initialize">初始化工作台</button></div>';
      return;
    }
    const projects = await provider.page("projects");
    if (ticket !== generation) return;
    setPage("projects", projects, quiet);
    state.filters.projects = [];
    if (!state.projectId) state.projectId = state.projects[0]?.id || "";
    state.project = state.projects.find((row) => row.id === state.projectId) || null;
    if (state.projectId && !state.project) {
      state.project = await provider.get("projects", state.projectId);
      if (ticket !== generation) return;
      state.projects.unshift(state.project);
    }
    state.revision = state.project?.fields["source-revision"] || "";
    state.run = null;
    if (state.projectId) {
      await page("runs", filter("project", state.projectId), ticket, quiet);
      if (ticket !== generation) return;
      if (!state.runId)
        state.runId = state.runs.find((row) => row.fields["source-revision"] === state.revision)?.id || "";
      if (state.runId) {
        state.run = state.runs.find((row) => row.id === state.runId) || (await provider.get("runs", state.runId));
        if (ticket !== generation) return;
        validateScope("runs", [state.run]);
        if (!state.runs.some((row) => row.id === state.run.id)) state.runs.unshift(state.run);
        state.revision = state.run.fields["source-revision"];
      }
      const versionFilters = [
        ...filter("project", state.projectId),
        { fieldSlug: "source-revision", operator: "eq", value: state.revision },
      ];
      await Promise.all([
        page("endpoints", versionFilters, ticket, quiet),
        page("rules", versionFilters, ticket, quiet),
      ]);
      if (ticket !== generation) return;
      if (state.runId) {
        const runFilters = [...filter("project", state.projectId), ...filter("run", state.runId)];
        await Promise.all([
          page("checks", runFilters, ticket, quiet),
          page("findings", runFilters, ticket, quiet),
          page("evidence", runFilters, ticket, quiet),
        ]);
      } else for (const key of ["checks", "findings", "evidence"]) setPage(key, { records: [], nextCursor: null });
    } else
      for (const key of ["runs", "endpoints", "rules", "checks", "findings", "evidence"])
        setPage(key, { records: [], nextCursor: null });
    const [summary, pending] = await Promise.all([
      provider.summary(state.projectId, state.revision),
      provider.pending(),
    ]);
    if (ticket !== generation) return;
    state.summary = summary;
    if (pending.count)
      notice(`${pending.count}${pending.nextCursor ? "+" : ""} 项任务变更等待原生 ChangeRequest 复核。`);
    state.loading = false;
    render();
  } catch (error) {
    if (ticket !== generation) return;
    state.loading = false;
    state.error = error instanceof Error ? error.message : "读取失败，请重试。";
    render();
  }
};
const outcomeNotice = async (outcome) => {
  if (state.demo) {
    notice("演示操作已保存到当前页面中的合成数据。");
    return;
  }
  const { airAppWriteMessage } = await import("../vendor/busabase-airapp.js");
  notice(airAppWriteMessage(outcome));
};
const requireSaved = async (outcome) => {
  if (outcome.status !== "saved" || !outcome.recordId) {
    await outcomeNotice(outcome);
    throw new Error("变更尚未合并；后续关联操作已停止。请在原生 ChangeRequest 完成复核后重试。");
  }
  return outcome;
};
const field = (values, key) => String(values.get(key) || "").trim();
const prepareRequest = async (finding = null) => {
  if (state.project) {
    const revision = state.project.fields["source-revision"];
    const result = await provider.page("rules", {
      valueFilters: [
        ...filter("project", state.projectId),
        { fieldSlug: "source-revision", operator: "eq", value: revision },
      ],
    });
    if (
      result.records.some(
        (row) =>
          row.fields["project-reference"] !== state.projectId ||
          ref(row.fields.project) !== state.projectId ||
          row.fields["source-revision"] !== revision,
      )
    )
      throw new Error("请求规则不属于当前项目版本。");
    dialogRules = result.records;
  } else dialogRules = [];
  openDialog(requestDialog({ ...state, rules: dialogRules }, finding));
};
const currentProject = () => {
  if (!state.project) throw new Error("请先添加并配置项目。");
  return state.project;
};
const importData = async (form, document) => {
  const project = currentProject();
  const revision = project.fields["source-revision"];
  const inventory =
    document.openapi || document.swagger
      ? parseOpenApi(document, { sourceRevision: revision })
      : validateInventory(document);
  if (inventory.sourceRevision !== revision) throw new Error("导入版本必须与项目当前版本相同。");
  const endpoints = new Map();
  for (const endpoint of inventory.endpoints) {
    const recordKey = `${project.id}:${revision}:${endpoint.key}`;
    const result = await requireSaved(
      await provider.create(
        "endpoints",
        {
          title: `${endpoint.method} ${endpoint.path}`,
          "record-key": recordKey,
          "project-reference": project.id,
          "source-revision": revision,
          method: endpoint.method,
          path: endpoint.path,
          "operation-id": endpoint.operationId,
          "business-flow": endpoint.flow,
          "source-location": endpoint.location,
          discovery: document.openapi || document.swagger ? "documented" : "manual",
          project: project.id,
        },
        recordKey,
      ),
    );
    endpoints.set(endpoint.key, await provider.get("endpoints", result.recordId));
  }
  for (const rule of inventory.rules) {
    const endpoint = endpoints.get(rule.endpointKey);
    await requireSaved(await saveRule(rule, endpoint));
  }
  state.runId = "";
  return { status: "saved" };
};
const saveRule = (rule, endpoint) => {
  const project = currentProject();
  const recordKey = `${project.id}:${project.fields["source-revision"]}:${rule.key}`;
  return provider.create(
    "rules",
    {
      title: `${rule.identity} · ${endpoint.fields.title} · ${rule.expectation === "allow" ? "应允许" : "应拒绝"}`,
      "record-key": recordKey,
      "project-reference": project.id,
      "endpoint-reference": endpoint.id,
      "source-revision": project.fields["source-revision"],
      identity: rule.identity,
      expectation: rule.expectation,
      "expected-statuses": rule.expectedStatuses,
      assertions: rule.assertions,
      "forbidden-assertions": rule.forbiddenAssertions,
      "object-id": rule.objectId,
      "request-body": rule.requestBody,
      "baseline-rule-key": rule.baselineRuleKey,
      "policy-note": rule.policyNote,
      confirmed: rule.confirmed,
      mutating: rule.mutating,
      project: project.id,
      endpoint: endpoint.id,
    },
    recordKey,
  );
};
const submit = async (form, submitter) => {
  if (busy) return;
  busy = true;
  const buttons = [...form.querySelectorAll("button")];
  for (const button of buttons) button.disabled = true;
  const values = new FormData(form);
  try {
    let outcome;
    const intent = (form.dataset.intent ||= crypto.randomUUID());
    if (form.id === "projectForm") {
      const origin = field(values, "origin");
      const fields = {
        title: field(values, "title"),
        owner: field(values, "owner"),
        "repository-reference": field(values, "repository-reference"),
        "source-revision": field(values, "source-revision"),
        environment: field(values, "environment"),
        ...(origin ? { origin: validateOrigin(origin) } : {}),
        "scope-note": field(values, "scope-note"),
        "onboarding-version": 1,
        "onboarding-state": "complete",
        "is-example": false,
      };
      if (!fields.title || !fields.owner || !fields["source-revision"] || !fields.environment || !fields["scope-note"])
        throw new Error("请填写负责人、版本、环境和业务授权边界。");
      outcome = form.dataset.record
        ? await provider.update("projects", await provider.get("projects", form.dataset.record), fields)
        : await provider.create("projects", fields, intent);
      if (outcome.status === "saved") {
        state.projectId = outcome.recordId || form.dataset.record;
        state.runId = "";
        state.item = "";
      }
    } else if (form.id === "importForm") {
      if (field(values, "document").length > 1048576) throw new Error("导入文件最多 1 MiB。");
      outcome = await importData(form, JSON.parse(field(values, "document")));
    } else if (form.id === "ruleForm") {
      const endpoint = state.endpoints.find((row) => row.id === field(values, "endpoint"));
      if (!endpoint || endpoint.fields["source-revision"] !== currentProject().fields["source-revision"])
        throw new Error("请先加载项目当前版本的接口。");
      const rule = validateCase({
        key: field(values, "key"),
        endpointKey: "manual-endpoint",
        identity: field(values, "identity"),
        expectation: field(values, "expectation"),
        expectedStatuses: field(values, "statuses").split(",").map(Number),
        assertions: JSON.parse(field(values, "assertions") || "[]"),
        forbiddenAssertions: JSON.parse(field(values, "forbidden") || "[]"),
        objectId: field(values, "object-id"),
        requestBody: JSON.parse(field(values, "request-body") || "null"),
        baselineRuleKey: field(values, "baseline"),
        policyNote: field(values, "policy-note"),
        confirmed: values.has("confirmed"),
        mutating: values.has("mutating"),
      });
      if (!["GET", "HEAD", "OPTIONS"].includes(endpoint.fields.method) && !rule.mutating)
        throw new Error("非读取方法必须明确声明会改变状态。");
      if (
        rule.baselineRuleKey &&
        !state.rules.some(
          (row) =>
            row.fields["record-key"].split(":").at(-1) === rule.baselineRuleKey && row.fields.expectation === "allow",
        )
      )
        throw new Error("请先创建同版本的正向基线规则。");
      outcome = await saveRule(rule, endpoint);
    } else if (form.id === "requestForm") {
      const project = currentProject();
      const ids = values.getAll("rules").map(String);
      const mode = field(values, "mode");
      const rules = ids.map((id) => (dialogRules || state.rules).find((row) => row.id === id));
      if (
        rules.some((row) => !row || row.fields["source-revision"] !== project.fields["source-revision"]) ||
        ids.length > 50 ||
        (mode === "dynamic" && !ids.length)
      )
        throw new Error("动态任务需选择当前版本 1–50 条规则。");
      if (mode === "dynamic" && new Set(rules.map((row) => ref(row.fields.endpoint))).size > 5)
        throw new Error("首版每个动态任务最多 5 个端点。");
      if (mode === "dynamic" && !project.fields.origin) throw new Error("请先配置明确的测试 Origin。");
      if (mode === "dynamic" && !state.demo && project.fields["is-example"])
        throw new Error("请先建立实际项目；示例不能执行动态请求。");
      for (const row of rules) {
        const baseline = row.fields["baseline-rule-key"];
        if (
          baseline &&
          !rules.some(
            (other) =>
              other.fields["record-key"].split(":").at(-1) === baseline && other.fields.expectation === "allow",
          )
        )
          throw new Error("需要把拒绝规则的正向基线一起选入任务。");
      }
      const finding = form.dataset.finding ? state.findings.find((row) => row.id === form.dataset.finding) : null;
      if (finding && finding.fields["source-revision"] === project.fields["source-revision"])
        throw new Error("复测需指定新的修复版本。");
      outcome = await provider.create(
        "runs",
        {
          title: `${project.fields.title} · ${finding ? "修复复测" : "应用审计"}`,
          "project-reference": project.id,
          "source-revision": project.fields["source-revision"],
          environment: project.fields.environment,
          ...(project.fields.origin ? { origin: project.fields.origin } : {}),
          "scope-reference": field(values, "scope-reference"),
          "rule-snapshot": await Promise.all(
            rules.map(async (row) => {
              const endpoint = await provider.get("endpoints", ref(row.fields.endpoint));
              if (
                endpoint.fields["project-reference"] !== project.id ||
                ref(endpoint.fields.project) !== project.id ||
                endpoint.fields["source-revision"] !== project.fields["source-revision"]
              )
                throw new Error("接口不属于当前项目版本。");
              return ruleSnapshot(row, endpoint);
            }),
          ),
          mode,
          status: "requested",
          "requested-at": new Date().toISOString(),
          "request-count": 0,
          ...(finding ? { "retest-finding-reference": finding.id } : {}),
          project: project.id,
        },
        intent,
      );
      if (finding && outcome.status === "saved") {
        await requireSaved(outcome);
        await requireSaved(
          await provider.update("findings", finding, {
            "fixed-revision": project.fields["source-revision"],
            "retest-run-reference": outcome.recordId,
            remediation: "ready-for-retest",
          }),
        );
      }
      if (outcome.status === "saved") {
        state.runId = outcome.recordId;
        state.view = "matrix";
        state.item = "";
      }
    } else if (form.id === "reviewForm") {
      const row = state.findings.find((item) => item.id === form.dataset.record);
      const verdict = submitter?.value;
      const note = field(values, "review-note");
      if (!row || !note || !["explained-benign", "needs-investigation", "confirmed-vulnerability"].includes(verdict))
        throw new Error("请填写复核理由并选择结论。");
      outcome = await provider.update("findings", row, {
        verdict,
        "review-note": redact(note),
        "reviewed-at": new Date().toISOString(),
        owner: field(values, "owner"),
      });
      if (outcome.status === "saved") state.flash = row.id;
    } else if (form.id === "cancelForm") {
      const row = state.runs.find((item) => item.id === form.dataset.record);
      if (!row || !["requested", "running"].includes(row.fields.status)) throw new Error("任务状态已经改变，请刷新。");
      outcome = await provider.update("runs", row, { status: "cancelled" });
    }
    if (outcome) await outcomeNotice(outcome);
    dirty = false;
    closeDialog();
    history.replaceState(null, "", href(state, state.view, state.item));
    await load({ quiet: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败，请重试。";
    const field = dialog.open ? document.getElementById("dialogError") : null;
    if (field) field.textContent = message;
    else notice(message);
  } finally {
    busy = false;
    for (const button of buttons) button.disabled = false;
  }
};
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (
    !(form instanceof HTMLFormElement) ||
    !["projectForm", "importForm", "ruleForm", "requestForm", "reviewForm", "cancelForm"].includes(form.id)
  )
    return;
  event.preventDefault();
  void submit(form, event.submitter);
});
document.addEventListener("input", (event) => {
  if (event.target.closest("form")) dirty = true;
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === "projectSelect") location.hash = href({ ...state, projectId: target.value, runId: "" }, state.view);
  if (target.id === "runSelect") location.hash = href(state, state.view, "", target.value);
});
document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "sidebar") {
    if (matchMedia("(max-width:720px)").matches) {
      document.body.classList.toggle("sidebar-open");
      document.querySelector(".sidebar-scrim").hidden = !document.body.classList.contains("sidebar-open");
    } else document.body.classList.toggle("sidebar-collapsed");
  } else if (action === "close-dialog") closeDialog();
  else if (action === "project") openDialog(projectDialog());
  else if (action === "project-settings") openDialog(projectDialog(state.project));
  else if (action === "import") {
    if (state.project) openDialog(importDialog(state));
    else openDialog(projectDialog());
  } else if (action === "rule") {
    if (state.endpoints.length) openDialog(ruleDialog(state));
    else notice("请先导入当前项目版本的接口。");
  } else if (action === "request") {
    try {
      await prepareRequest();
    } catch (error) {
      notice(error instanceof Error ? error.message : "任务读取失败。");
    }
  } else if (action === "refresh") await load();
  else if (action === "initialize") {
    target.disabled = true;
    try {
      await provider.initialize();
      await load();
    } catch (error) {
      notice(error instanceof Error ? error.message : "初始化失败。");
      target.disabled = false;
    }
  } else if (action === "export") {
    const blob = new Blob([redact(snapshotReport(state))], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "appsec-loaded-page.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (target.dataset.cancel) {
    const row = state.runs.find((item) => item.id === target.dataset.cancel);
    if (row) openDialog(cancelDialog(row));
  }
  if (target.dataset.retest) {
    const row = state.findings.find((item) => item.id === target.dataset.retest);
    if (row) {
      try {
        await prepareRequest(row);
      } catch (error) {
        notice(error instanceof Error ? error.message : "复测规则读取失败。");
      }
    }
  }
  if (target.dataset.tab) {
    for (const panel of dialog.querySelectorAll("[data-panel]"))
      panel.hidden = panel.dataset.panel !== target.dataset.tab;
    for (const tab of dialog.querySelectorAll("[data-tab]")) tab.setAttribute("aria-selected", String(tab === target));
  }
  if (target.dataset.more && !busy) {
    const key = target.dataset.more;
    const ticket = generation;
    busy = true;
    target.disabled = true;
    try {
      const result = await provider.page(key, { cursor: state.cursors[key], valueFilters: state.filters[key] });
      if (ticket !== generation) return;
      validateScope(key, result.records);
      const ids = new Set(state[key].map((row) => row.id));
      state[key].push(...result.records.filter((row) => !ids.has(row.id)));
      state.cursors[key] = result.nextCursor;
      state.pageDepth[key] = (state.pageDepth[key] || 1) + 1;
      render();
    } catch (error) {
      notice(error instanceof Error ? error.message : "读取下一页失败。");
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
  if (dirty) {
    notice("编辑内容已保留；请先保存，或关闭编辑窗口后再切换页面。");
    history.replaceState(null, "", previousHash);
    return;
  }
  previousHash = location.hash || "#/overview";
  if (dialog.open) dialog.close();
  const changed = next.projectId !== state.projectId || next.runId !== state.runId;
  Object.assign(state, next);
  if (changed) await load();
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
    const gate = createAirAppConnectGate({
      appName: appConfig.appName,
      shouldGate: () => !isDemo() && shouldUseLocalGateway(runtime),
      demoHref: "?demo=1",
      onProvision: () => provider.initialize(),
    });
    if (await gate.pass({ onReady: () => load() })) await load();
  } else await load();
  if (route().view === "settings") openDialog(settingsDialog(state));
} catch (error) {
  state.loading = false;
  state.error = error instanceof Error ? error.message : "连接失败。";
  render();
}
setInterval(() => {
  if (
    provider &&
    !busy &&
    !dirty &&
    !dialog.open &&
    !["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName)
  )
    void load({ quiet: true });
}, 8000);
