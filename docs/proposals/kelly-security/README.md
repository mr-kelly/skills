# Kelly Security — Linux 入侵核查台（已确认并实现）

## 用户价值

客户怀疑 Linux 服务器被入侵，需要尽快知道：有什么入侵证据、入口可能在哪里、影响了哪些机器，以及还有什么没有查清。检查结果必须能回到原始来源，避免把公网扫描、正常运维或缺失日志误判成入侵或安全。

交付到 `mr-kelly/skills` 的 `kelly-security` 是可安装的 Busabase App-in-Skill：复用开源安全 skills 的排查方法，原创多服务器工作台和本机 SSH 执行流程。安装包采用 runtime 资源绑定，兼容安装者选择的 Cloud/Desktop；本提案中的 Desktop 只表示拟用独立 OSS 实例验证，不代表已选定用户的部署环境。

## 用户操作与预期

1. 本机调用 skill，说明授权检查的 SSH 别名、疑似异常时间、已知症状和业务角色。复用操作者现有 SSH 配置，凭据留在本机。
2. 打开 Busabase UI，看服务器列表、最近检查时间、证据覆盖和待复核发现。首次没有服务器时，显示添加 SSH 别名的入口。
3. 勾选服务器和检查包，确认时间范围，发起检查。UI 提交检查请求，本机 Agent 在当前授权范围内领取执行；没有 Agent 时显示“等待本机 Agent”。
4. 观察逐项进度，在矩阵中切换主机；展开检查项，看到采集时间、来源、检查范围、脱敏证据和分析依据。
5. 查看按时间排列的访问、登录、提权、落地文件和持久化事件。关联是调查线索，不能把时间接近直接写成因果。
6. 复核可疑项，记录“确认恶意 / 已解释为正常 / 仍需调查”及理由；导出带证据引用和缺口的报告。

## 用户感知问题

| 用户会遇到什么 | 必须看到的反馈 | 产品目标 |
| --- | --- | --- |
| 全部打绿勾，却没有权限读日志 | 明确的“无权限”、受影响检查项、补证方式 | 未检查不能算通过 |
| 有攻击请求就被告知已入侵 | 请求、服务器响应、后续执行证据分开显示 | 尝试攻击与成功入侵分开判断 |
| 一台机器断开，其他机器也卡住 | 每台主机独立状态、失败时间、重试入口 | 可继续检查其余已选机器 |
| 关掉页面后不知道查到哪 | 从 Busabase 恢复任务和已完成结果 | 进度不是浏览器临时状态 |
| 看到异常但不知道为什么 | 一条发现对应具体检查、证据和时间范围 | 可追溯、可复核 |
| SSH 指纹变化 | 停止连接，解释需通过独立渠道核实 | 不自动信任新主机身份 |
| 当前窗口没有旧日志 | 显示保留范围、轮转文件缺失、时区歧义 | 报告明确尚不能排除的情况 |

## UI 与交互

- 中文优先；采用仓库已有 `graphite` 色族、`desk` 布局、sans 显示字体，提供深浅色切换。
- 左侧：服务器、检查任务、检查清单、发现与证据、帮助和设置。
- 总览：服务器选择器、待复核数、运行中的任务、覆盖缺口；不显示虚构的“安全分”。
- 核心工作区：服务器 × 检查类别状态矩阵，以及逐项清单和证据详情。手机切换为服务器列表 → 检查项 → 详情。
- 检查执行状态与分析结论独立：`未开始 / 执行中 / 完成 / 无权限 / 不适用 / 数据缺失 / 失败 / 已取消`；结论为`未评估 / 未发现异常 / 可疑 / 确认恶意 / 已解释为正常 / 证据不足`。
- “未发现异常”仅适用于本次有覆盖的数据和时间窗口；“已完成”只表示采集步骤结束。
- 刷新、前进后退、详情链接保持服务器、任务、过滤和选中项。加载、空数据、错误、重试、等待 Agent 都有明确文案。

## 检查方法与复用来源

基于社区项目 [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)，固定研究版本 `54a798831d2266a3ca61ce68a7acb80b81160d57`；该项目不是 Anthropic 官方发布。相关文件声明作者 mahipal、Apache-2.0。改编部分保留来源、修改说明和许可，原创 UI 与执行适配按本仓库许可组织。

