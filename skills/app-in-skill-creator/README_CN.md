# App-in-Skill 介绍

App-in-Skill 是一种模式：当一个 skill 需要一个小型的人类 review 界面，但又不值得做成完整产品时，可以把本地 app 放进 skill 里。

核心想法很简单：agent 继续负责真正复杂的工作，用户通过一个本地 app 来 review、审批、批注和修改批量任务。app 不拥有工作流。它只读写本地交接文件；推理、外部操作、安全检查和执行仍然由 skill 负责。

它是 chat 和 software 之间的桥。Chat 是最快的意图表达和工作流调整方式，但很多真实任务最终都需要一个可视化界面：队列、预览、草稿编辑器、筛选、状态，以及明确的批准或拒绝按钮。App-in-Skill 保留了 agent 协作的灵活性，同时给用户一个稳定的重复决策界面。

当 chat 变得太累时，这种模式很有用：

- inbox-zero 这类需要快速审批大量邮件的流程
- 带草稿、风险标签和备注的 review 队列
- 基于 agent 本地生成文件的 dashboard
- 用户需要先看上下文再批准的审批流程
- 太私人、太早期，或者不值得做完整 SaaS 后端的轻量操作

它尤其适合长尾 workflow：对某个人或团队很重要、经常变化、但不值得做成完整应用的任务。skill 可以通过对话持续调整，而 app 给这个不断变化的流程一个足够稳定、别人也能使用的结构。

## 为什么用户需要它

大多数用户并不想只靠聊天记录来处理重复工作。Chat 很适合提问、纠正和判断，但当用户要 review 很多相似项目，或者要记住上一轮发生了什么时，纯聊天会变得很累。

App-in-Skill 给用户提供：

- 一个可见队列，而不是不断滚动的聊天记录
- 一个统一位置来查看草稿、来源上下文、风险和建议动作
- 稳定的项目编号，例如 `Review #1`，让用户回到 chat 时可以准确引用 UI 中的项目
- Help & Settings 面板，展示 batch 文件、decision 文件、config 和账号摘要的位置
- 可以在刷新、暂停和中断后保留的用户决定
- 更安全的审批习惯：app 记录用户批准了什么，skill 后续再执行动作

这也让 agent 辅助工作更容易交给团队成员。熟悉流程的人仍然可以通过 chat 塑造 workflow，但其他用户拿到的是一个具体界面，而不是必须理解完整的 agent 对话。

## 为什么开发者使用这种模式

对开发者来说，App-in-Skill 是一种轻量方式：可以交付有用的 workflow 软件，但不用把每个 workflow 都做成大型 app 项目。

这个模式有效，是因为它把边界拆清楚了：

- skill 负责推理、编排、外部读写和审批闸门
- app 负责人类 review、编辑、筛选和本地状态展示
- 交接文件定义 app 和 agent 之间的契约，所以两边可以独立演进
- config reader 把私有本地文件、数据库和未来远程 provider 隔离在同一个接口后面
- UI 可以保持简单，因为 batch 和任务解释由 agent 生成

这让第一版可以很小。开发者可以先从本地文件和本地 HTTP app 开始，之后再通过 data-reader 层把数据源换成 SQLite、Postgres、Supabase 或其他 provider。用户看到的 workflow 不需要因为存储形态变化而重做。

## 适合场景

App-in-Skill 最适合同时包含 agent 工作和人类判断的流程：

- 邮件分拣和回复 review
- 客服队列
- PR、release note 或文案 review
- 视频发布 checklist、标题/简介 review、封面反馈
- 内容在 blog、YouTube、newsletter 和社交平台之间的改写分发
- SEO 关键词或落地页 review，其中指标和建议需要人工批准
- 广告、GA 或增长方案，在执行前需要 review

它们的共同形态是：agent 准备选项、证据、草稿或建议；用户在 app 里编辑或批准；skill 只执行已批准的决定。

## 边界

一个 App-in-Skill 有三部分：

- `SKILL.md`：agent 的操作说明和安全规则
- `app/`：用于 review 和编辑的本地浏览器 UI
- `scripts/` 和 `lib/`：确定性的生成、校验、执行和数据访问 helper

app 应该是“最好意义上的无聊”。它展示 batch，让用户做决定，并把这些决定保存到本地。它不应该发送邮件、删除记录、收费、修改远程系统，或者做任何有外部副作用的事情。这些动作属于 skill，而且必须在明确审批后执行。

## 文件契约

交接文件就是契约：

- `app/.cache/current_batch.json`：agent 准备好的内容
- `app/.cache/decisions.json`：用户做出的决定
- `app/.cache/execution_report.json`：agent 执行后的结果
- `app/.cache/agent.lock`：agent 当前是否正在写入或执行

这样 workflow 是可恢复的。浏览器刷新后，batch 还在。agent 暂停后，用户决定还在。如果运行被中断，execution report 可以说明发生了什么。

## 为什么这个模式有效

Chat 很适合判断，但不总是适合重复 review。本地 app 给用户一个稳定界面：筛选、编号项目、预览、草稿框、备注和审批按钮。skill 给 app 提供智能：分类、摘要、建议回复、执行和安全闸门。

最终形成一个小而强的循环：

1. skill 准备 batch。
2. app 展示 batch。
3. 用户 review 和编辑。
4. skill 执行已批准的决定。
5. app 展示完成、阻塞或等待中的状态。

这个循环也让 workflow 更容易被教学和交接。用户可以先在 chat 中开始，让 agent 准备 batch，再到可视化界面里 review，然后回到 chat 里给出精确反馈，例如“改一下 Review #2”或“除了 blocked 那条，其他都批准”。界面承载重复状态，chat 保留给更高层的判断和调整。

## 配置

App-in-Skill 项目应该让公开代码保持通用，把私有上下文留在本地。账号、别名、操作者资料、品牌设置、风格、URL、知识来源和风险规则应该放在被 git 忽略的配置文件里，例如：

- `~/.config/<skill-name>/config.yml`
- `~/.config/<skill-name>/.env`
- `<skill-name>/config.local.yml`

代码应该通过 data-reader 层读取配置，而不是到处硬编码本地文件。今天这个 reader 可以从磁盘加载 YAML。以后它可以换成 Supabase、Postgres、SQLite 或产品云，而不用重写 UI。

对用户来说，这意味着 app 可以展示安全摘要：当前连接了哪些账号、身份、配置来源、batch 文件和 decision 文件。对开发者来说，这意味着本地文件模式和数据库模式可以共享同一套 UI 和执行脚本。

## 默认结构

除非 skill 有强理由使用其他技术，否则本地 server 和脚本默认使用 Node.js。

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
│   └── data-reader/
├── scripts/
├── references/
└── config.example.yml
```

共享代码放在 `lib/`。`scripts/` 保持为薄入口。真实配置、secret、cache 文件和生成的本地状态不要提交到 git。

## 气质

App-in-Skill 应该像某个 workflow 的安静驾驶舱。它不是 landing page。它也不是假装已经完成的 SaaS app。它是一个本地工具，帮助用户用更少疲劳和更多控制感来指挥 agent。

保持具体，贴近工作。最好的 App-in-Skill app 不是通用 dashboard，而是为某个任务准备的小型、明确的 review room。
