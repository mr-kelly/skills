# Kelly Security · Linux 入侵核查台

客户怀疑服务器被入侵时，先核查证据，再判断入口与影响。通过本机 Agent 执行 SSH，
在 Busabase 中查看多服务器检查清单、证据时间线、采集缺口与人工复核结论。

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/cover-zh-CN.webp" alt="Linux 入侵核查台"></td>
    <td width="50%"><img src="assets/screenshots/overview-zh-CN.webp" alt="核查总览"></td>
  </tr>
  <tr>
    <td><strong>Linux 入侵核查台</strong><br>多服务器检查、证据与复核。</td>
    <td><strong>核查总览</strong><br>对比每台服务器的十二项核查状态。</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/hosts-zh-CN.webp" alt="服务器清单"></td>
    <td width="50%"><img src="assets/screenshots/runs-zh-CN.webp" alt="检查任务"></td>
  </tr>
  <tr>
    <td><strong>服务器清单</strong><br>管理已授权 SSH 主机和业务角色。</td>
    <td><strong>检查任务</strong><br>区分等待本机 Agent、执行中与证据缺口。</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checklist-zh-CN.webp" alt="逐项检查"></td>
    <td width="50%"><img src="assets/screenshots/timeline-zh-CN.webp" alt="证据时间线"></td>
  </tr>
  <tr>
    <td><strong>逐项检查</strong><br>展开每项检查的证据来源与覆盖范围。</td>
    <td><strong>证据时间线</strong><br>关联登录、访问、执行与持久化线索。</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/findings-zh-CN.webp" alt="发现与复核"></td>
    <td width="50%"><img src="assets/screenshots/findings-mobile-zh-CN.webp" alt="手机复核"></td>
  </tr>
  <tr>
    <td><strong>发现与复核</strong><br>核对证据后记录人工结论及理由。</td>
    <td><strong>手机复核</strong><br>在手机上查看证据并完成复核。</td>
  </tr>
</table>

[观看 22 秒完整导览](assets/recordings/kelly-security-zh-CN.mp4) · [10 秒复核操作](assets/recordings/review-zh-CN.mp4)。截图和录像均使用合成数据。

选择已获授权的服务器和调查时间范围，发起 12 项固定检查。界面只提交请求，由本机
Agent 再次核对授权后执行；没有 Agent 时明确显示等待。SSH 凭据保留本机。

检查覆盖进程、连接、SSH 登录、Web 访问/错误、既有审计、账号权限、cron/at、systemd、
认证持久化、选定文件与日志覆盖。每条发现可以回到来源、时间和原始取证文件哈希。
原始敏感证据保留本机受限目录，只同步脱敏摘要。

复核时同时保留自动分析和人工结论及理由。页面可导出已加载数据的报告；完整报告由
本机 Agent 显式批量导出。权限不足、缺失日志和截断会单独显示，不会当成检查通过。

安装：`npx skills add mr-kelly/skills --skill kelly-security`。完整流程见 [SKILL.md](SKILL.md)，
排查方法与开源许可见 [upstream.md](references/upstream.md)。

真实 OpenSSH、独立 OSS Busabase、响应式浏览器和合成日志已分别验证。实验室结果不代表
已检查客户服务器；采集完成或没有规则命中，也不能证明从未被入侵。隔离、删除、重启、
修改配置和轮换凭据都不是默认动作。
