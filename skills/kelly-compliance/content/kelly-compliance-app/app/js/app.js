import { appConfig } from "./config.js";
import { FRAMEWORK, controlReadiness, evaluateEvidence, exceptionState, lines, programReady, ref } from "./domain.js";
import { normalizeReport } from "./imports.js";
import { labels, m } from "./messages.js";
import { getProvider, isDemo } from "./providers/index.js";
import {
  addEvidence,
  createException,
  importReport,
  initializeControls,
  programFilter,
  requireOwned,
  resolveIssue,
  reviewEvidenceLink,
} from "./service.js";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const date = (v) => (v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "尚未登记");
const status = (v) => `<span class="status ${esc(v)}">${esc(labels[v] || v)}</span>`;
const button = (action, label, extra = "", primary = false) =>
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${label}</button>`;
const route = () => {
  const [view, query] = (location.hash || "#/overview").slice(2).split("?");
  const q = new URLSearchParams(query);
  return {
    view: Object.keys(m).includes(view) ? view : "overview",
    program: q.get("program") || "",
    id: q.get("id") || "",
  };
};
const state = {
  programs: [],
  rows: {},
  cursors: {},
  pageDepth: {},
  programId: "",
  view: "overview",
  id: "",
  loading: true,
};
let provider;
let busy = false;
let generation = 0;
let priorHash = "#/overview";
const href = (view, id = "") => `#/${view}?${new URLSearchParams({ program: state.programId, ...(id ? { id } : {}) })}`;
const program = () => state.programs.find((row) => row.id === state.programId);
const rows = (key) => state.rows[key] || [];
const selected = (key) => rows(key).find((row) => row.id === state.id);
const notice = (text) => {
  $("notice").textContent = text;
  $("notice").hidden = !text;
};
const close = () => {
  $("actionDialog").close();
  if (route().view === "settings") location.hash = priorHash;
};
const dialog = (title, body) => {
  $("dialogTitle").textContent = title;
  $("dialogBody").innerHTML = body;
  $("actionDialog").showModal();
};
const field = (name, label, value = "", type = "text", required = true) =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
const area = (name, label, value = "", required = true) =>
  `<label class="full">${esc(label)}<textarea name="${name}" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
const select = (name, label, options, value = "") =>
  `<label>${esc(label)}<select name="${name}" required>${options.map(([id, title]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label>`;
const footer = (label = "保存并复核") =>
  `<p id="formError" class="full form-error" role="alert"></p><div class="actions full">${button("close-dialog", "取消")}<button class="button primary" type="submit">${label}</button></div>`;
const form = (id, body) => `<form id="${id}" class="form-grid">${body}${footer()}</form>`;
const options = (key) => rows(key).map((row) => [row.id, row.fields.title]);
const isoInput = (value) => new Date(value).toISOString();
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const data = (pairs) =>
  `<dl class="detail-data">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || "尚未登记")}</dd>`).join("")}</dl>`;
const next = (key) =>
  state.cursors[key] ? `<div class="more-row">${button("more", m.more, `data-key="${key}"`)}</div>` : "";
const empty = (copy = m.empty) => `<div class="empty-slim">${copy}</div>`;
const readiness = (control) => controlReadiness(program(), control, rows("evidence"), rows("evidence-links"));
const recordList = (key, subtitle, statusOf = (r) => r.fields.status) =>
  `${
    rows(key)
      .map(
        (row) =>
          `<a class="record-item ${row.id === state.id ? "active" : ""}" href="${href(state.view, row.id)}"><div class="row"><h3>${esc(row.fields.title)}</h3>${statusOf(row) ? status(statusOf(row)) : ""}</div><p>${esc(subtitle(row))}</p></a>`,
      )
      .join("") || empty()
  }${next(key)}`;
const shellDetail = (body) =>
  `<div class="record-detail"><a class="button mobile-back" href="${href(state.view)}">← 返回列表</a>${body}</div>`;
const split = (list, detail) =>
  `<div class="split-workspace ${state.id ? "has-selection" : ""}"><div class="record-list">${list}</div>${shellDetail(detail || empty(m.emptyDetail))}</div>`;
const header = (title, description, actions = "") =>
  `<div class="workspace-heading"><div><span class="eyebrow">SAAS / CLOUD / READINESS</span><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
const coverage = (e) =>
  e.fields["evidence-mode"] === "period"
    ? `${date(e.fields["coverage-start"])} → ${date(e.fields["coverage-end"])}`
    : `快照 · ${date(e.fields["observed-at"])}`;
const mappings = (control) =>
  rows("evidence-links")
    .filter((link) => ref(link.fields.control) === control.id)
    .map((link) => {
      const e = rows("evidence").find((r) => r.id === ref(link.fields.evidence));
      if (!e) return `<div class="mapping">${status("insufficient")} 证据尚未加载或无权限</div>`;
      const evaluation = evaluateEvidence(program(), control, e, link);
      return `<div class="mapping"><a href="${href("evidence", e.id)}"><strong>${esc(e.fields.title)}</strong></a><p>${esc(e.fields["requirement-key"])} · ${esc(coverage(e))}</p>${status(evaluation.state)}<p>${esc(evaluation.reason)}</p><p>${esc(link.fields["review-note"] || "尚无复核理由")}</p>${button("review", "复核此映射", `data-id="${esc(link.id)}"`)}</div>`;
    })
    .join("") || empty("还没有映射。为每个独立维度登记证据后，再人工判断适用性。");
const viewOverview = () => {
  const p = program();
  const f = p.fields;
  const controls = rows("controls");
  const support = controls.filter((c) => readiness(c).state === "supported").length;
  const open = rows("issues").filter((r) => r.fields.status !== "closed");
  const pending = rows("evidence-links").filter((r) => r.fields["review-state"] === "pending").length;
  return `<section class="compliance-hero"><div><span class="eyebrow">COMPLIANCE IS A PRACTICE.</span><h1>证据有边界，<br>准备才有底气。</h1><p class="lead">把云安全基线、真实期间证据和负责人的下一步，放在同一张工作台上。</p><div class="actions">${button("import", m.import, "", true)}${button("manual", m.manual)}${button("initialize", m.initialize)}</div></div><aside class="scope-card"><span class="eyebrow">SCOPE / VERSION ${esc(f["scope-version"])}</span><h2>${esc(f.title)}</h2>${data(
    [
      ["负责人", f.owner],
      ["账户 / 区域", `${lines(f.accounts).join("、")} / ${lines(f.regions).join("、")}`],
      ["声明期间", `${date(f["period-start"])} → ${date(f["period-end"])}`],
      ["框架", f["framework-version"]],
      ["授权引用", f["scope-reference"]],
    ],
  )}</aside></section><div class="stat-grid"><article class="stat"><span class="eyebrow">控制维度完整</span><strong>${support}<small> / ${controls.length}</small></strong><small>当前已加载控制；逐项复核后计算</small></article><article class="stat"><span class="eyebrow">需要负责人处理</span><strong>${open.length}</strong><small>当前已加载未关闭缺口</small></article><article class="stat"><span class="eyebrow">映射等待复核</span><strong>${pending}</strong><small>同一材料在不同控制中独立判断</small></article></div><div class="overview-bottom"><section class="panel"><div class="section-heading"><h2>优先解决的缺口</h2><a href="${href("issues")}">查看全部 ↗</a></div>${
    open
      .slice(0, 3)
      .map(
        (r) =>
          `<a class="timeline-line" href="${href("issues", r.id)}">${status(r.fields.severity)}<strong>${esc(r.fields.title)}</strong><span class="muted-note">${esc(r.fields.owner)} · 到期 ${date(r.fields["due-at"])}</span></a>`,
      )
      .join("") || empty("暂无已加载缺口；缺少的检查仍需确认。")
  }</section><section class="panel"><span class="eyebrow">POINT ≠ PERIOD</span><h2>${m.coverage}</h2><p class="muted-note">${m.coverageHelp}</p><div class="callout">备份成功 ≠ 恢复演练。<br>当前身份清单 ≠ 整季访问复核。<br>风险接受 ≠ 技术检查通过。</div><a class="button" href="${href("controls")}">逐项核对证据维度 ↗</a></section></div><p class="muted-note">${m.notice} 当前统计仅包含各类已加载记录；需要更多时可在对应列表再加载一页。</p>`;
};
const viewControls = () => {
  const c = selected("controls");
  const r = c ? readiness(c) : null;
  return (
    header(
      m.controls,
      "每项控制都有明确的证据维度、适用范围、负责人和频率。",
      button("initialize", m.initialize) + button("manual", m.manual),
    ) +
    split(
      recordList(
        "controls",
        (row) => `${row.fields.owner} · ${lines(row.fields["evidence-requirements"]).length} 个独立证据维度`,
        (row) => readiness(row).state,
      ),
      c
        ? `<span class="eyebrow">${esc(c.fields["control-key"])} / ${esc(c.fields.kind)}</span><h2>${esc(c.fields.title)}</h2>${status(r.state)}<p>${esc(c.fields.description)}</p>${data(
            [
              ["负责人", c.fields.owner],
              ["执行频率", c.fields.frequency],
              ["覆盖方式", labels[c.fields["coverage-mode"]]],
              ["参考映射", c.fields["external-reference"]],
            ],
          )}<div class="callout">${esc(r.reason)}</div><ul class="dimension-list">${r.dimensions.map((d) => `<li><span>${esc(d.key)}</span>${status(d.state)}</li>`).join("")}</ul><div class="actions">${button("edit-control", "编辑责任与实施方法", `data-id="${c.id}"`)}${button("manual", "补充证据", `data-control="${c.id}"`)}</div><h3 class="section-heading">逐份证据映射</h3>${mappings(c)}`
        : "",
    )
  );
};
const viewResources = () => {
  const r = selected("resources");
  return (
    header(
      m.resources,
      "每行是一个具体资产 × 检查；来源通过只描述读取到的规则，不等于整个控制合规。",
      button("import", m.import),
    ) +
    split(
      recordList("resources", (row) => `${row.fields.account} / ${row.fields.region} · ${row.fields["check-id"]}`),
      r
        ? `<h2>${esc(r.fields.title)}</h2>${status(r.fields.status)}<p>${esc(r.fields.summary)}</p>${data([
            ["资源", r.fields["resource-key"]],
            ["检查", r.fields["check-id"]],
            ["账户", r.fields.account],
            ["区域", r.fields.region],
            ["观察时间", date(r.fields["observed-at"])],
            ["来源", r.fields["source-locator"]],
          ])}<p class="muted-note">技术结果与控制适用性分开判断；缺少权限或未返回的数据保留为缺口。</p>`
        : "",
    )
  );
};
const viewEvidence = () => {
  const e = selected("evidence");
  return (
    header(m.evidence, m.coverageHelp, button("manual", m.manual) + button("import", m.import)) +
    split(
      recordList(
        "evidence",
        (row) => `${row.fields["requirement-key"]} · ${coverage(row)}`,
        (row) => row.fields["technical-result"],
      ),
      e
        ? `<span class="eyebrow">SOURCE / INTEGRITY / COVERAGE</span><h2>${esc(e.fields.title)}</h2>${status(e.fields["technical-result"])}<p>${esc(e.fields.excerpt)}</p>${data(
            [
              ["账户 / 区域", `${e.fields.account} / ${e.fields.region}`],
              ["资源", e.fields["resource-key"]],
              ["证据维度", e.fields["requirement-key"]],
              ["实际覆盖", coverage(e)],
              ["来源观察", date(e.fields["observed-at"])],
              ["本次收集", date(e.fields["collected-at"])],
              ["框架 / 范围版本", `${e.fields["framework-version"]} / ${e.fields["scope-version"]}`],
              ["私有来源定位", e.fields["source-locator"]],
              ["有效截止", date(e.fields["retention-until"])],
            ],
          )}<p class="hash">SHA-256 ${esc(e.fields.sha256)}</p><h3 class="section-heading">独立映射</h3>${rows(
            "evidence-links",
          )
            .filter((l) => ref(l.fields.evidence) === e.id)
            .map(
              (l) =>
                `<div class="mapping">${status(l.fields["review-state"])}<p>${esc(l.fields.title)}</p><p>${esc(l.fields["review-note"])}</p>${button("review", "复核此映射", `data-id="${l.id}"`)}</div>`,
            )
            .join("")}`
        : "",
    )
  );
};
const viewIssues = () => {
  const i = selected("issues");
  return (
    header(
      m.issues,
      "风险接受有到期日，技术失败保留原貌；关闭缺口需要同一范围的新复核证据。",
      button("export", "导出准备材料"),
    ) +
    split(
      recordList("issues", (row) => `${row.fields.owner || "待指派"} · 到期 ${date(row.fields["due-at"])}`),
      i
        ? `<h2>${esc(i.fields.title)}</h2><div class="actions">${status(i.fields.severity)}${status(i.fields.status)}</div><p>${esc(i.fields.reason)}</p>${data(
            [
              ["负责人", i.fields.owner],
              ["到期", date(i.fields["due-at"])],
              ["待复测资源", i.fields["resource-key"]],
              ["待复测检查", i.fields["check-id"]],
              ["关闭说明", i.fields["resolution-note"]],
            ],
          )}<div class="actions">${button("edit-issue", "指派 / 更新状态", `data-id="${i.id}"`)}${button("resolve", "用新证据关闭", `data-id="${i.id}"`)}${button("exception", "登记风险接受", `data-id="${i.id}"`)}</div><h3 class="section-heading">风险接受与到期</h3>${
            rows("exceptions")
              .filter((e) => ref(e.fields.control) === ref(i.fields.control))
              .map(
                (e) =>
                  `<div class="mapping">${status(exceptionState(e))}<p><strong>${esc(e.fields.title)}</strong></p><p>${esc(e.fields.reason)}<br>补偿措施：${esc(e.fields["compensating-controls"])}</p>${data(
                    [
                      ["接受人", e.fields["accepted-by"]],
                      ["截止", date(e.fields["expires-at"])],
                    ],
                  )}${e.fields.status !== "revoked" ? button("revoke-exception", "撤回风险接受", `data-id="${e.id}"`) : ""}</div>`,
              )
              .join("") || empty("无已加载风险接受。")
          }`
        : "",
    )
  );
};
const viewAssessments = () => {
  const a = selected("assessments");
  return (
    header(
      m.assessments,
      "页面只创建任务和导入已有材料。本机 Agent 再核对当前授权后，执行有限只读 AWS 配方。",
      button("request", "创建本机采集任务") + button("import", m.import),
    ) +
    split(
      recordList("assessments", (row) => `${date(row.fields["started-at"])} · ${row.fields["source-format"]}`),
      a
        ? `<h2>${esc(a.fields.title)}</h2>${status(a.fields.status)}<p>${esc(a.fields["coverage-note"] || "等待本机 Agent 领取；页面不连接云账户。")}</p>${data(
            [
              ["范围引用", a.fields["scope-reference"]],
              ["范围 / 框架", `${a.fields["scope-version"]} / ${a.fields["framework-version"]}`],
              ["期间", `${date(a.fields["period-start"])} → ${date(a.fields["period-end"])}`],
              ["心跳", date(a.fields["heartbeat-at"])],
              ["完成时间", date(a.fields["finished-at"])],
            ],
          )}<p class="code-sample">node scripts/aws.mjs --program ${esc(state.programId)} --assessment ${esc(a.id)} --profile YOUR_PROFILE --allow-account ACCOUNT --allow-region REGION --scope '${esc(a.fields["scope-reference"])}' --scope-version ${esc(a.fields["scope-version"])} --apply</p><div class="actions">${button("copy-link", "复制此任务链接")}${["requested", "running"].includes(a.fields.status) ? button("cancel-assessment", "取消后续采集", `data-id="${a.id}"`) : ""}</div><p class="muted-note">取消保留已保存的材料；正在执行的单条只读命令可能等待返回或超时。未执行的维度不能算通过。</p>`
        : "",
    )
  );
};
const settings = () =>
  dialog(
    m.settings,
    `<div class="modal-tabs" role="tablist"><button class="button" data-tab="guide" role="tab" aria-selected="true">工作流</button><button class="button" data-tab="style" role="tab" aria-selected="false">外观</button></div><section data-panel="guide"><h3>从明确范围开始</h3><ol><li>创建服务范围：负责人、授权账户/区域、框架和声明期间。</li><li>初始化控制模板。先导入现有报告或登记私有证据，不需要云凭据。</li><li>逐个维度复核适用性与覆盖期间；为每个缺口指定负责人和到期日。</li><li>用新的匹配证据关闭缺口；风险接受不改原始技术结果。</li><li>导出有边界的准备材料，与独立审计师确认后续范围。</li></ol><p>${m.notice}</p><p>${m.coverageHelp}</p><p class="muted-note">当前 ${isDemo() ? "为合成演示，页面刷新会重置" : "材料保存在当前 Busabase 工作区"}。每类每次读取 50 条，更多记录由用户再加载一页；界面总数标为已加载范围。AWS 凭据只留在本机配置，页面不会索要密钥。</p></section><section data-panel="style" hidden><div id="helpBody"></div></section>`,
  );
const render = () => {
  $("programSelect").innerHTML =
    state.programs
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === state.programId ? "selected" : ""}>${esc(p.fields.title)}${p.fields["is-example"] ? " · 示例" : ""}</option>`,
      )
      .join("") || '<option value="">先创建一个项目</option>';
  $("providerLabel").textContent = isDemo() ? "演示 · 不连接云账户" : "Busabase · 本机 Agent 采集";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("data-nav") === state.view);
    a.setAttribute("href", href(a.getAttribute("data-nav")));
  });
  $("attentionCount").textContent = String(rows("issues").filter((i) => i.fields.status !== "closed").length);
  if (state.loading && !program()) {
    $("content").innerHTML = empty(m.loading);
    return;
  }
  if (!program()) {
    $("content").innerHTML =
      `<section class="compliance-hero"><div><span class="eyebrow">BEGIN WITH SCOPE.</span><h1>${m.noProgram}</h1><p class="lead">${m.noProgramHelp}</p>${button("new-program", m.newProgram, "", true)}</div></section>`;
    return;
  }
  if (!programReady(program())) {
    $("content").innerHTML = header(
      "范围信息不完整",
      "请补齐服务、负责人、授权范围与声明期间后再导入或评估。",
      button("edit-program", "补齐项目范围"),
    );
    return;
  }
  const views = {
    overview: viewOverview,
    resources: viewResources,
    controls: viewControls,
    evidence: viewEvidence,
    issues: viewIssues,
    assessments: viewAssessments,
  };
  $("content").innerHTML = (views[state.view] || viewOverview)();
};
const load = async ({ quiet = false } = {}) => {
  const token = ++generation;
  if (!quiet) state.loading = true;
  try {
    const ready = await provider.ready();
    if (!ready.ok) throw new Error(`SETUP_REQUIRED: ${ready.missing.join("、")}`);
    const page = await provider.page("programs");
    state.programs = page.records;
    const requested = route().program || state.programId;
    if (requested && !state.programs.some((p) => p.id === requested)) {
      const deep = await provider.get("programs", requested);
      state.programs.push(deep);
    }
    const prior = state.programId;
    state.programId = requested || state.programs[0]?.id || "";
    if (prior !== state.programId) {
      state.rows = {};
      state.cursors = {};
      state.pageDepth = {};
    }
    if (state.programId)
      await Promise.all(
        appConfig.bases
          .filter((b) => b.key !== "programs")
          .map(async (b) => {
            const result = await provider.page(b.key, { valueFilters: programFilter(state.programId) });
            if (token !== generation) return;
            const verified = result.records.map((row) => requireOwned(row, state.programId));
            const ids = new Set(verified.map((r) => r.id));
            state.rows[b.key] = quiet ? [...verified, ...rows(b.key).filter((r) => !ids.has(r.id))] : verified;
            state.cursors[b.key] = state.pageDepth[b.key] > 1 && quiet ? state.cursors[b.key] : result.nextCursor;
          }),
      );
    if (token !== generation) return;
    const deepKey = state.view;
    if (state.id && appConfig.bases.some((b) => b.key === deepKey) && !rows(deepKey).some((r) => r.id === state.id)) {
      const row = requireOwned(await provider.get(deepKey, state.id), state.programId);
      state.rows[deepKey] = [...rows(deepKey), row];
    }
    state.loading = false;
    render();
    if (page.nextCursor) notice("项目列表仅加载前 50 条；可用项目的任务深链接打开其余项目。");
  } catch (error) {
    state.loading = false;
    if (!quiet) {
      notice(`${m.error}：${error instanceof Error ? error.message : "连接失败"}`);
      $("content").innerHTML = header(
        "工作台暂未就绪",
        "请检查当前连接和安装资源；连接恢复后可刷新。",
        button("refresh", "重试"),
      );
    }
  }
};
const openProgram = (edit = false) => {
  const f = edit ? program().fields : {};
  dialog(
    edit ? "编辑项目范围" : m.newProgram,
    form(
      "programForm",
      `${field("title", "项目名称", f.title)}${field("owner", "负责人", f.owner)}${area("service-description", "服务与适用范围", f["service-description"])}${area("accounts", "授权账户 / 组织（每行一个）", f.accounts)}${area("regions", "授权区域（每行一个）", f.regions || "us-east-1")}${field("scope-reference", "授权工单或范围引用", f["scope-reference"])}${field("scope-version", "范围版本", f["scope-version"] || 1, "number")}${select(
        "assessment-type",
        "评估类型",
        [
          ["period", "期间运行准备"],
          ["point", "时点设计准备"],
        ],
        f["assessment-type"] || "period",
      )}${field("period-start", "开始时间（含时区的 ISO 8601）", f["period-start"] || "2026-07-01T00:00:00Z")}${field("period-end", "结束时间（含时区的 ISO 8601）", f["period-end"] || "2026-09-30T23:59:59Z")}${field("framework-version", "框架与映射版本", FRAMEWORK)}<p class="muted-note full">范围更改时递增版本，历史证据不会自动适配新范围。新项目不会自动连接云账户。</p><input type="hidden" name="edit" value="${edit ? program().id : ""}">`,
    ),
  );
};
const openManual = (controlId = "") => {
  const p = program();
  if (!rows("controls").length) throw new Error("请先初始化控制模板。");
  dialog(
    m.manual,
    form(
      "evidenceForm",
      `${select("controlId", "支撑的控制", options("controls"), controlId)}${field("title", "证据名称")}${field("account", "账户 / 组织", lines(p.fields.accounts)[0])}${field("region", "区域", lines(p.fields.regions)[0])}${field("resourceKey", "具体资源 / 人员适用范围")}${field("checkId", "证据维度（控制中的 requirement key）", controlId ? lines(rows("controls").find((r) => r.id === controlId)?.fields["evidence-requirements"])[0] : "asset-inventory")}${select(
        "evidenceMode",
        "覆盖方式",
        [
          ["period", "真实期间记录"],
          ["snapshot", "时点快照"],
        ],
      )}${select("technicalResult", "来源结果", [
        ["manual", "需人工解释"],
        ["pass", "来源通过"],
        ["fail", "来源失败"],
        ["unknown", "未知"],
      ])}${field("observedAt", "来源观察时间（ISO）", new Date().toISOString())}${field("collectedAt", "本次采集时间（ISO）", new Date().toISOString())}${field("coverageStart", "真实覆盖开始（期间证据必填）", p.fields["period-start"], "text", false)}${field("coverageEnd", "真实覆盖结束（期间证据必填）", p.fields["period-end"], "text", false)}${field("sourceLocator", "私有来源定位（不要填秘密）")}${field("retentionUntil", "复核 / 有效截止（ISO，可留空）", "", "text", false)}${area("summary", "脱敏摘要、适用范围与材料限制")}<p class="muted-note full">保存后只产生待复核映射。各维度独立复核；哈希仅覆盖登记摘要，原始材料可通过 CLI 导入真实文件哈希。</p>`,
    ),
  );
};
const openImport = () =>
  dialog(
    m.import,
    form(
      "importForm",
      `${select("format", "文件格式", [
        ["normalized", "Kelly normalized v1"],
        ["prowler", "Prowler JSON"],
        ["securityhub", "AWS Security Hub ASFF"],
        ["github", "GitHub 变更证据 v1"],
      ])}<label class="full">选择 JSON 文件（最多 2 MB）<input id="reportFile" type="file" accept="application/json,.json"></label>${area("report", "或粘贴已脱敏 JSON")}<label class="full"><span><input type="checkbox" name="resume"> 显式恢复同一来源的已中断导入（不重复既有证据）</span></label><p class="muted-note full">导入严格核对项目账户、区域、框架及范围版本。保存来源结果和待复核映射；不会自动判定控制就绪。</p>`,
    ),
  );