| 复用的 skill | 用于本产品 | 改编约束 |
| --- | --- | --- |
| [analyzing-linux-system-artifacts](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-linux-system-artifacts/SKILL.md) | 账号、SSH、公钥、系统痕迹与可疑文件 | 不整目录复制 `.ssh`、不默认采集 shadow；不依赖全盘扫描或固定磁盘偏移 |
| [performing-linux-log-forensics-investigation](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/performing-linux-log-forensics-investigation/SKILL.md) | auth/secure、journal、sudo、cron、软件包日志和时间线 | 支持 IPv6、轮转与压缩日志；保留原始时间和时区不确定性 |
| [analyzing-linux-audit-logs-for-intrusion](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-linux-audit-logs-for-intrusion/SKILL.md) | 已存在的 auditd 事件、命令执行、身份与权限变更 | 不新增规则、不调 backlog、不重载服务；无历史审计数据就报告缺口 |
| [analyzing-web-server-logs-for-intrusion](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-web-server-logs-for-intrusion/SKILL.md) | Nginx/Apache 访问和错误日志、入口线索 | 签名命中和 HTTP 200 都不是成功入侵证明；代理来源必须核实 |
| [analyzing-persistence-mechanisms-in-linux](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/analyzing-persistence-mechanisms-in-linux/SKILL.md) | cron、systemd、用户服务、公钥、profile、LD_PRELOAD | 与已知运维基线对比；生成调查发现，不自动删除或禁用 |
| [building-incident-response-playbook](https://github.com/mukul975/Anthropic-Cybersecurity-Skills/blob/54a798831d2266a3ca61ce68a7acb80b81160d57/skills/building-incident-response-playbook/SKILL.md) | 取证、分析、处置建议和交接流程 | 首版只核查和报告；不自动套用隔离、清除、通知动作 |

交叉核对 [UAC 文档](https://tclahr.github.io/uac-docs/) 的易失性优先、采集清单与哈希原则，以及 [NIST SP 800-61r3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) 的检测、分析、响应与恢复边界。UAC/Velociraptor 为可选扩展，不把它们当作已安装依赖或默认上机安装。

首版检查包覆盖：采集上下文、进程、连接、SSH 登录、Web 访问、审计事件、账号与权限、cron/at、systemd、SSH/profile/PAM/动态加载、可疑文件与既有完整性基线、日志覆盖和时间线。先采集易失的进程与连接快照，再做可能耗时的历史日志分析。

## 技术流程与数据图

```text
操作者 → Busabase UI → 检查请求（ChangeRequest）
                         ↓
                  本机 Agent 领取与校验授权
                         ↓
               本机 OpenSSH → 已授权 Linux 主机
                         ↓
               本机证据文件 + 哈希 + 脱敏摘要
                         ↓
            Busabase 检查项 / 证据 / 发现 → UI / 报告
```

新建独立 Folder，包含六个工作 Base：`hosts`（服务器）、`runs`（检查任务）、`checks`（逐项结果）、`evidence`（证据索引）、`findings`（发现与复核）、`settings`（工作台配置与 onboarding）。另有操作指南 Doc、脱敏报告 Drive、AirApp 和同名 skill。六个 Base 的范围需随本蓝图确认，避免用不透明 JSON 混放不同生命周期的数据。

每个检查和发现必须关联一次任务；证据通过检查项回到任务和主机，发现显式引用证据。原始敏感证据是本机受限访问的取证产物，不是另一套工作流数据库。Busabase 保存持久任务、覆盖、复核状态、哈希和脱敏内容；未经明确授权不上传原始日志。

## 执行与安全边界

- UI 只提交已声明的数据动作，不提供任意命令框、Web SSH 终端或浏览器到 localhost 的执行桥。
- 本机 Agent 的当前会话确定可访问主机、时间窗口与检查包；数据库内容不能扩大授权。SSH 别名/目标变化时重新核对范围。
- 使用本机 OpenSSH、现有 agent/密钥和可信 SSH 配置；强制主机身份校验，关闭 agent 转发。UI、Busabase 记录、演示和日志均不收集 SSH 私钥或密码。
- 只运行固定的只读采集配方，严格校验参数，使用参数数组调用 SSH；不拼接来自记录、日志、用户名或文件名的任意 shell。
- SSH 登录、读文件等会留下审计痕迹；报告采集者、工具版本、采集时间、命令、退出状态、截断与权限缺口，不宣称“零痕迹”。
- 不默认安装软件、修改 auditd、防火墙或 SSH、重启、杀进程、删除文件、执行可疑程序或连接可疑远端。sudo 仅使用已获授权的非交互方式；不在 UI 请求密码。
- 每台主机先试运行，默认最多两台并行；单检查设超时和输出上限。达到限制记为不完整，停止/断连/取消有可恢复的状态。
- 任务取消在下一检查开始前生效；重试产生新 attempt，保留历史证据，不覆盖原结果。失联任务不能保持无期限“运行中”。
- 日志和远端文件内容视为不可信数据：不执行其中的指令，不跟随其中 URL，DOM 使用文本渲染并处理控制字符。
- root/内核失陷时，主机上的命令与日志可能不可信；报告信任限制，建议可信离线镜像/既有 EDR/外部日志补证，不能据一次扫描宣布排除入侵。

## 每个节点的场景提示

所有提示正文先指出阅读 `kelly-security` skill，再描述人的任务。每节点两到五条：

| 节点 | 可发起的任务示例 |
| --- | --- |
| Folder / AirApp | 检查我选中的服务器是否有入侵证据；解释目前最值得先查的线索 |
| 服务器 | 加入我指定的 SSH 别名；比较哪些服务器的证据覆盖不足 |
| 检查任务 | 对当前授权的服务器执行本次核查；解释中断或等待 Agent 的任务 |
| 检查项 | 解释此项查了什么及没查到什么；对无权限项给出补证办法 |
| 证据 | 把相关事件按时间排列；校验指定取证产物的哈希与来源 |
| 发现 | 复核此发现是否足以支持入侵判断；根据新证据修订结论并保留理由 |
| 设置 | 确认本次授权范围与日志时间范围；解释本机 SSH 身份与数据存储边界 |
| 指南 Doc | 解释首次核查流程；根据已同意的新规则更新操作指南 |
| 报告 Drive | 导出带证据引用的脱敏报告；检查报告是否明确列出覆盖缺口 |

## Onboarding、权限与读取预算

Onboarding v1 持久保存在 `settings`：调查人/授权说明、选定 SSH 别名、明确的开始结束时间、本机执行模式、证据存储策略。检查可发起前验证这些字段；SSH 身份校验和本机 runner 可用性单独检查，不因勾选 onboarding 自动通过。

每列表每页最多 50 条；待处理 CR 最多 20 条；详情只读指定 id；统计使用服务端 count/groupBy，不取完所有分页。矩阵按选定任务/主机分页，时间线按任务和时间过滤。刷新只取当前页面；Load More 每次只取一页。完整报告为显式批量导出任务。

UI 可读声明资源，可提交新增服务器、请求/取消任务、复核发现的 ChangeRequest；不能 review/merge CR，不能读 Vault 或启动 SSH。操作者是否具有写权限决定请求立即落地还是等待审核，UI 显示真实结果。

## 故障场景与验收测试

| 操作 / 故障注入 | 用户看到什么 | 持久性与边界证明 | 测试 |
| --- | --- | --- | --- |
| 勾选两台机器，只授权其中一台 | 未授权主机被拒绝，原因明确 | SSH 只收到已授权目标；拒绝结果可重读 | runner 集成 |
| SSH 指纹变化 / 不可达 / 权限不足 | 分别显示身份异常、连接失败、无权限 | 不自动接受指纹、不触发降级危险重试 | SSH 参数与隔离 lab |
| 日志缺失、轮转不全、auditd 以前未启用 | 显示具体缺口和覆盖区间 | 结论为证据不足，不出现通过或“未入侵” | 单元 + UI |
| 只有 SQLi 请求或大量失败登录 | 显示攻击尝试，等待后续证据 | 不自动生成确认入侵结论 | 固定日志样本 |
| 登录后出现异常 sudo、落地和 systemd 线索 | 能展开时间线及每条来源 | 同一 run/host 关联，不把不同主机的相近时间合并 | 分析集成 |
| 重复领取 / 刷新 / 中途关闭 / runner 失联 | 同一任务不重复跑，已完成项恢复 | 基于 run/check/attempt 的幂等标识与领取记录；失联显式可恢复 | Busabase 集成 |
| 取消后继续执行下一项 | UI 显示已取消 | 开始每项前检查任务状态；既有证据保留 | runner 集成 |
| 日志含 HTML、终端控制码、指令或凭据 | 只显示安全文本及脱敏结果 | 无脚本执行、无任意命令、无秘密入库 | 单元 + 浏览器 |
| 提交动作返回待审核而非已合并 | 显示等待审核和具体 CR | 不伪造任务已执行或复核已保存 | Busabase 权限集成 |
| 窗口缩至 1280×720 / 390 / 360 | 能选择主机、看检查、返回和复核 | 无横向溢出；刷新和历史恢复上下文 | 浏览器 |

边界验证包括 UI → SDK → ChangeRequest → 重读、任务 → 本机授权 → SSH → 证据哈希、检查结果 → 发现 → 报告，以及真实独立 Busabase 实例中的安装、资源初始化和 AirApp 打开。Cloud/OAuth 和真实客户 SSH 未获目标授权前不执行、不宣称通过。

## 交付顺序与验收

| 优先级 | 用户价值 | 技术工作 | 验收 |
| --- | --- | --- | --- |
| P0 | 可靠回答“有没有入侵证据” | 改编取证配方、日志/时间线、证据与缺口、只读本机 SSH | 固定攻击与正常运维样本可区分，缺数据不打绿勾 |
| P0 | 看得懂多台机器的进度 | Busabase 资源、状态矩阵、清单、证据详情与复核 | 独立安装可读真实记录，断连/重载/手机流程通过 |
| P1 | 能交给客户或响应团队 | 脱敏报告、来源与版本、覆盖区间、后续补证 | 每项判断都有引用与限制；报告可复现 |
| 后续 | 更深入地验证失陷和影响 | 可选 UAC/镜像/既有 EDR/云外部日志适配 | 单独定义资源、授权和采集成本后实施 |

依据的最新创建规范：`busabase/skills@b6db4aaf053453e4deda2a6ef8b78e9abd75db70` 的 `busabase-app-creator`；SDK 版本在实现时从 registry 解析并锁定，不沿用旧脚手架的运行时判断。蓝图已获确认；实现与隔离环境验收记录见技能 README 和仓库 changelog。未连接客户服务器。
