# mr-kelly/skills

Kelly 的个人 AI skills 工作区，用来处理日常业务里的重复工作。

这个仓库收集 Kelly 在邮件、资金台账、内容生产、PR review、短剧制作、MV 策划和 agent 配置里经常使用的 skills。很多 skill 都是 **App-in-Skill**：skill 负责告诉 agent 怎么做事，本地浏览器 App UI 则给 Kelly 一个更稳定的操作台，用来 review、approve、编辑、查看 dashboard，或者把任务带着备注交还给 agent。

它仍然可以作为 skill/plugin bundle 安装，但重点不是通用 marketplace，而是一组 Kelly 自己日常业务里真的会用的工具。

## 安装

给 Codex 和其他支持 skills 的 agent 使用：

```bash
npx skills add mr-kelly/skills
```

Claude Code：

```text
/plugin marketplace add mr-kelly/skills
/plugin install mr-kelly-skills
```

## Skills

`kelly-*` 是日常业务工具；`agent-rules` 和 `app-in-skill-creator` 这类 helper skills 用来维护这个工作区本身。

| Skill | 做什么 | 什么时候用 | README |
| --- | --- | --- | --- |
| `agent-rules` | 让 Codex、Claude Code、Copilot、Kiro、Cursor、Gemini 等 agent 共享同一套规则和 skills。 | 设置多 agent repo、检查规则漂移、修复 rule/skill symlink 时使用。 | [Open README](../skills/agent-rules/README.md) |
| `app-in-skill-creator` | 记录和脚手架化 App-in-Skill 模式：skill 内置本地 review UI、handoff 文件、锁、脚本和安全边界。 | 构建带浏览器 review queue、approval desk、dashboard 或本地 workflow 的 skill 时使用。 | [Open README](../skills/app-in-skill-creator/README.md) |
| `kelly-email` | AI 辅助 inbox-zero：跨邮箱 triage 未读邮件、起草回复、准备清理动作，并在本地 UI 里人工批准后执行。 | 处理未读邮件、写 support 回复、批准后归档/标记已读，或用 App-in-Skill UI 管理邮件时使用。 | [Open README](../skills/kelly-email/README.md) |
| `kelly-money` | 聚合 Mercury、Stripe、Airwallex、Creem，形成本地资金台账 dashboard、总流水、账户健康、发票匹配和对账详情。 | 查看余额、付款、payout、手续费、退款、转账、provider sync 状态、发票和流水匹配时使用。 | [Open README](../skills/kelly-money/README.md) |
| `kelly-writer` | 把一个想法、文章、 transcript、outline 或公告改写成适合小红书、公众号、newsletter、LinkedIn、X/Twitter、短视频、SEO 的内容包。 | 把长内容拆成多平台内容包，并在本地 review、编辑、批准、导出时使用。 | [Open README](../skills/kelly-writer/README.md) |
| `kelly-pr-review` | 通过 `gh` CLI 做 GitHub PR review desk：收集待 review PR、准备 review notes、在本地 UI 批准后执行 `gh pr review`。 | review PR、批准/comment/request changes，或批量处理 PR review decision 时使用。 | [Open README](../skills/kelly-pr-review/README.md) |
| `kelly-drama` | 短剧生产工作台：剧集概览、角色库、关系图、分集表、shot sheet，并协调角色参考图和 AI/人工任务。 | 从策划到分镜管理短剧系列，写分集、建角色、管理 storyboard、review AI 生成图时使用。 | [Open README](../skills/kelly-drama/README.md) |
| `kelly-mv` | 纯视觉 MV 工作台：上传 MP3、写 MV concept、建立角色和参考卡、生成/上传镜头图和视频，并围绕音乐做 storyboard。 | 做没有旁白/字幕的纯视觉 MV，用歌曲驱动镜头和画面规划时使用。 | [Open README](../skills/kelly-mv/README.md) |

## App UI 截图

