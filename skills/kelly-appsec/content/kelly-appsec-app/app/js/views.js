import { ui } from "./messages.js";
import { date, esc, href, label, latest, ref, tone } from "./model.js";
export const pill = (value) =>
  `<span class="pill is-${tone(value)}"><span class="status-dot"></span>${esc(label(value))}</span>`;
export const empty = (title, text) =>
  `<div class="empty-state"><span class="empty-mark">◇</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
const button = (action, title, primary = false) =>
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}">${esc(title)}</button>`;
const more = (state, key) =>
  state.cursors[key] ? `<button class="button load-more" data-more="${key}">${ui.loadMore}</button>` : "";
const projectSelect = (state) =>
  `<label class="run-picker"><span class="sr-only">选择项目</span><select id="projectSelect">${state.projects.map((row) => `<option value="${esc(row.id)}" ${state.projectId === row.id ? "selected" : ""}>${esc(row.fields.title)}</option>`).join("")}</select></label>`;
const runSelect = (state) =>
  `<label class="run-picker"><span class="sr-only">选择运行记录</span><select id="runSelect"><option value="">${ui.runPicker}</option>${state.runs.map((row) => `<option value="${esc(row.id)}" ${state.runId === row.id ? "selected" : ""}>${esc(row.fields.title)} · ${esc(label(row.fields.status))}</option>`).join("")}</select></label>`;
const toolbar = (state, title, actions = "", withRun = false) =>
  `<div class="view-toolbar"><h1>${esc(title)}</h1><div class="toolbar-actions">${state.projectId ? projectSelect(state) : ""}${withRun ? runSelect(state) : ""}${actions}</div></div>`;
const named = (state, key, id) => state[key].find((row) => row.id === ref(id))?.fields.title || ui.unloaded;
const selectedChecks = (state) => latest(state.checks);
const evidenceCard = (row) =>
  `<article class="evidence-card"><strong>${esc(row.fields.title)}</strong><div class="source-line">${esc(row.fields["source-location"])} · ${date(row.fields["observed-at"])}</div><pre>${esc(row.fields["redacted-excerpt"])}</pre><details><summary>来源与完整性</summary><p>版本 ${esc(row.fields["source-revision"])}</p><p class="mono">SHA-256 ${esc(row.fields.sha256)}</p><p>${esc(row.fields["coverage-note"])}</p></details></article>`;
const projectRows = (state) =>
  state.projects
    .map(
      (row) =>
        `<article class="host-row"><span class="host-avatar">⌘</span><span class="project-copy"><strong>${esc(row.fields.title)}</strong><small>${esc(row.fields["repository-reference"] || "未登记仓库")} · ${esc(row.fields["source-revision"])}</small></span><span class="muted">${esc(row.fields.environment)}</span>${pill(row.fields["onboarding-state"] === "complete" ? "satisfied" : "inconclusive")}<a class="button compact" href="#/overview?project=${encodeURIComponent(row.id)}">打开项目</a></article>`,
    )
    .join("");
