import { date, esc, readiness } from "./model.js";

const input = (name, title, value = "", required = true, type = "text") =>
  `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
const footer = (label) =>
  `<p id="dialogError" class="form-error" role="alert"></p><div class="form-footer"><button type="button" class="button" data-action="close-dialog">取消</button><button class="button primary" type="submit">${label}</button></div>`;
const localInput = (instant) => {
  const d = new Date(instant);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const hostDialog = () => ({
  title: "添加服务器",
  body: `<form id="hostForm">${input("title", "服务器名称", "", true)}${input("ssh-alias", "本机已有的 SSH 别名", "", true)}${input("role", "业务角色", "", false)}<label>授权说明<textarea name="scope-note" rows="3" required placeholder="谁授权了这台服务器的检查，以及允许的范围。"></textarea></label><p class="context-note">复用本机 SSH 配置和主机身份校验。这里不接收密码、私钥或 sudo 密码。</p>${footer("保存服务器")}</form>`,
});
export const requestDialog = (state) => {
  const settings = state.settings[0];
  if (!readiness(settings))
    return {
      title: "先确认核查范围",
      body: '<p>发起检查前，请在帮助与设置中保存调查负责人、授权说明和证据存储规则。</p><div class="form-footer"><button class="button primary" data-action="open-settings">打开设置</button></div>',
    };
  const now = new Date();
  return {
    title: "发起入侵核查",
    body: `<form id="requestForm"><fieldset><legend>选择已获授权的服务器</legend>${
      state.hosts
        .filter((host) => state.demo || host.fields["is-example"] !== true)
        .map(
          (host) =>
            `<label class="choice-row"><input type="checkbox" name="hosts" value="${esc(host.id)}" ${state.selected.has(host.id) ? "checked" : ""}><span>${esc(host.fields.title)}</span></label>`,
        )
        .join("") || "<p>请先添加实际服务器；示例主机不会执行检查。</p>"
    }</fieldset>${input("since", "调查开始时间（本机时区）", localInput(now.getTime() - 7 * 86400000), true, "datetime-local")}${input("until", "调查结束时间（本机时区）", localInput(now), true, "datetime-local")}${input("scope-reference", "本次授权引用", settings.fields["scope-note"])}<div class="coverage-box"><strong>12 项入侵证据检查</strong><p>进程与连接 → 登录与访问 → 账号与持久化 → 日志覆盖和时间线。</p></div><p class="context-note">请求保存后等待本机 Agent 领取。Agent 会再次核对当前会话授权；本页面不会连接服务器。</p>${footer(state.demo ? "模拟创建检查请求" : "创建检查请求")}</form>`,
  };
};
export const settingsDialog = (state) => {
  const settings = state.settings[0]?.fields || {};
  return {
    title: "帮助与设置",
    body: `<div class="modal-tabs" role="tablist"><button class="button" data-tab="configuration" role="tab" aria-selected="true">核查配置</button><button class="button" data-tab="guide" role="tab" aria-selected="false">操作指南</button><button class="button" data-tab="style" role="tab" aria-selected="false">外观</button></div><section data-panel="configuration"><p class="context-note">${state.demo ? "演示数据只保留在当前页面。" : "工作流状态保存在当前 Busabase 工作区。SSH 凭据始终留在本机。"}</p><form id="settingsForm">${input("operator", "调查负责人", settings.operator)}<label>授权说明<textarea name="scope-note" rows="3" required>${esc(settings["scope-note"] || "")}</textarea></label><label>证据处理规则<textarea name="evidence-policy" rows="3" required>${esc(settings["evidence-policy"] || "原始证据留在本机受限目录；仅同步脱敏摘要、索引与哈希。")}</textarea></label><p class="context-note">执行方式：本机 Agent + 已核实身份的 SSH。配置完成后仍需逐次核对主机和调查时间范围。</p>${footer("保存核查配置")}</form></section><section data-panel="guide" hidden><h3>从怀疑到可复核的证据</h3><ol><li>添加你已获授权的 SSH 别名。</li><li>选定服务器与调查时间，发起检查。</li><li>在本机调用 Kelly Security，领取并执行核查任务。</li><li>逐项查看缺口、来源和事件时间线。</li><li>记录复核理由，导出脱敏报告。</li></ol><h3>如何理解结果</h3><p>“采集完成”表示检查步骤结束。“本次未发现异常”仅描述已覆盖的数据。失败登录、可疑请求和 HTTP 200 不能单独证明成功入侵。</p><h3>原始证据在哪里</h3><p>由本机 Agent 保存在受限目录。页面展示脱敏摘要和完整性信息；不会上传私钥、密码或原始日志。</p><p class="context-note">当前页面读取上限：每类 50 条。仍有分页时，使用“加载更多”。页面导出的报告会标明只包含已加载数据。</p></section><section data-panel="style" hidden><div id="helpBody"></div></section>`,
  };
};
export const cancelDialog = (run) => ({
  title: "停止后续检查",
  body: `<p>将停止“${esc(run.fields.title)}”尚未开始的检查。已采集证据会保留；正在执行的只读检查可能需要完成或超时后返回。</p><p class="muted">调查开始：${date(run.fields["window-start"])}</p><form id="cancelForm" data-record="${esc(run.id)}">${footer("停止后续检查")}</form>`,
});