大多数 Kelly skills 不只是 chat prompt：它们带本地浏览器 UI，用于 review、approval、dashboard、planning 和 handoff。当 agent 能先准备工作，但 Kelly 还需要一个清楚的地方查看上下文、编辑草稿、比较表格、批准安全动作、阻止高风险动作，或者带备注把任务交回给 agent 时，这些 UI 就很有用。

共同模式是本地操作台：demo-safe data、状态筛选、详情面板、可编辑建议、批准控件、dashboard 和本地 handoff 记录。下面的截图展示每个 App UI 的主要使用场景。

### `kelly-email`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-email-ui-zh-CN.png" alt="Kelly Email 总览"></td>
    <td width="50%"><img src="screenshots/kelly-email-all-zh-CN.png" alt="Kelly Email 邮件处理台"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>Inbox-zero 操作台，显示账户上下文、队列指标和 review workflow 控件。</td>
    <td><strong>邮件审批台</strong><br>Mock 邮件队列，带批准动作、发件人上下文、回复草稿和状态筛选。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-email-review-zh-CN.png" alt="Kelly Email 需要 review"></td>
    <td><img src="screenshots/kelly-email-blocked-zh-CN.png" alt="Kelly Email 阻止高风险请求"></td>
  </tr>
  <tr>
    <td><strong>需要 review</strong><br>需要人工判断语气、时机或下一步的邮件 review 场景。</td>
    <td><strong>高风险阻止</strong><br>遇到可疑或安全相关请求时，assistant 阻止处理而不是直接起草回复。</td>
  </tr>
</table>

### `kelly-money`

Kelly Money 是本地财务 dashboard，用来查看 Mercury、Stripe、Airwallex 和 Creem 的资金流动，并在文档截图里避免暴露真实凭证或 provider 数据。Demo 展示总流水、provider/account 列、账户健康、发票匹配、异常 review 和对账详情。

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-money-ui-zh-CN.png" alt="Kelly Money 总览"></td>
    <td width="50%"><img src="screenshots/kelly-money-ledger-zh-CN.png" alt="Kelly Money 总流水"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>资金操作台，显示账户健康、近期资金流动、总流入、总流出、手续费和净额。</td>
    <td><strong>总流水</strong><br>跨 provider 的标准化流水表，包含账户、交易类型、手续费、状态和净额。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-money-accounts-zh-CN.png" alt="Kelly Money 账户"></td>
    <td><img src="screenshots/kelly-money-invoices-zh-CN.png" alt="Kelly Money 发票匹配"></td>
  </tr>
  <tr>
    <td><strong>账户</strong><br>Provider 账户清单，显示余额、币种、同步状态、流入、手续费和净额。</td>
    <td><strong>发票匹配</strong><br>发票和流水的对账视图，展示已匹配、缺失发票、金额不一致和复核状态。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-money-detail-zh-CN.png" alt="Kelly Money 发票异常详情"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>异常详情</strong><br>发票异常页，显示金额/日期差异、匹配规则、容差、候选交易和审计轨迹。</td>
    <td></td>
  </tr>
</table>

### `kelly-writer`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-content-ui-zh-CN.png" alt="Kelly Writer todo queue"></td>
    <td width="50%"><img src="screenshots/kelly-content-topics-zh-CN.png" alt="Kelly Writer 选题发现"></td>
  </tr>
  <tr>
    <td><strong>Todo 队列</strong><br>已确认的内容方向排队等待 AI 写作，显示 owner、状态和下一步。</td>
    <td><strong>选题发现</strong><br>Mock 编辑策划视图，展示关键词 cluster、受众匹配和选题机会。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-content-main-zh-CN.png" alt="Kelly Writer 主文草稿"></td>
    <td><img src="screenshots/kelly-content-distribution-zh-CN.png" alt="Kelly Writer 分发 review"></td>
  </tr>
  <tr>
    <td><strong>主文草稿</strong><br>长文写作工作台，包含 outline、草稿段落、来源 notes 和批准状态。</td>
    <td><strong>分发 review</strong><br>发布、社交 snippet、newsletter framing 和最终检查的 channel handoff 视图。</td>
  </tr>
