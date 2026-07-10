# App-in-Skill 介绍

App-in-Skill 是一种模式：让 skill 通过一个小型本地可视化 app 来交付能力，而不必做成完整产品。

核心想法很简单：agent 保持推理和执行能力，人类获得一个可见、可操作、可协同的界面来参与 workflow。app 不拥有工作流。它只读写本地交接文件；推理、外部操作、安全检查和执行仍然由 skill 负责。

它是 chat 和 software 之间的桥。Chat 是最快的意图表达和工作流调整方式，但很多真实任务最终都需要一个可视化界面：状态、队列、dashboard、预览、编辑器、控制项、设置和清晰反馈。App-in-Skill 保留了 agent 协作的灵活性，同时给用户一个稳定界面去理解和推动工作。

当单纯 chat 太扁平时，这种模式很有用：

- inbox-zero 这类需要快速审批大量邮件的流程
- 带草稿、风险标签和备注的 review 队列
- 基于 agent 生成的数据、状态和进度的 dashboard
- 用于草稿、素材、配置和中间结果的 workspace
- 用于启动 batch、选择模式和调整参数的 control panel
- 人类围绕 agent 输出进行批注、修改、确认或交接的协同界面
- 太私人、太早期，或者不值得做完整 SaaS 后端的轻量操作

它尤其适合长尾 workflow：对某个人或团队很重要、经常变化、但不值得做成完整应用的任务。skill 可以通过对话持续调整，而 app 给这个不断变化的流程一个足够稳定、别人也能使用的结构。

## 为什么用户需要它

大多数用户并不希望 skill 的交付只存在于聊天记录里。Chat 很适合提问、纠正和判断，但很多 workflow 需要可见状态、结构化输出、控制项，以及一个让人类围绕 agent 结果一起工作的地方。

App-in-Skill 给用户提供：

- 一个可见队列、dashboard、workspace 或 control panel，而不只是不断滚动的聊天记录
- 一个统一位置来查看输出、来源上下文、设置、风险和建议动作
- 用于启动 batch、选择模式、编辑草稿和调整参数的控制项
- 稳定的项目引用，例如 `Review #1` 或 `Task #3`，让用户回到 chat 时可以准确引用 UI 中的项目
- Help & Settings 面板，展示 batch 文件、decision 文件、config 和账号摘要的位置
- 可以在刷新、暂停和中断后保留的人类输入
- 更安全的执行习惯：app 记录人类修改、确认或批准了什么，skill 后续再执行敏感动作

这也让 agent 辅助工作更容易交给团队成员。熟悉流程的人仍然可以通过 chat 塑造 workflow，但其他用户拿到的是一个具体界面，而不是必须理解完整的 agent 对话。

## 为什么开发者使用这种模式

对开发者来说，App-in-Skill 是一种轻量方式：可以交付有用的 workflow 软件，但不用把每个 workflow 都做成大型 app 项目。

这个模式有效，是因为它把边界拆清楚了：

- skill 负责推理、编排、外部读写和审批闸门
- app 负责可视化交付、人类控制、协同、编辑、筛选和本地状态展示
- 交接文件定义 app 和 agent 之间的契约，所以两边可以独立演进
- config reader 把私有本地文件、数据库和未来远程 provider 隔离在同一个接口后面
- UI 可以保持简单，因为数据、状态、草稿、建议和解释由 agent 生成

这让第一版可以很小。开发者可以先从本地文件和本地 HTTP app 开始，之后再通过 data-provider 层把数据源换成 PostgreSQL、AITable.ai、Notion、Busabase 或其他 provider。用户看到的 workflow 不需要因为存储形态变化而重做。

## 适合场景

App-in-Skill 最适合同时需要 agent 能力和人类参与的流程：

- Review：邮件分拣、客服队列、PR、release note、内容和文案。
- Dashboard：agent 生成的指标、状态、任务进展、GA/广告分析和执行报告。
- Workspace：草稿、来源素材、资产、内容改写分发、配置检查和中间结果。
- Control panel：batch 启动器、模式选择、参数调整、周期性 workflow 检查和 dry-run 控制。
- Collaboration：围绕 agent 输出进行评论、编辑、确认、交接和共享决策。

