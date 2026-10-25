# Kelly Security · Linux 入侵核查台

客户怀疑服务器被入侵时，先核查证据，再判断入口与影响。通过本机 Agent 执行 SSH，
在 Busabase 中查看多服务器检查清单、证据时间线、采集缺口与人工复核结论。

![多服务器入侵核查矩阵](assets/screenshots/overview-dark-zh-CN.webp)

![逐项检查与来源证据](assets/screenshots/checklist-zh-CN.webp)

[观看 10 秒复核演示](assets/recordings/review-zh-CN.mp4)。截图和录像均使用合成数据。

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