const openReview = (id) => {
  const link = rows("evidence-links").find((r) => r.id === id);
  dialog(
    "逐项复核此证据映射",
    form(
      "reviewForm",
      `<input type="hidden" name="linkId" value="${esc(id)}"><p class="callout full">${esc(link.fields.title)}。确认具体维度、完整范围、真实期间和来源限制；接受此映射不会接受其他控制映射。</p>${select(
        "verdict",
        "复核判断",
        [
          ["accepted", "适用于此维度"],
          ["rejected", "不适用于此维度"],
        ],
      )}${field("reviewer", "复核人", link.fields.reviewer || program().fields.owner)}${area("note", "适用性判断与理由", link.fields["review-note"] || "")}`,
    ),
  );
};
const snapshotReport = () => {
  const p = program();
  return `# ${p.fields.title} — 云安全与 SOC 2 准备材料\n\n${m.notice}\n\n范围：${p.fields["scope-reference"]} / v${p.fields["scope-version"]}\n账户：${p.fields.accounts}\n区域：${p.fields.regions}\n框架：${p.fields["framework-version"]}\n期间：${p.fields["period-start"]} → ${p.fields["period-end"]}\n\n本导出仅包含当前已加载记录。尚有分页：${
    Object.entries(state.cursors)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(",") || "无已知下一页"
  }。需完整受控导出，请用 scripts/report.mjs。\n\n## 控制与维度\n${rows("controls")
    .map((c) => `- ${c.fields.title}：${readiness(c).state}；负责人 ${c.fields.owner}；${readiness(c).reason}`)
    .join("\n")}\n\n## 证据索引\n${rows("evidence")
    .map(
      (e) =>
        `- ${e.fields.title}：${e.fields["source-locator"]}；sha256 ${e.fields.sha256}；观察 ${e.fields["observed-at"]}；采集 ${e.fields["collected-at"]}；覆盖 ${coverage(e)}`,
    )
    .join("\n")}\n\n## 缺口\n${rows("issues")
    .map(
      (i) =>
        `- ${i.fields.title}：${i.fields.status}；${i.fields.owner}；到期 ${i.fields["due-at"] || "未设"}；${i.fields.reason}`,
    )
    .join("\n")}\n\n## 风险接受\n${rows("exceptions")
    .map(
      (e) =>
        `- ${e.fields.title}：${exceptionState(e)}；${e.fields.reason}；补偿 ${e.fields["compensating-controls"]}；接受人 ${e.fields["accepted-by"]}；截止 ${e.fields["expires-at"]}`,
    )
    .join("\n")}\n`;
};
const write = async (callback) => {
  if (busy) return;
  busy = true;
  const formElement = $("actionDialog").querySelector("form");
  formElement?.querySelectorAll("button").forEach((b) => {
    b.disabled = true;
  });
  try {
    await callback();
    close();
    await load();
    const { airAppWriteMessage } = await import("../vendor/busabase-airapp.js");
    notice(
      isDemo()
        ? "演示修改已保存于当前页面。"
        : airAppWriteMessage(provider.lastWrite || { status: "saved" }, { locale: "zh-CN" }),
    );
  } catch (error) {
    const text = error instanceof Error ? error.message : m.error;
    if ($("formError")) $("formError").textContent = text;
    else notice(text);
  } finally {
    busy = false;
    formElement?.querySelectorAll("button").forEach((b) => {
      b.disabled = false;
    });
  }
};
document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-action],[data-tab]") : null;
  if (!target) return;
  if (target.getAttribute("data-tab")) {
    const tab = target.getAttribute("data-tab");
    $("actionDialog")
      .querySelectorAll("[data-panel]")
      .forEach((panel) => {
        panel.hidden = panel.getAttribute("data-panel") !== tab;
      });
    $("actionDialog")
      .querySelectorAll("[data-tab]")
      .forEach((button) => button.setAttribute("aria-selected", String(button === target)));
    return;
  }
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  try {
    if (action === "sidebar") {
      document.body.classList.toggle("sidebar-open");
      document.querySelector(".sidebar-scrim").hidden = !document.body.classList.contains("sidebar-open");
    }
    if (action === "close-dialog") close();
    if (action === "refresh") await load();
    if (action === "new-program") openProgram();
    if (action === "edit-program") openProgram(true);
    if (action === "manual") openManual(target.getAttribute("data-control") || "");
    if (action === "import") openImport();
    if (action === "review") openReview(id);
    if (action === "initialize") await write(() => initializeControls(provider, state.programId));
    if (action === "more") {
      const key = target.getAttribute("data-key");
      if (busy) return;
      busy = true;
      try {
        const page = await provider.page(key, {
          cursor: state.cursors[key],
          valueFilters: programFilter(state.programId),
        });
        const ids = new Set(rows(key).map((r) => r.id));
        state.rows[key].push(
          ...page.records.map((r) => requireOwned(r, state.programId)).filter((r) => !ids.has(r.id)),
        );
        state.cursors[key] = page.nextCursor;
        state.pageDepth[key] = (state.pageDepth[key] || 1) + 1;
        render();
      } finally {
        busy = false;
      }
    }
    if (action === "edit-control") {
      const c = rows("controls").find((r) => r.id === id);
      dialog(
        "控制责任与实施方法",
        form(
          "controlForm",
          `<input type="hidden" name="id" value="${esc(id)}">${field("owner", "负责人", c.fields.owner)}${field("frequency", "执行 / 复核频率", c.fields.frequency)}${select(
            "design-state",
            "实施方法",
            [
              ["designed", "已说明实施方法"],
              ["not-designed", "尚未说明"],
            ],
            c.fields["design-state"],
          )}${area("description", "实际实施方法与适用范围", c.fields.description)}`,
        ),
      );
    }
    if (action === "edit-issue") {
      const i = rows("issues").find((r) => r.id === id);
      dialog(
        "指派缺口并更新状态",
        form(
          "issueForm",
          `<input type="hidden" name="id" value="${esc(id)}">${field("owner", "负责处理的人", i.fields.owner)}${field("due-at", "到期时间（ISO）", i.fields["due-at"] || new Date(Date.now() + 7 * 86400000).toISOString())}${select(
            "status",
            "处理状态",
            [
              ["open", "待处理"],
              ["in-progress", "处理中"],
              ["needs-verification", "等待新证据复测"],
              ["reopened", "重新打开"],
            ],
            i.fields.status,
          )}${area("reason", "缺口与处理说明", i.fields.reason)}`,
        ),
      );
    }
    if (action === "resolve") {
      const i = rows("issues").find((r) => r.id === id);
      const links = rows("evidence-links").filter((l) => ref(l.fields.control) === ref(i.fields.control));
      dialog(
        "用匹配的新证据关闭缺口",
        form(
          "resolveForm",
          `<input type="hidden" name="id" value="${esc(id)}">${select(
            "linkId",
            "已复核的证据映射",
            links.map((l) => [l.id, l.fields.title]),
          )}${area("note", "本次修复、复测结果与关闭理由")}<p class="muted-note full">只有新观察、匹配原资源/检查、具有支持结论的已接受映射可以关闭；风险接受不能替代复测。</p>`,
        ),
      );
    }
    if (action === "exception") {
      const i = rows("issues").find((r) => r.id === id);
      dialog(
        "登记有到期日的风险接受",
        form(
          "exceptionForm",
          `<input type="hidden" name="issueId" value="${esc(id)}"><input type="hidden" name="controlId" value="${esc(ref(i.fields.control))}">${area("reason", "为什么接受当前风险")}${area("compensatingControls", "补偿措施与残余风险")}${field("acceptedBy", "接受风险的负责人")}${field("expiresAt", "截止时间（ISO）", new Date(Date.now() + 14 * 86400000).toISOString())}<p class="callout full">风险接受不会将技术失败变成通过，到期后会明确显示为已过期。</p>`,
        ),
      );
    }
    if (action === "revoke-exception")
      await write(async () => {
        const e = await provider.get("exceptions", id);
        await provider.update("exceptions", requireOwned(e, state.programId), { status: "revoked" });
      });
    if (action === "request") {
      const p = program().fields;
      dialog(
        "创建本机只读采集任务",
        form(
          "requestForm",
          `${field("title", "任务名称", `${p.title} · 有限 AWS 基线`)}<p class="callout full">固定范围版本 ${esc(p["scope-version"])} / ${esc(p["scope-reference"])}。页面只保存请求，本机 Agent 另行核对当前账户、区域和预算授权。示例项目不会连接真实 AWS。</p>`,
        ),
      );
    }
    if (action === "cancel-assessment")
      await write(async () => {
        const a = requireOwned(await provider.get("assessments", id), state.programId);
        if (!["running", "requested"].includes(a.fields.status)) throw new Error("任务状态已变化，请刷新。");
        await provider.update("assessments", a, {
          status: "cancelled",
          "coverage-note": "用户取消后续采集；已保存的来源与证据保留。",
        });
      });
    if (action === "copy-link") {
      await navigator.clipboard.writeText(location.href);
      notice("已复制当前任务深链接。");
    }
    if (action === "export") {
      const blob = new Blob([snapshotReport()], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "compliance-preparation.md";
      a.click();
      URL.revokeObjectURL(url);
      notice("已导出当前加载范围的准备材料，文件中保留覆盖限制。");
    }
  } catch (error) {
    notice(error instanceof Error ? error.message : m.error);
  }
});
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === "programSelect")
    location.hash = `#/overview?program=${encodeURIComponent(target.value)}`;
  if (target instanceof HTMLInputElement && target.id === "reportFile" && target.files[0]) {
    const file = target.files[0];
    if (file.size > 2 * 1024 * 1024) {
      $("formError").textContent = "文件超过 2 MB；请在本机拆成明确范围的小批次。";
      return;
    }
    $("importForm").querySelector('[name="report"]').value = await file.text();
  }
});
document.addEventListener("submit", async (event) => {
  const f = event.target;
  if (!(f instanceof HTMLFormElement)) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(f).entries());
  await write(async () => {
    const get = (name) => String(values[name] || "").trim();
    if (f.id === "programForm") {
      const fields = {
        title: get("title"),
        owner: get("owner"),
        "service-description": get("service-description"),
        accounts: get("accounts"),
        regions: get("regions"),
        "scope-reference": get("scope-reference"),
        "scope-version": Number(get("scope-version")),
        "assessment-type": get("assessment-type"),
        "period-start": get("period-start"),
        "period-end": get("period-end"),
        "framework-version": get("framework-version"),
        "onboarding-state": "complete",
        "is-example": false,
      };
      if (!programReady(fields)) throw new Error("范围不完整，或时间缺少时区 / 框架不受支持。");
      if (get("edit")) {
        const old = await provider.get("programs", get("edit"));
        if (
          fields["scope-version"] <= old.fields["scope-version"] &&
          [
            "accounts",
            "regions",
            "period-start",
            "period-end",
            "assessment-type",
            "scope-reference",
            "framework-version",
            "service-description",
          ].some((k) => old.fields[k] !== fields[k])
        )
          throw new Error("更改范围时必须递增范围版本。");
        await provider.update("programs", old, fields);
      } else {
        const key = crypto.randomUUID();
        const row = await provider.create("programs", { ...fields, "record-key": key }, key);
        state.programId = row.id;
        history.replaceState(null, "", href("overview"));
      }
    }
    if (f.id === "importForm") {
      const raw = get("report");
      if (raw.length > 2 * 1024 * 1024) throw new Error("报告超过 2 MB。");
      const input = JSON.parse(raw);
      normalizeReport(input, {
        format: get("format"),
        frameworkVersion: program().fields["framework-version"],
        scopeVersion: program().fields["scope-version"],
      });
      await importReport(provider, state.programId, input, { format: get("format"), resume: get("resume") === "on" });
    }
    if (f.id === "evidenceForm")
      await addEvidence(
        provider,
        state.programId,
        get("controlId"),
        Object.fromEntries(Object.keys(values).map((k) => [k, get(k)])),
      );
    if (f.id === "reviewForm")
      await reviewEvidenceLink(provider, state.programId, get("linkId"), {
        verdict: get("verdict"),
        note: get("note"),
        reviewer: get("reviewer"),
      });
    if (f.id === "controlForm") {
      const c = requireOwned(await provider.get("controls", get("id")), state.programId);
      await provider.update("controls", c, {
        owner: get("owner"),
        frequency: get("frequency"),
        description: get("description"),
        "design-state": get("design-state"),
      });
    }
    if (f.id === "issueForm") {
      isoInput(get("due-at"));
      const i = requireOwned(await provider.get("issues", get("id")), state.programId);
      await provider.update("issues", i, {
        owner: get("owner"),
        "due-at": get("due-at"),
        status: get("status"),
        reason: get("reason"),
      });
    }
    if (f.id === "resolveForm") {
      const link = requireOwned(await provider.get("evidence-links", get("linkId")), state.programId);
      await resolveIssue(provider, state.programId, get("id"), {
        linkId: link.id,
        evidenceId: ref(link.fields.evidence),
        note: get("note"),
      });
    }
    if (f.id === "exceptionForm")
      await createException(provider, state.programId, get("controlId"), {
        reason: get("reason"),
        compensatingControls: get("compensatingControls"),
        acceptedBy: get("acceptedBy"),
        expiresAt: get("expiresAt"),
        issueId: get("issueId"),
      });
    if (f.id === "requestForm") {
      const p = program().fields;
      if (!programReady(program())) throw new Error("范围尚未确认。");
      const key = crypto.randomUUID();
      await provider.create(
        "assessments",
        {
          title: get("title"),
          "record-key": key,
          "program-reference": state.programId,
          program: state.programId,
          "scope-reference": p["scope-reference"],
          "scope-version": p["scope-version"],
          "framework-version": p["framework-version"],
          "period-start": p["period-start"],
          "period-end": p["period-end"],
          "assessment-type": p["assessment-type"],
          "source-format": "aws-read-catalog",
          status: "requested",
          "coverage-note": "等待当前本机 Agent 核对授权与身份；页面没有发起云 API。",
        },
        key,
      );
    }
  });
});
$("actionDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  close();
});
window.addEventListener("hashchange", async () => {
  const nextRoute = route();
  document.body.classList.remove("sidebar-open");
  document.querySelector(".sidebar-scrim").hidden = true;
  if (nextRoute.view === "settings") {
    settings();
    return;
  }
  if ($("actionDialog").open) close();
  priorHash = location.hash;
  const changed = nextRoute.program && nextRoute.program !== state.programId;
  state.view = nextRoute.view;
  state.id = nextRoute.id;
  if (changed) await load();
  else {
    const key = state.view;
    if (state.id && appConfig.bases.some((b) => b.key === key) && !rows(key).some((r) => r.id === state.id)) {
      try {
        state.rows[key].push(requireOwned(await provider.get(key, state.id), state.programId));
      } catch (error) {
        notice(error.message);
        state.id = "";
      }
    }
    render();
  }
});
$("demoBanner").hidden = !isDemo();
Object.assign(state, { view: route().view, id: route().id });
try {
  provider = await getProvider();
  if (!isDemo()) {
    const { getRuntime, shouldUseLocalGateway } = await import("./runtime.js");
    const { createAirAppConnectGate } = await import("../vendor/busabase-airapp-gate.js");
    const runtime = await getRuntime();
    const gate = createAirAppConnectGate({
      appName: "Kelly Compliance",
      shouldGate: () => !isDemo() && shouldUseLocalGateway(runtime),
      demoHref: "?demo=1",
      onProvision: () => provider.initialize(),
    });
    if (await gate.pass({ onReady: () => load() })) await load();
  } else await load();
  if (route().view === "settings") settings();
} catch (error) {
  notice(error instanceof Error ? error.message : m.error);
}
setInterval(() => {
  if (
    provider &&
    !busy &&
    !$("actionDialog").open &&
    !document.hidden &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    void load({ quiet: true });
}, 20000);