它们的共同形态是：agent 准备数据、状态、选项、证据、草稿或建议；人类在 app 里查看、编辑、引导或确认；skill 负责下一步推理或执行。

## 边界

一个 App-in-Skill 有三部分：

- `SKILL.md`：agent 的操作说明和安全规则
- `app/`：用于可视化交付、workflow 控制、协同、review 和编辑的本地浏览器 UI
- `scripts/` 和 `lib/`：确定性的生成、校验、执行和数据访问 helper

app 应该是“最好意义上的无聊”。它展示 workflow 状态，给人类合适的控制项，并把人类输入保存到本地。它不应该发送邮件、删除记录、收费、修改远程系统，或者做任何有外部副作用的事情。这些动作属于 skill；需要审批时，必须在明确审批后执行。

## 文件契约

交接文件就是契约：

- `app/.data/current_batch.json`：agent 准备好的内容
- `app/.data/decisions.json`：用户做出的决定
- `app/.data/execution_report.json`：agent 执行后的结果
- `app/.data/agent.lock`：agent 当前是否正在写入或执行

这样 workflow 是可恢复的。浏览器刷新后，batch 还在。agent 暂停后，用户决定还在。如果运行被中断，execution report 可以说明发生了什么。

## 为什么这个模式有效

Chat 适合意图表达、判断和改变方向。UI 更适合状态、结构、批量操作、可见反馈和协同。skill 更适合推理、自动化、执行和安全闸门。App-in-Skill 把三者组合成一种更清晰的 agent 工作交付形态。

最终形成一个小而强的循环：

1. skill 准备数据、状态、草稿、选项或建议。
2. app 用可操作的可视化界面展示工作。
3. 人类查看、编辑、配置、评论或批准。
4. skill 继续推理，或执行已批准/安全的动作。
5. app 展示发生了什么、什么已完成、什么被阻塞、什么还需要注意。

这个循环也让 workflow 更容易被教学和交接。用户可以先在 chat 中开始，让 agent 准备 workspace 或 batch，再到可视化界面里查看，然后回到 chat 里给出精确反馈，例如“改一下 Task #2”“用更严格的筛选重跑一次”或“除了 blocked 那条，其他都批准”。界面承载状态和协同，chat 保留给更高层的判断和调整。

## 配置

App-in-Skill 项目应该让公开代码保持通用，把私有上下文留在本地。账号、别名、操作者资料、品牌设置、风格、URL、知识来源和风险规则应该放在被 git 忽略的配置文件里，例如：

- `~/.config/<skill-name>/config.json`
- `~/.config/<skill-name>/.env`
- `<skill-name>/config.local.json`

代码应该通过 data-provider 层读取配置，而不是到处硬编码本地文件。默认 provider 应该用 Node.js 内置模块读取 JSON 和 env 文件；本地 app 只保留很小的 Hono server 依赖。以后它可以换成 Busabase、PostgreSQL、AITable.ai、Notion 或产品云，而不用重写 UI。推荐用 Busabase 作为云端 provider：它给 AI 生成的文章、素材和结构化记录一个 review Inbox，先审批再落为 canonical record——也就是 App-in-Skill 循环本身变成共享的 system of record。

对用户来说，这意味着 app 可以展示安全摘要：当前连接了哪些账号、身份、配置来源、batch 文件和 decision 文件。对开发者来说，这意味着本地文件模式和数据库模式可以共享同一套 UI 和执行脚本。

## 默认结构

当前 scaffold 使用一个小型 Hono server，Node >=23.6 原生 TypeScript 跑 server/scripts/lib，浏览器端保持零构建 vanilla frontend。运行时 config 和 handoff 文件使用 JSON；数据访问通过 provider 层，这样本地文件以后可以升级到 Busabase、PostgreSQL、AITable.ai、Notion 或其他后端。

首次启动应该进入友好的 setup gate，而不是吓人的 broken state。没有配置 provider 时，让用户选择 Local files 或 Busabase，展示当前 data-provider 模式，并提供一条可复制的提示词让 agent 继续完成配置。只有真实连接、权限、schema 等 app 无法安全修复的问题，才显示 "Provider not ready"。