const matrix = (state, compact = false) => {
  const identities = [...new Set(state.rules.map((row) => row.fields.identity))];
  const checks = selectedChecks(state);
  return `<div class="matrix-scroll"><table class="matrix api-matrix"><thead><tr><th>接口 / 业务动作</th>${identities.map((id) => `<th>${esc(label(id))}</th>`).join("")}</tr></thead><tbody>${state.endpoints
    .map(
      (endpoint) =>
        `<tr><th><span class="mono">${esc(endpoint.fields.method)} ${esc(endpoint.fields.path)}</span><small>${esc(endpoint.fields["business-flow"])}</small></th>${identities
          .map((identity) => {
            const rules = state.rules.filter(
              (rule) => ref(rule.fields.endpoint) === endpoint.id && rule.fields.identity === identity,
            );
            if (!rules.length) return '<td><span class="matrix-unknown" title="未登记此身份的业务规则">—</span></td>';
            return `<td>${rules
              .map((rule) => {
                const check = checks.get(rule.id);
                return `<a class="matrix-result is-${tone(check?.fields.result || "unverified")}" href="${href(state, "matrix", rule.id)}"><span>${esc(label(rule.fields.expectation))}</span><strong>${check ? esc(label(check.fields.result)) : "未验证"}</strong></a>`;
              })
              .join("")}</td>`;
          })
          .join("")}</tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${compact ? "" : `<p class="caption">${ui.sourceNote} 当前矩阵仅包含已加载的接口、规则与任务结果。</p>${more(state, "endpoints")}${more(state, "rules")}${more(state, "checks")}`}`;
};
const overview = (state) =>
  `<section id="overviewPage" class="overview-page"><div class="page-hero"><div><p class="eyebrow">APPLICATION & API · 权限与业务规则</p><h1>${ui.headline}</h1><p class="lede">${ui.lede}</p></div>${button("request", ui.request, true)}</div><div class="metric-band metrics"><div><span>当前版本接口</span><strong>${state.summary.endpoints ?? "—"}</strong></div><div><span>已登记规则</span><strong>${state.summary.rules ?? "—"}</strong></div><div><span>本次任务</span><strong>${state.runId ? esc(label(state.run?.fields.status)) : "未开始"}</strong></div></div>${state.projectId ? `<div class="section-heading"><h2>${esc(state.project.fields.title)} · ${esc(state.revision)}</h2><div>${projectSelect(state)}</div></div>${state.endpoints.length ? matrix(state, true) : empty("先导入接口与规则", "可以导入当前版本的 OpenAPI 或显式业务规则 inventory JSON。")}<div class="coverage-box"><strong>优先核对授权和业务状态</strong><p>${ui.staticNote}</p></div><div class="section-heading"><h2>当前项目</h2><div>${button("import", ui.import)} ${button("project-settings", ui.updateProject)}</div></div>${projectRows({ ...state, projects: [state.project] })}` : empty(ui.noProject, ui.noProjectHint)}</section>`;
const projects = (state) =>
  `${toolbar(state, ui.projects, button("project", ui.addProject, true))}<div class="record-scroll">${projectRows(state) || empty(ui.noProject, ui.noProjectHint)}${more(state, "projects")}</div>`;
const endpoints = (state) =>
  `${toolbar(state, ui.endpoints, `${button("import", ui.import, true)}${button("rule", ui.addRule)}`)}<div class="record-scroll">${state.endpoints.length ? `<table class="record-table"><thead><tr><th>接口</th><th>业务流程</th><th>来源 / 版本</th><th>操作</th></tr></thead><tbody>${state.endpoints.map((row) => `<tr><td><strong class="mono">${esc(row.fields.method)} ${esc(row.fields.path)}</strong><small>${esc(row.fields["operation-id"])}</small></td><td>${esc(row.fields["business-flow"])}</td><td>${esc(row.fields["source-location"])}<small>${esc(row.fields["source-revision"])} · ${esc(label(row.fields.discovery))}</small></td><td><a href="${href(state, "rules")}">查看规则 →</a></td></tr>`).join("")}</tbody></table>` : empty("当前版本尚未登记接口", ui.importRevision)}${more(state, "endpoints")}</div>`;
const rules = (state) =>
  `${toolbar(state, ui.rules, button("rule", ui.addRule, true))}<div class="record-scroll">${state.rules.length ? `<table class="record-table"><thead><tr><th>接口与身份</th><th>预期</th><th>业务依据</th><th>前提</th></tr></thead><tbody>${state.rules.map((row) => `<tr><td><a href="${href(state, "matrix", row.id)}">${esc(named(state, "endpoints", row.fields.endpoint))}</a><small>${esc(label(row.fields.identity))}</small></td><td>${pill(row.fields.expectation)}</td><td>${esc(row.fields["policy-note"])}</td><td>${row.fields.confirmed ? "已确认规则" : "规则未确认"}<small>${row.fields.mutating ? "含状态变化，需本机明确授权" : "仍需核对读取副作用"}</small></td></tr>`).join("")}</tbody></table>` : empty("先明确允许和禁止什么", "规则需要正向数据断言；拒绝案例还需要正向基线和禁止数据断言。")}${more(state, "rules")}</div>`;
const matrixView = (state) => {
  const rule = state.rules.find((row) => row.id === state.item);
  const check = rule ? selectedChecks(state).get(rule.id) : null;
  return `${toolbar(state, ui.matrix, `${button("request", ui.request, true)}${button("export", ui.export)}`, true)}<div class="matrix-layout ${rule ? "has-selection" : ""}"><section class="matrix-pane">${state.endpoints.length ? matrix(state) : empty("没有可展示的接口规则", "先在当前项目版本导入接口与规则。")}</section>${
    rule
      ? `<section class="detail-panel detail-visible"><a class="back-to-list" href="${href(state, "matrix")}">← ${ui.back}</a><p class="eyebrow">规则与证据</p><h2>${esc(named(state, "endpoints", rule.fields.endpoint))}</h2><div class="assessment-pair"><div><small>预期 · ${esc(label(rule.fields.identity))}</small>${pill(rule.fields.expectation)}</div><div><small>${ui.result}</small>${pill(check?.fields.result || "unverified")}</div></div><p class="detail-summary">${esc(rule.fields["policy-note"])}</p><dl class="facts"><div><dt>版本</dt><dd>${esc(rule.fields["source-revision"])}</dd></div><div><dt>采集状态</dt><dd>${esc(label(check?.fields.status || "requested"))}</dd></div><div><dt>采集时间</dt><dd>${date(check?.fields["observed-at"])}</dd></div></dl><div class="coverage-box"><strong>${ui.gap}</strong><p>${esc(check?.fields.summary || "尚未执行此规则；没有结果不能判为安全。")}</p></div><h3>${ui.evidence}</h3>${
          state.evidence
            .filter((row) => ref(row.fields.check) === check?.id)
            .map(evidenceCard)
            .join("") || `<p class="muted">${ui.noEvidence}</p>`
        }${more(state, "evidence")}</section>`
      : ""
  }</div>`;
};
const findings = (state) => {
  const row = state.findings.find((item) => item.id === state.item) || state.findings[0];
  return `${toolbar(state, ui.findings, button("export", ui.export), true)}${
    !row
      ? empty("当前任务没有已加载的发现", "请先核对该任务覆盖和未验证规则，不能据此宣布没有漏洞。")
      : `<div class="workspace"><section class="list-panel">${state.findings.map((item, index) => `<a class="finding-row ${item.id === row.id ? "selected" : ""} ${state.flash === item.id ? "verdict-flash" : ""}" href="${href(state, "findings", item.id)}"><small>发现 ${String(index + 1).padStart(2, "0")} · ${esc(label(item.fields.severity))}</small><strong>${esc(item.fields.title)}</strong>${pill(item.fields.verdict)}${pill(item.fields.remediation)}</a>`).join("")}${more(state, "findings")}</section><section class="detail-panel ${state.item ? "detail-visible" : ""}"><a class="back-to-list" href="${href(state, "findings")}">← ${ui.back}</a><p class="eyebrow">需要业务和开发共同判断</p><h2>${esc(row.fields.title)}</h2><div class="assessment-pair"><div><small>自动分析</small>${pill(row.fields.conclusion)}</div><div><small>人工复核</small>${pill(row.fields.verdict)}</div><div><small>修复进度</small>${pill(row.fields.remediation)}</div></div><p class="detail-summary">${esc(row.fields.reasoning)}</p><div class="coverage-box"><strong>仍需确认</strong><p>${esc(row.fields.limitations)}</p></div><h3>建议修复</h3><p>${esc(row.fields.recommendation)}</p><form id="reviewForm" data-record="${esc(row.id)}" class="review-form"><label>复核理由<textarea name="review-note" id="reviewNote" rows="3" required placeholder="说明业务策略、对象归属、实际影响或正常解释。">${esc(row.fields["review-note"] || "")}</textarea></label><label>修复负责人<input name="owner" value="${esc(row.fields.owner || "")}"></label><div class="detail-actions-top"><button class="button" name="verdict" value="explained-benign">正常解释</button><button class="button" name="verdict" value="needs-investigation">继续调查</button><button class="button primary" name="verdict" value="confirmed-vulnerability">确认缺陷</button></div></form><div class="section-heading"><h3>指定版本复测</h3><button class="button" data-retest="${esc(row.id)}">${ui.retest}</button></div><p class="context-note">复测必须对应原问题的业务规则和正向基线；其他接口通过不能关闭此问题。</p><h3>${ui.evidence}</h3>${
          state.evidence
            .filter((item) => ref(item.fields.check) === ref(row.fields.check))
            .map(evidenceCard)
            .join("") || `<p class="muted">${ui.noEvidence}</p>`
        }</section></div>`
  }`;
};
const runs = (state) =>
  `${toolbar(state, ui.runs, `${button("refresh", ui.refresh)}${button("request", ui.request, true)}`)}<div class="record-scroll">${state.runs.length ? `<table class="record-table"><thead><tr><th>任务</th><th>状态</th><th>目标</th><th>下一步</th></tr></thead><tbody>${state.runs.map((row) => `<tr><td><a href="${href(state, "matrix", "", row.id)}">${esc(row.fields.title)}</a><small>${date(row.fields["requested-at"])}</small></td><td>${pill(row.fields.status)}<small>${esc(label(row.fields.mode))}</small></td><td>${esc(row.fields.environment)}<small>${esc(row.fields["source-revision"])}</small></td><td>${["requested", "running"].includes(row.fields.status) ? `<button class="button compact" data-cancel="${esc(row.id)}">取消后续验证</button>` : `<a href="${href(state, "matrix", "", row.id)}">查看结果 →</a>`}</td></tr>`).join("")}</tbody></table>` : empty(ui.noRun, ui.noRunHint)}${more(state, "runs")}</div>`;
export const renderView = (state) => {
  if (state.error) return empty(ui.connectError, state.error) + button("refresh", "重试");
  if (state.loading) return empty("正在读取审计记录…", "读取当前项目、版本和任务的明确范围。");
  if (state.view === "projects") return projects(state);
  if (!state.projectId && state.view !== "overview")
    return (
      toolbar(state, ui[state.view], button("project", ui.addProject, true)) + empty(ui.noProject, ui.noProjectHint)
    );
  if (state.view === "endpoints") return endpoints(state);
  if (state.view === "rules") return rules(state);
  if (state.view === "matrix") return matrixView(state);
  if (state.view === "findings") return findings(state);
  if (state.view === "runs") return runs(state);
  return overview(state);
};
