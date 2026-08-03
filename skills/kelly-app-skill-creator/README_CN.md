# Kelly App Skill Creator

Kelly App Skill Creator 把人类与 Agent 的日常协作流程制作成 Busabase-backed App-in-Skill。

每个生成的 skill 都必须把完整应用项目保存在 `app/`，并默认把同一套源码部署为 Busabase AirApp。`pnpm dev` 仍然可用，但只有用户明确要求本地预览或调试时才启动。持久化配置、工作流状态、决策、任务认领和业务数据全部通过 `busabase-sdk` 读写；本地文件和浏览器存储不是备用数据后端。AirApp 运行时、框架、SDK、安全与部署限制只由 `$busabase-app-creator` 定义。

它强制依赖：

- `$busabase`：连接、节点发现、ChangeRequest 与审批；
- `$busabase-app-creator`：Busabase 资源建模、Vault 安全边界、AirApp 约束、验证、同步与部署。

默认流程是 Research -> Plan -> Action -> Retrospective。这个 skill 拥有完整的产品 UI 契约：信息架构、人工注意力侧栏、工作流导航、桌面列表/详情布局、hash 路由、Help & Settings、无障碍、手机抽屉与独立详情流程，以及桌面和 390/360px 宽度的视觉验收。只有 AirApp 运行时工程委托给 `$busabase-app-creator`。

运行时 readiness 与产品 onboarding 是两个独立的 Busabase-backed 状态。生成的应用把操作人上下文、策略、来源、计划、审阅决定、Agent claim 和执行结果保存在合适的 Busabase 原生资源中。AirApp 通过 ChangeRequest 记录可审阅的人类输入；需要 Vault 和外部副作用的执行由可信 Agent 或 Workflow 承担。

正常验收路径是在 Busabase 内运行已合并的 AirApp，并返回可点击的 AirApp 链接。只有明确要求本地预览时，独立应用才显示 Cloud / 自定义服务器连接页，用户点击一次即可进入浏览器 OAuth，同时保留明确标注的只读 Demo 入口；不要求 CLI 登录或输入 API key。OAuth 完成后，只有一个可用 Space 时自动选择；有多个 Space 时必须先用原生 selector 明确选择，之后才允许初始化资源。开源版只有 `local` Space，不显示 selector。OAuth token 只保存在 `~/.busabase/airapps` 下按 AirApp 隔离、仅当前用户可读的本地登记文件中；部署后的 AirApp 直接使用 Busabase ambient session 和当前 Space。