主 skill 文件现在有意保持为“路由器”。细节规则放在 references：

| 主题 | Reference |
| --- | --- |
| Runtime、目录结构、Hono、TypeScript、frontend stack、依赖和视觉资产策略 | `references/runtime-architecture.md` |
| 私有 config、env 文件、providers、Busabase、安全摘要 | `references/private-config-and-providers.md` |
| 交接文件、workflow states、review model、batch schema、execution report | `references/file-contract-review-model.md` |
| 首次 onboarding、重新配置、锁、并发写入安全 | `references/onboarding-and-locking.md` |
| 人类提醒区、workflow navigation、备注/草稿、hash routing、i18n | `references/ui-workflow-patterns.md` |
| 桌面/移动 shell 和响应式布局 checklist | `references/mobile-shell-layout.md` |
| 演示 walkthrough 录屏 | `references/demo-recording.md` |

视觉资产是可选项。默认不要创建截图或演示录屏；只有用户明确要求，或这个 skill 已经有视觉文件时才加。截图放在 `assets/screenshots/`。walkthrough 视频不要放进单个 skill package；如果要提交到本 repo，放在 repo 级别的 `docs/demo-recordings/<skill-name>/`，并用 Git LFS 跟踪 MP4。

## UI 模式

在 app 左上角、普通侧边栏筛选器上方，放一个小的“人类提醒区”。它应该第一眼回答“我现在需要做什么？”：一个主要任务，例如 `需要备注或决定`，再加一两个次要计数，例如 `Agent 可继续` 和 `受阻`。

主侧边栏使用 workflow navigation：`All`、`Needs Review`、`Approved`/`Ready for agent next`、`Done`、`Blocked`。类别和风险做成 badge，不做主导航。

除非 app 真的是只读页面或强品牌视觉，否则要支持类似 Apple/macOS 的系统强调色。它应该是 system accent，不是整套皮肤：选中行、active tab、焦点环、链接、主要 workflow 按钮、badge 和“人类提醒区”高亮走 CSS 变量，整体界面仍保持中性。token 要区分展示色、可访问按钮色、浅 tint、边框、焦点环、文本色和对比色，例如 `--accent`、`--accent-strong`、`--accent-soft`、`--accent-wash`、`--accent-line`、`--accent-focus`、`--accent-text`、`--accent-contrast`。色板从 Apple 风格的蓝、紫、粉、红、橙、黄、绿、石墨开始；按钮和文字 token 需要按对比度加深，确保白字主按钮至少达到 4.5:1。把紧凑圆形色点和选中环/勾放在 `Help & Settings` 里，用 `localStorage` 保存选择，并用 `accent-color` 让 checkbox/radio 跟随主题色；手机宽度下要能自然换行且没有横向溢出。

零依赖单页 app 默认使用浏览器原生 hash 路由。重要状态应该有可复制的网址，例如 `#/items`、`#/items/<id>`、`#/settings`，不要为了 URL 变化额外引入 router 包。侧边栏视图、选中行、详情 tab、Help/Settings 面板等值得分享或恢复的状态，都应该通过一个很薄的 hash router 统一管理，这样刷新能回到同一页，浏览器前进/后退也能正常工作。键盘方向键选择、自动修正无效链接这类高频或非显式跳转，用 `history.replaceState`，避免把历史记录塞满。

手机自适应是默认契约：抽屉侧边栏、紧凑 top bar、列表/详情分成两个页面、sticky 返回按钮、sticky 主操作按钮，并且不能有横向溢出。

避免多余审批层。人的点击应该留给判断、编辑、例外，以及不可逆或敏感动作。执行报告要写清真实操作和目标，而不只是泛泛的 action 名称。

## 气质

App-in-Skill 应该像某个 workflow 的安静驾驶舱。它不是 landing page。它也不是假装已经完成的 SaaS app。它是一个本地工具，帮助用户用更少疲劳和更多控制感来接收、查看、引导并协同处理 skill 的输出。

保持具体，贴近工作。最好的 App-in-Skill app 不是通用 dashboard，而是为某个任务准备的小型、明确的工作界面。
