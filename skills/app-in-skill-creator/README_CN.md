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

代码应该通过 data-provider 层读取配置，而不是到处硬编码本地文件。默认 provider 应该只用 Node.js 内置模块读取 JSON 和 env 文件，让新的 App-in-Skill 从一开始就是零 npm 依赖。以后它可以换成 Busabase、PostgreSQL、AITable.ai、Notion 或产品云，而不用重写 UI。推荐用 Busabase 作为云端 provider：它给 AI 生成的文章、素材和结构化记录一个 review Inbox，先审批再落为 canonical record——也就是 App-in-Skill 循环本身变成共享的 system of record。

对用户来说，这意味着 app 可以展示安全摘要：当前连接了哪些账号、身份、配置来源、batch 文件和 decision 文件。对开发者来说，这意味着本地文件模式和数据库模式可以共享同一套 UI 和执行脚本。

## 默认结构

除非 skill 有强理由使用其他技术，否则本地 server 和脚本默认使用 Node.js。默认 scaffold 应该没有 npm 依赖：不生成 `package.json`，不要求 `npm install`，不引入框架。HTTP、文件、路径、锁、启动、JSON 解析和校验都用 Node 内置模块完成。只有在确实需要 IMAP/SMTP、MIME 解析、OAuth/API client、文档解析、浏览器自动化或数据库 driver 这类外部集成时，才添加依赖，并且依赖应该留在集成/adapter 层，不要污染基础本地 app。

```text
skill-name/
├── SKILL.md
├── agents/openai.yaml
├── app/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── start.sh
│   └── server/
├── lib/
│   ├── paths.mjs
│   ├── common.mjs
│   └── data-provider/
├── scripts/
├── references/
└── config.example.json
```

共享代码放在 `lib/`。`scripts/` 保持为薄入口。真实配置、secret、handoff 数据文件（`app/.data/`）和生成的本地状态不要提交到 git。零依赖 skill 默认使用 JSON 作为运行时配置；只有当 skill 明确接受 YAML 解析器依赖，或先把 YAML 转成 JSON 后再运行时，才使用 YAML。

## UI 模式

在 app 左上角、普通侧边栏筛选器上方，放一个小的“人类提醒区”。它应该第一眼回答“我现在需要做什么？”：一个最主要的人类任务，例如“需要备注或决定”，再加一两个次要计数，例如“Agent 可继续”和“受阻”。提醒区下面加一条分隔线，再进入普通视图。

避免多余的批准层。如果一个项目已经有安全、明确的下一步，就直接显示为已批准/Agent 可继续，而不是让人再点一次 `To approve` 之类的中间状态。人的点击应该留给判断、编辑、例外和不可逆动作。

执行报告要写清真实操作和目标，而不只是泛泛的 action 名称。如果 connector 需要文件夹、频道、路径、账号 id 或其他目标，但配置缺失，就阻塞并要求补配置，不要猜。

## 气质

App-in-Skill 应该像某个 workflow 的安静驾驶舱。它不是 landing page。它也不是假装已经完成的 SaaS app。它是一个本地工具，帮助用户用更少疲劳和更多控制感来接收、查看、引导并协同处理 skill 的输出。

保持具体，贴近工作。最好的 App-in-Skill app 不是通用 dashboard，而是为某个任务准备的小型、明确的工作界面。
