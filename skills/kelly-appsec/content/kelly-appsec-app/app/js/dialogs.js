import { esc, inventoryExample } from "./model.js";
const input = (name, title, value = "", required = true, type = "text") =>
  `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
const textarea = (name, title, value = "", required = true, rows = 3) =>
  `<label>${title}<textarea name="${name}" rows="${rows}" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
const footer = (title) =>
  `<p id="dialogError" class="form-error" role="alert"></p><div class="form-footer"><button class="button" type="button" data-action="close-dialog">取消</button><button class="button primary" type="submit">${title}</button></div>`;
export const projectDialog = (row = null) => ({
  title: row ? "项目配置与当前版本" : "添加应用项目",
  body: `<form id="projectForm" ${row ? `data-record="${esc(row.id)}"` : ""}>${input("title", "项目名称", row?.fields.title)}${input("owner", "审计负责人", row?.fields.owner)}${input("repository-reference", "仓库或服务引用", row?.fields["repository-reference"], false)}${input("source-revision", "明确源码 / 部署版本", row?.fields["source-revision"])}${input("environment", "声明环境", row?.fields.environment || "staging")}${input("origin", "测试 Origin（仅动态验证需要）", row?.fields.origin, false, "url")}${textarea("scope-note", "业务边界与授权说明", row?.fields["scope-note"])}<p class="context-note">凭据始终留在本机。网页保存的范围不替代每次执行的独立授权。版本更新会切换接口清单，既有任务与发现保留原版本。</p>${footer("保存项目配置")}</form>`,
});
export const importDialog = (state) => ({
  title: "导入当前版本的接口与规则",
  body: `<form id="importForm"><p class="context-note">当前版本 <strong>${esc(state.project.fields["source-revision"])}</strong>。支持 OpenAPI 3 / Swagger 2 JSON（仅接口），或显式 inventory JSON（接口与业务规则）。不访问规范内的服务器地址。</p>${textarea("document", "接口 / 规则 JSON", JSON.stringify(inventoryExample(state.project.fields["source-revision"]), null, 2), true, 16)}<p class="context-note">每次最多 50 个接口与 50 条规则。拒绝案例需要受控对象、禁止返回的数据断言和同批正向基线。上传的是清单与规则，不是实际凭据。</p>${footer("验证并导入")}</form>`,
});
export const ruleDialog = (state) => ({
  title: "添加明确的业务规则",
  body: `<form id="ruleForm"><label>当前版本接口<select name="endpoint" required>${state.endpoints.map((row) => `<option value="${esc(row.id)}">${esc(row.fields.method)} ${esc(row.fields.path)}</option>`).join("")}</select></label>${input("key", "稳定业务规则键（复测沿用）", "", true)}${input("identity", "本机测试身份名称", "user-a")}${input("object-id", "受控测试对象 ID", "", false)}<label>预期<select name="expectation"><option value="allow">允许，且数据断言满足</option><option value="deny">禁止，且不得返回对象 / 字段</option></select></label>${input("statuses", "预期 HTTP 状态（逗号分隔）", "200")}${textarea("assertions", "允许数据断言 JSON", '[ { "path": "id", "equals": "test-a" } ]', false)}${textarea("forbidden", "禁止数据断言 JSON", "[]", false)}${input("baseline", "拒绝案例的正向基线规则键", "", false)}${textarea("policy-note", "业务依据与预期权限")}${textarea("request-body", "请求 JSON（不需要时填 null）", "null", false)}<label class="choice-row"><input type="checkbox" name="confirmed" required><span>我已确认规则适用性与受控测试数据</span></label><label class="choice-row"><input type="checkbox" name="mutating"><span>该案例会改变状态（本机执行仍需额外明确授权）</span></label>${footer("保存业务规则")}</form>`,
});
export const requestDialog = (state, retest = null) => {
  const project = state.project;
  if (!project)
    return {
      title: "先添加应用项目",
      body: '<p>先登记项目、负责人、当前版本与明确业务边界。</p><button class="button primary" data-action="project">添加应用项目</button>',
    };
  if (project.fields["onboarding-state"] !== "complete" || !project.fields.owner || !project.fields["scope-note"])
    return {
      title: "先完成项目配置",
      body: '<p>发起任务前请确认负责人、版本、环境和业务授权边界。</p><button class="button primary" data-action="project-settings">配置项目</button>',
    };
  if (retest && retest.fields["source-revision"] === project.fields["source-revision"])
    return {
      title: "先指定新的修复版本",
      body: '<p>更新项目版本，导入该版本的相同业务规则，再从原发现创建复测。保留原端点、身份、策略和正向基线的对应关系。</p><button class="button primary" data-action="project-settings">更新项目版本</button>',
    };
  const currentRules = state.rules.filter((row) => row.fields["source-revision"] === project.fields["source-revision"]);
  return {
    title: retest ? "指定修复版本复测" : "创建本机审计任务",
    body: `<form id="requestForm" ${retest ? `data-finding="${esc(retest.id)}"` : ""}><div class="coverage-box"><strong>${esc(project.fields.title)} · ${esc(project.fields["source-revision"])}</strong><p>${esc(project.fields.environment)} · ${esc(project.fields.origin || "尚未指定动态测试 Origin")}</p></div><label>审计方式<select name="mode"><option value="dynamic">有限动态 API 验证（本机执行）</option><option value="offline">源码 / 配置人工审阅（导入结果）</option></select></label>${input("scope-reference", "本次授权引用", project.fields["scope-note"])}<fieldset><legend>明确选择当前版本规则（动态任务最多 5 个端点）</legend>${currentRules.map((row) => `<label class="choice-row"><input type="checkbox" name="rules" value="${esc(row.id)}" checked><span>${esc(row.fields.title)} · ${esc(row.fields.identity)}</span></label>`).join("") || "<p>当前版本暂无规则。请先导入接口与规则；离线审阅可先创建空规则任务。</p>"}</fieldset><p class="context-note">任务仅记录请求，等待本机 Agent 独立核对授权后领取。${retest ? "必须包括原发现的相同业务规则及正向基线；无关案例通过不能关闭问题。" : "浏览器不会向目标发送请求。"}</p>${footer(retest ? "创建版本复测任务" : "创建审计任务")}</form>`,
  };
};
export const cancelDialog = (row) => ({
  title: "停止后续 API 验证",
  body: `<form id="cancelForm" data-record="${esc(row.id)}"><p>停止“${esc(row.fields.title)}”后续请求。已保存的证据与 attempt 历史会保留；当前请求可能等待响应或超时。</p>${footer("停止后续请求")}</form>`,
});
export const settingsDialog = (state) => ({
  title: "帮助与设置",
  body: `<div class="modal-tabs" role="tablist"><button class="button" data-tab="configuration" role="tab" aria-selected="true">项目配置</button><button class="button" data-tab="guide" role="tab" aria-selected="false">使用指南</button><button class="button" data-tab="style" role="tab" aria-selected="false">外观</button></div><section data-panel="configuration"><p>${state.demo ? "演示仅使用当前页面中的合成数据。" : "当前记录保存在此 Busabase 工作区，目标执行凭据只留在本机。"}</p><p>负责人、仓库版本、环境、Origin 与范围均保存在“项目”原生 Base。</p><button class="button primary" data-action="${state.project ? "project-settings" : "project"}">${state.project ? "编辑当前项目配置" : "添加应用项目"}</button><p class="context-note">先确认测试对象和账号属于授权范围。每个任务仍需本机 Agent 独立核对方法、路径、对象与预算。</p></section><section data-panel="guide" hidden><h3>从业务规则到修复验证</h3><ol><li>登记项目、版本与授权范围。</li><li>导入接口，和业务负责人明确允许 / 禁止什么。</li><li>选择规则，创建动态或源码审阅任务。</li><li>在本机调用 Kelly AppSec 执行有限请求，或人工审阅源码后导入结果。</li><li>核对正向基线、对象与字段证据，填写人工复核理由。</li><li>在新的修复版本复测原规则，再导出带限制的报告。</li></ol><h3>正确理解结果</h3><p>HTTP 200 本身不能证明越权；403 本身也不能证明策略有效。拒绝案例需要成功的正向基线和明确禁止数据断言。规则未确认、无证据或执行失败均保留不确定结果。</p><h3>源码审阅</h3><p>由本机 Agent 阅读具体仓库版本、文件行与业务流程，记录推理后导入。首版不宣称支持所有框架的完整 SAST，也不会上传整个私有仓库。</p><h3>原生数据与导出</h3><p>七类数据均可在原生 Base 与表格 View 继续操作。每次每类读取最多 50 条，使用“加载更多”显式翻页；网页报告仅含已加载页。本机 report 命令提供有边界的完整分页导出。</p></section><section data-panel="style" hidden><div id="helpBody"></div></section>`,
});