</table>

### `kelly-pr-review`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-pr-review-ui-zh-CN.png" alt="Kelly PR Review 总览"></td>
    <td width="50%"><img src="screenshots/kelly-pr-review-review-zh-CN.png" alt="Kelly PR Review 需要 review"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>PR review desk，包含 repo 筛选、状态计数和 reviewer 配置。</td>
    <td><strong>需要 review</strong><br>Mock PR review，展示 findings、confidence、测试 notes 和建议动作。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-pr-review-ready-zh-CN.png" alt="Kelly PR Review 可以批准"></td>
    <td><img src="screenshots/kelly-pr-review-blocked-zh-CN.png" alt="Kelly PR Review 阻止"></td>
  </tr>
  <tr>
    <td><strong>可以批准</strong><br>检查通过、最终建议可发送的 approval 场景。</td>
    <td><strong>阻止 review</strong><br>有安全/质量风险未解决时，展示 blocking rationale 和 handoff 信息。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-pr-review-needs-test-zh-CN.png" alt="Kelly PR Review 需要测试"></td>
    <td><img src="screenshots/kelly-pr-review-tested-zh-CN.png" alt="Kelly PR Review 已测试"></td>
  </tr>
  <tr>
    <td><strong>需要测试</strong><br>已 merge PR 等待人工验证，需要测试 note 或截图证据。</td>
    <td><strong>已测试</strong><br>Post-merge 验证记录，展示本地测试说明。</td>
  </tr>
</table>

### `kelly-drama`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-drama-ui-zh-CN.png" alt="Kelly Drama 总览"></td>
    <td width="50%"><img src="screenshots/kelly-drama-episodes-zh-CN.png" alt="Kelly Drama 分集表"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>短剧系列工作台，包含健康度 dashboard、执行时间线、统计和系列设置。</td>
    <td><strong>分集表</strong><br>分集列表展示剧本和 storyboard 状态、镜头准备度和分集详情。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-drama-characters-zh-CN.png" alt="Kelly Drama 角色库"></td>
    <td><img src="screenshots/kelly-drama-relationships-zh-CN.png" alt="Kelly Drama 关系图"></td>
  </tr>
  <tr>
    <td><strong>角色库</strong><br>角色列表显示三视图状态、演员设定、服装和声音预览控制。</td>
    <td><strong>关系图</strong><br>角色关系视图，展示权力动态、证据链接和关系详情。</td>
  </tr>
</table>

### `kelly-mv`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-mv-ui-zh-CN.png" alt="Kelly MV 概念"></td>
    <td width="50%"><img src="screenshots/kelly-mv-storyboard-zh-CN.png" alt="Kelly MV 分镜"></td>
  </tr>
  <tr>
    <td><strong>概念</strong><br>MV 概念工作台，包含项目 checklist、下一步指引、概念表单和 walkthrough。</td>
    <td><strong>分镜</strong><br>镜头列表显示时长、图片状态，以及描述、图片生成和视频上传详情。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-mv-cast-zh-CN.png" alt="Kelly MV 角色"></td>
    <td><img src="screenshots/kelly-mv-song-zh-CN.png" alt="Kelly MV 歌曲"></td>
  </tr>
  <tr>
    <td><strong>角色</strong><br>角色列表和参考卡状态，支持视觉描述、服装和一致性锚点。</td>
    <td><strong>歌曲</strong><br>MP3 上传和歌曲信息表单，展示时长识别和 song-gen backend 状态。</td>
  </tr>
</table>

## 目录结构

- `.claude-plugin/marketplace.json` 让这个 bundle 仍可被 Claude Code 安装。
- `skills/` 每个子目录对应一个 skill。
- 每个 skill 至少包含 `SKILL.md`。
- App-based skills 通常还包含 `app/`、本地脚本、schema references、demo mode 和面向人的 `README.md`。
