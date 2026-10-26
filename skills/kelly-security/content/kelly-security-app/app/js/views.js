import { appConfig } from "./config.js";
import { date, esc, label, latestChecks, ref, tone } from "./model.js";

export const pill = (value) =>
  `<span class="pill is-${tone(value)}"><span class="status-dot" aria-hidden="true"></span>${esc(label(value))}</span>`;
const empty = (title, text) =>
  `<div class="empty-state"><span class="empty-mark" aria-hidden="true">◇</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
const button = (action, title, primary = false) =>
  `<button class="button ${primary ? "primary" : ""}" data-action="${action}">${title}</button>`;
const more = (state, key) =>
  state.cursors[key]
    ? `<button class="button load-more" data-more="${key}">加载更多${esc(appConfig.bases.find((entry) => entry.key === key)?.name || "记录")}</button>`
    : "";
const runName = (state, run) =>
  state.hosts.find((host) => host.id === ref(run?.fields.host))?.fields.title || "服务器未加载";
const runSelect = (state) =>
  `<label class="run-picker"><span class="sr-only">选择检查任务</span><select id="runSelect"><option value="">选择一次检查</option>${state.runs.map((row) => `<option value="${esc(row.id)}" ${row.id === state.runId ? "selected" : ""}>${esc(runName(state, row))} · ${esc(label(row.fields.status))}</option>`).join("")}</select></label>`;
const shortNames = ["上下文", "进程", "连接", "登录", "Web", "审计", "账号", "cron", "systemd", "认证", "文件", "日志"];
const matrix = (state) =>
  `<section class="matrix-region"><div class="section-heading"><h2>服务器 × 检查项</h2><span class="muted">当前批次 · 点开查看证据</span></div><div class="matrix-scroll"><table class="matrix"><thead><tr><th scope="col">服务器</th>${shortNames.map((name) => `<th scope="col">${name}</th>`).join("")}</tr></thead><tbody>${state.hosts
    .map((host) => {
      const run = state.runs.find(
        (row) => ref(row.fields.host) === host.id && (!state.batch || row.fields["batch-reference"] === state.batch),
      );
      const map = latestChecks(state.checks.filter((row) => ref(row.fields.run) === run?.id));
      return `<tr><th scope="row"><span>${esc(host.fields.title)}</span><small>${esc(host.fields.role || "尚未备注业务角色")}</small></th>${appConfig.checks
        .map((check) => {
          const result = map.get(check.id);
          const value = result?.fields.conclusion || "pending";
          const status = result?.fields.status || "pending";
          const stateValue = status !== "completed" ? status : value;
          const glyph =
            status === "running"
              ? "◌"
              : status !== "completed"
                ? "—"
                : value === "suspicious"
                  ? "!"
                  : value === "no-indicators"
                    ? "✓"
                    : "?";
          const href = run
            ? `#/checklist?run=${encodeURIComponent(run.id)}&item=${encodeURIComponent(check.id)}`
            : "#/runs";
          return `<td><a class="matrix-cell is-${tone(stateValue)} ${status === "running" ? "is-running" : ""}" href="${href}" aria-label="${esc(`${host.fields.title}，${check.name}，${label(stateValue)}`)}" title="${esc(`${check.name}：${label(stateValue)}`)}">${glyph}</a></td>`;
        })
        .join("")}</tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="legend"><span><i class="status-dot positive"></i>本次未发现异常</span><span><i class="status-dot danger"></i>可疑线索</span><span><i class="status-dot warning"></i>需要补证</span><span>— 未完成检查</span></div><p class="caption">仅展示已加载的当前批次结果；空白不代表安全。${Object.values(state.cursors).some(Boolean) ? "仍有未加载记录。" : ""}</p></section>`;
const hostCards = (state) =>
  state.hosts.length
    ? `<div class="host-list">${state.hosts.map((host) => `<article class="host-row"><label class="host-select"><input type="checkbox" data-host="${esc(host.id)}" ${state.selected.has(host.id) ? "checked" : ""} aria-label="选择${esc(host.fields.title)}"><span class="host-avatar" aria-hidden="true">▤</span><span><strong>${esc(host.fields.title)}</strong><small>${esc(host.fields.role || "尚未备注业务角色")} ${host.fields["is-example"] ? "· 示例" : ""}</small></span></label><span class="host-last">${host.fields["last-checked-at"] ? date(host.fields["last-checked-at"]) : "尚未检查"}</span>${pill(host.fields.summary || "unassessed")}<button class="button compact" data-host-runs="${esc(host.id)}">查看检查</button></article>`).join("")}</div>${more(state, "hosts")}`
    : empty("添加第一台服务器", "只填写本机已有的 SSH 别名，凭据保留在本机。");
const toolbar = (title, actions = "") =>
  `<div class="view-toolbar"><h1>${title}</h1><div class="toolbar-actions">${actions}</div></div>`;

const overview = (state) =>
  `<section id="overviewPage" class="overview-page"><div class="page-hero"><div><p class="eyebrow">LINUX INCIDENT TRIAGE · 入侵核查</p><h1>先找到证据，再下判断。</h1><p class="lede">从访问记录到持久化痕迹，逐项查清服务器发生了什么。</p></div>${button("request", "＋ 发起检查", true)}</div><div class="metric-band metrics"><div><span>正在检查</span><strong>${state.summary.running ?? "—"}</strong></div><div><span>结论需要补证</span><strong>${state.summary.gaps ?? "—"}</strong></div><div><span>已索引证据</span><strong>${state.summary.evidence ?? "—"}</strong></div></div>${state.hosts.length ? matrix(state) : empty("还没有服务器", "添加你已获授权的 SSH 别名，开始第一轮入侵核查。")}<div class="section-heading"><h2>本次关注的服务器</h2><div>${button("add-host", "添加服务器")}</div></div>${hostCards(state)}</section>`;

const checklist = (state) => {
  const map = latestChecks(state.checks.filter((row) => ref(row.fields.run) === state.runId));
  const selected = appConfig.checks.find((check) => check.id === state.item) || appConfig.checks[0];
  const result = map.get(selected.id);
  const proof = state.evidence.filter((row) => ref(row.fields.check) === result?.id);
  return `${toolbar("检查清单", `${runSelect(state)}${button("export", "导出已加载报告")}`)}${
    !state.runId
      ? empty("选择一次检查任务", "任务创建后会等待本机 Agent 领取，页面本身不会连接服务器。")
      : `<div class="workspace"><section class="list-panel" aria-label="检查项目"><div class="list-meta">12 项固定检查 · 采集和判断分别记录</div>${appConfig.checks
          .map((check, index) => {
            const row = map.get(check.id);
            return `<a class="check-row ${selected.id === check.id ? "selected" : ""}" href="#/checklist?run=${encodeURIComponent(state.runId)}&item=${check.id}"><span class="check-index">${String(index + 1).padStart(2, "0")}</span><span class="check-copy"><strong>${esc(check.name)}</strong><small>${esc(label(row?.fields.status || "pending"))}</small></span>${pill(row?.fields.conclusion || "unassessed")}</a>`;
          })
          .join(
            "",
          )}${more(state, "checks")}</section><section class="detail-panel ${state.item ? "detail-visible" : ""}" aria-label="检查详情"><a class="back-to-list" href="#/checklist?run=${encodeURIComponent(state.runId)}">← 返回检查清单</a><p class="eyebrow">检查 ${String(appConfig.checks.indexOf(selected) + 1).padStart(2, "0")}</p><h2>${esc(selected.name)}</h2>${pill(result?.fields.conclusion || "unassessed")}<p class="detail-summary">${esc(result?.fields.summary || "等待本机 Agent 执行此项检查。")}</p><dl class="facts"><div><dt>采集状态</dt><dd>${esc(label(result?.fields.status || "pending"))}</dd></div><div><dt>采集时间</dt><dd>${date(result?.fields["observed-at"])}</dd></div><div><dt>事件时间范围</dt><dd>${result?.fields["coverage-start"] ? `${date(result.fields["coverage-start"])} — ${date(result.fields["coverage-end"])}` : "尚未测得；调查时间范围不等于日志覆盖范围"}</dd></div></dl>${result?.fields["coverage-note"] ? `<div class="coverage-box"><strong>证据覆盖缺口</strong><p>${esc(result.fields["coverage-note"])}</p></div>` : ""}<h3>证据与来源</h3>${proof.length ? proof.map(evidenceCard).join("") : `<p class="muted">${result ? "当前页面尚未加载关联证据。可加载更多证据或查看完整报告。" : "执行后会显示脱敏证据、来源与采集校验信息。"}</p>`}${more(state, "evidence")}</section></div>`
  }`;
};
const evidenceCard = (row) =>
  `<article class="evidence-card"><strong>${esc(row.fields.title)}</strong><div class="source-line">${esc(row.fields["source-locator"])} · ${row.fields["event-time"] ? date(row.fields["event-time"]) : "事件时间不确定"}</div><pre>${esc(row.fields["redacted-excerpt"])}</pre><details><summary>来源与完整性说明</summary><p>${esc(row.fields["redaction-note"] || "请核对本机原始取证产物。")}</p><p class="mono">SHA-256 ${esc(row.fields.sha256 || "未记录")}</p><p>${esc(row.fields["time-confidence"])}</p></details></article>`;
const selectedEvidence = (state) => {
  const checks = new Set(state.checks.filter((row) => ref(row.fields.run) === state.runId).map((row) => row.id));
  return state.evidence.filter((row) => checks.has(ref(row.fields.check)));
};
const timeline = (state) => {
  const evidence = selectedEvidence(state);
  return `${toolbar("证据时间线", `${runSelect(state)}${button("export", "导出已加载报告")}`)}<div class="timeline-scroll"><p class="context-note">按所选服务器已记录的事件时间排列。时间接近不代表因果；未知时间的证据单列。</p>${
    evidence.length
      ? [...evidence]
          .sort((a, b) => String(a.fields["event-time"] || "z").localeCompare(String(b.fields["event-time"] || "z")))
          .map(
            (row) =>
              `<div class="timeline-row"><div class="timeline-date">${row.fields["event-time"] ? date(row.fields["event-time"]) : "时间待确认"}<span class="timeline-node"></span></div>${evidenceCard(row)}</div>`,
          )
          .join("")
      : empty("暂无已加载证据", "先选择检查任务；没有证据不能据此判断服务器安全。")
  }${more(state, "evidence")}</div>`;
};
const findings = (input) => {
  const state = { ...input };
  Object.assign(state, {
    ...state,
    findings: state.findings.filter((row) => ref(row.fields.run) === state.runId),
    evidence: selectedEvidence(state),
  });
  const selected = state.findings.find((row) => row.id === state.item) || state.findings[0];
  return `${toolbar("发现与复核", runSelect(state))}${
    !state.findings.length
      ? empty("当前没有已加载的发现", "查看证据覆盖缺口，并确认相关检查已执行。")
      : `<div class="workspace"><section class="list-panel">${state.findings.map((row, index) => `<a class="finding-row ${selected?.id === row.id ? "selected" : ""} ${state.flash === row.id ? "verdict-flash" : ""}" href="#/findings?run=${encodeURIComponent(state.runId)}&item=${encodeURIComponent(row.id)}"><small>发现 ${String(index + 1).padStart(2, "0")} · 优先级 ${esc(label(row.fields.severity))}</small><strong>${esc(row.fields.title)}</strong>${pill(row.fields.verdict)}</a>`).join("")}${more(state, "findings")}</section><section class="detail-panel ${state.item ? "detail-visible" : ""}"><a class="back-to-list" href="#/findings?run=${encodeURIComponent(state.runId)}">← 返回发现列表</a><p class="eyebrow">需要你的判断</p><h2>${esc(selected.fields.title)}</h2><div class="assessment-pair"><div><small>自动分析</small>${pill(selected.fields.conclusion)}</div><div><small>人工复核</small>${pill(selected.fields.verdict)}</div></div><p class="detail-summary">${esc(selected.fields.reasoning)}</p><div class="coverage-box"><strong>目前还不能确认什么</strong><p>${esc(selected.fields.limitations || "尚未记录限制，请先补充。")}</p></div><h3>建议下一步</h3><p>${esc(selected.fields["next-step"] || "关联原始证据与已知运维记录。")}</p><form id="reviewForm" data-record="${esc(selected.id)}" class="review-form"><label for="reviewNote">复核理由</label><textarea id="reviewNote" name="review-note" rows="3" required placeholder="说明判断依据、已核实的业务情况或需要补充的证据。">${esc(selected.fields["review-note"] || "")}</textarea><div class="detail-actions-top"><button class="button" name="verdict" value="explained-benign">已解释为正常</button><button class="button" name="verdict" value="needs-investigation">仍需调查</button><button class="button primary" name="verdict" value="confirmed-malicious">确认恶意</button></div></form><h3>关联证据</h3>${
          state.evidence
            .filter((row) =>
              (Array.isArray(selected.fields.evidence)
                ? selected.fields.evidence
                : [selected.fields.evidence]
              ).includes(row.id),
            )
            .map(evidenceCard)
            .join("") || '<p class="muted">关联证据尚未加载，请加载更多或查看完整报告。</p>'
        }</section></div>`
  }`;
};
const runs = (state) =>
  `${toolbar("检查任务", `${button("refresh", "刷新")}${button("request", "发起检查", true)}`)}<div class="record-scroll">${state.runs.length ? `<table class="record-table"><thead><tr><th>服务器与任务</th><th>执行状态</th><th>调查时间范围</th><th>下一步</th></tr></thead><tbody>${state.runs.map((row) => `<tr><td><a href="#/checklist?run=${encodeURIComponent(row.id)}">${esc(runName(state, row))}</a><small>${esc(row.fields.title)}</small></td><td>${pill(row.fields.status)}${row.fields.status === "running" && Date.now() - Date.parse(row.fields["heartbeat-at"] || "") > 120000 ? '<small class="warning-text">本机 Agent 心跳过期，需检查并显式恢复。</small>' : ""}</td><td>${date(row.fields["window-start"])}<small>至 ${date(row.fields["window-end"])}</small></td><td>${["requested", "running"].includes(row.fields.status) ? `<button class="button compact" data-cancel="${esc(row.id)}">停止后续检查</button>` : `<a href="#/checklist?run=${encodeURIComponent(row.id)}">查看结果 →</a>`}</td></tr>`).join("")}</tbody></table>` : empty("尚无检查任务", "选择已授权服务器与时间范围，发起第一轮核查。")}${more(state, "runs")}</div>`;

export const renderView = (state) => {
  if (state.error)
    return `<div class="empty-state"><h1>工作台暂时无法读取数据</h1><p>${esc(state.error)}</p>${button("refresh", "重新读取")}</div>`;
  if (state.loading) return empty("正在读取核查记录…", "每次读取一页，不扫描整个工作区。");
  if (state.view === "hosts")
    return `${toolbar("服务器", `${button("add-host", "添加服务器")}${button("request", `检查选中服务器${state.selected.size ? ` (${state.selected.size})` : ""}`, true)}`)}<div class="record-scroll">${hostCards(state)}</div>`;
  if (state.view === "runs") return runs(state);
  if (state.view === "checklist") return checklist(state);
  if (state.view === "timeline") return timeline(state);
  if (state.view === "findings") return findings(state);
  return overview(state);
};
