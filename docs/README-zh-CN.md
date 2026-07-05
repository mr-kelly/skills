<div align="center">

# 🧰 mr-kelly/skills

**Kelly 的个人 AI skills 工作区，用来处理日常业务里的重复工作。**

26 个 App-in-Skill 工作流 —— 每个都是一份 agent 操作手册，配一个本地浏览器 UI 用于 review、审批和看板。

[![Stars](https://img.shields.io/github/stars/mr-kelly/skills?style=flat&logo=github&color=D97757)](https://github.com/mr-kelly/skills)
[![Last Commit](https://img.shields.io/github/last-commit/mr-kelly/skills?color=D97757)](https://github.com/mr-kelly/skills/commits/main)
[![Skills](https://img.shields.io/badge/skills-26-D97757)](https://mr-kelly.github.io/skills/?lang=zh)
[![License](https://img.shields.io/badge/license-MIT-green)](../LICENSE)

[![npx skills add](https://img.shields.io/badge/npx-skills%20add%20mr--kelly%2Fskills-black?logo=npm&logoColor=white)](#安装)

[English](../README.md) · **简体中文** · [🌐 在线浏览全部 skills](https://mr-kelly.github.io/skills/?lang=zh)

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-money-ui-zh-CN.png" alt="kelly-money — 资金台账 dashboard"></td>
    <td width="50%"><img src="screenshots/kelly-crm-ui-zh-CN.png" alt="kelly-crm — 客户管道操作台"></td>
  </tr>
  <tr>
    <td width="50%"><img src="screenshots/kelly-drama-ui-zh-CN.png" alt="kelly-drama — 短剧工作台"></td>
    <td width="50%"><img src="screenshots/kelly-email-ui-zh-CN.png" alt="kelly-email — 邮件审批台"></td>
  </tr>
</table>

<sub>不是 prompt，是真·本地应用 —— 每个 skill 都带一个浏览器审阅台。</sub>

</div>

---

## 目录

- [有什么不一样](#有什么不一样)
- [快速开始](#快速开始)
- [Skills](#skills)
- [App UI 截图](#app-ui-截图)
- [目录结构](#目录结构)

---

这个仓库收集 Kelly 在邮件、资金台账、CRM、聊天聚合、社媒运营、SEO、用户反馈、市场情报、运维监控、内容生产、PR review、短剧制作、MV 策划和 agent 配置里经常使用的 skills。它可以作为 skill/plugin bundle 安装，但重点不是通用 marketplace，而是一组 Kelly 自己日常业务里真的会用的工具。

---

## 有什么不一样

大多数 skill 库只是 prompt。**Kelly 的 skills 是 App-in-Skill 工作流** —— 每个都把一份 agent 操作手册和一个本地浏览器 UI 配在一起，让你在任何事情发生前，总有一个稳的地方可以 review：

- **agent 干活** —— 对着你真实的账户和导出数据做 triage、起草、对账、调研和规划。
- **你在本地 UI 里 review** —— 一个操作台，带 dashboard、可编辑草稿、详情面板和状态筛选，跑在 `localhost` 上，默认用 demo-safe 数据。
- **有风险的动作不经批准不执行** —— 安全动作一键通过；高风险动作卡在明确的审批边界上，你随时可以带备注把任务交回给 agent。

结果是：agent 的速度 + 人在回路，而不是一个黑盒。

---

## 快速开始

1. **安装** —— Claude Code 里：
   ```text
   /plugin marketplace add mr-kelly/skills
   /plugin install mr-kelly-skills
   ```
   或给 Codex 和其他支持 skills 的 agent：
   ```bash
   npx skills add mr-kelly/skills
   ```
2. **唤起一个 skill** —— 比如 `$kelly-money` 看现金流，或 `$kelly-email` 做 inbox zero。
3. **打开本地 App UI** —— skill 会在浏览器里拉起一个审阅台（默认 demo-safe 数据），你在这里查看 dashboard、编辑草稿、批准或阻止动作。

---

## Skills

`kelly-*` 是日常业务工具；`agent-rules` 和 `app-in-skill-creator` 这类 helper skills 用来维护这个工作区本身。

| Skill | 做什么 | 什么时候用 | 详情 |
| --- | --- | --- | --- |
| `agent-rules` | 让 Codex、Claude Code、Copilot、Kiro、Cursor、Gemini 等 agent 共享同一套规则和 skills。 | 设置多 agent repo、检查规则漂移、修复 rule/skill symlink 时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/agent-rules.html?lang=zh) |
| `app-in-skill-creator` | 记录和脚手架化 App-in-Skill 模式：skill 内置本地 review UI、handoff 文件、锁、脚本和安全边界。 | 构建带浏览器 review queue、approval desk、dashboard 或本地 workflow 的 skill 时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/app-in-skill-creator.html?lang=zh) |
| `kelly-email` | AI 辅助 inbox-zero：跨邮箱 triage 未读邮件、起草回复、准备清理动作，并在本地 UI 里人工批准后执行。 | 处理未读邮件、写 support 回复、批准后归档/标记已读，或用 App-in-Skill UI 管理邮件时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-email.html?lang=zh) |
| `kelly-money` | 聚合 Mercury、Stripe、Airwallex、Creem，形成本地资金台账 dashboard、总流水、账户健康、发票匹配和对账详情。 | 查看余额、付款、payout、手续费、退款、转账、provider sync 状态、发票和流水匹配时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-money.html?lang=zh) |
| `kelly-invest-webull` | 通过 Webull OpenAPI 把个人券商账户聚合成本地只读投资组合 dashboard：持仓、成本、市值、未实现盈亏、当日涨跌和按资产类别的配置。只读——绝不下单或撤单。 | 查看个人投资、持仓、组合市值、未实现盈亏、现金或资产配置时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-invest-webull.html?lang=zh) |
| `kelly-family-office` | 通过 CSV 导入和手工录入，把多个主体/成员的持仓合并成家族办公室 dashboard：以基准货币计的总资产管理规模（AUM），按主体、资产类别、机构的配置和业绩汇总。只读——绝不动钱。 | 汇总个人、信托、公司等多主体的家族办公室，查看合并 AUM、资产配置、机构敞口或未实现业绩时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-family-office.html?lang=zh) |
| `kelly-crm` | 个人 CRM：联系人、公司、交易和互动记录，带 pipeline dashboard 和 agent 起草的跟进审批队列。 | 跟踪交易和人脉、查看 pipeline 健康度、批准/编辑跟进草稿（由 agent 经其他渠道发出）时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-crm.html?lang=zh) |
| `kelly-messenger` | 把 WhatsApp、Discord、Slack、Telegram 聚合成一个本地统一收件箱：完整会话记录 + 审批制回复 outbox。 | 在一个地方读所有聊天平台的消息、用一个 composer 写回复、批准后由 agent 经平台连接器发送时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-messenger.html?lang=zh) |
| `kelly-social` | 把 Twitter/X、Facebook、Instagram 聚合成一个本地 dashboard：统一时间线、账号数据、粉丝趋势和互动指标，采集由 agent 侧完成（浏览器自动化、导出或 API）。 | 不依赖官方 API，跨平台查看账号、时间线、帖子表现、粉丝增长和流量时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-social.html?lang=zh) |
| `kelly-seo` | 打通 Google Search Console 的本地 SEO 工作台：按查询和页面看点击、曝光、CTR、排名，带趋势图和 agent 提出的 SEO 机会审批队列。 | 分析搜索表现、找 striking-distance 查询、批准标题重写/内链/内容 brief 时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-seo.html?lang=zh) |
| `kelly-feedback` | 聚合全渠道用户反馈，聚类成带权重的 feature requests，并运行带草稿回复和 changelog 的 roadmap 裁决队列。 | 分诊用户反馈、给需求排优先级、做有证据支撑的 roadmap 采纳/拒绝决定时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-feedback.html?lang=zh) |
| `kelly-radar` | 市场情报台：竞品信号监控（定价、changelog、发布、口碑 diff）+ 带 brief 审批和引用报告的研究课题工作台 + 关键词/话题趋势跟踪。 | 盯竞品、发起深度研究报告、把上升的搜索和社区趋势转成机会卡时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-radar.html?lang=zh) |
| `kelly-devops` | 盯产品矩阵的运维面：服务可用性和延迟、SSL 证书和域名到期、API key 轮换、云支出异常，带 agent 提出的行动卡审批。 | 检查服务健康、避免域名/证书过期、review 云支出异常、批准续费和轮换动作时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-devops.html?lang=zh) |
| `kelly-audit` | 导入订单、发票、回款三表并互相稽核：缺发票、金额不符、逾期应收（带账龄）、重复回款、无主回款，每条异常带证据链和催收草稿。 | 对账订单-发票-回款链条、催收应收账款、月底前 review 财务异常时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-audit.html?lang=zh) |
| `kelly-tickets` | 把微信群导出、来电记录、表单、邮件里的投诉分类成工单，生成带 SLA 的派单建议供审批，并在看板上跟踪到解决。 | 管理物业/设施投诉、给班组派工单，或运行任何「接入-分类-派单-跟踪」流程时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-tickets.html?lang=zh) |
| `kelly-lesson` | 从教材和校内模板生成教案草稿，按校内要求跑合规检查清单，给教导主任一个带教师反馈草稿和文档导出的审核队列。 | 统一全校教案格式、检查教案合规性、批量审核批准教学计划时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-lesson.html?lang=zh) |
| `kelly-inquiry` | 把 WhatsApp、Instagram、Messenger、邮件询盘聚合成销售 pipeline：商品知识库、带底价护栏的报价单、审批制外发和跟进提醒。 | 处理外贸/跨境询盘、基于商品库起草准确回复和报价、防止商机逾期漏单时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-inquiry.html?lang=zh) |
| `kelly-picks` | 跨境选品雷达：agent 扫 BSR 飙升、TikTok 爆款、上升搜索词产出候选品，每个候选带可实时改数的利润卡（售价、到岸成本、费用、保本 ACOS）和竞争解读。 | 找品、上架前压测利润空间、带采购/上架 brief 做「立项/观察/放弃」决策时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-picks.html?lang=zh) |
| `kelly-listing` | 上架工厂：生成各平台 listing（Amazon 标题/五点/描述/后台词/A+、Shopify、TikTok Shop、eBay）和多站点语言变体，跑平台合规检查，批准后导出。 | 写或本地化平台 listing、执行禁用词和字数规则、批量审核上架文案时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-listing.html?lang=zh) |
| `kelly-ads` | 投放指挥台：聚合 Amazon、Meta、TikTok、Google 广告到一块看板，跟踪 ACOS/ROAS，确定性异常检测，审批制调整卡（否定词、出价、预算）。 | 跨平台看广告花费、抓零转化烧钱和预算烧穿、带证据批准出价和关键词调整时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-ads.html?lang=zh) |
| `kelly-standup` | 团队晨会看板：被调用时 agent 从聊天渠道收集成员日报，整理成「昨天/今天/阻塞」卡片和团队摘要，给缺交的人起草审批制催交提醒。 | 异步开晨会、一眼看到每个人在干什么、跟踪阻塞和参与率时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-standup.html?lang=zh) |
| `kelly-writer` | 把一个想法、文章、 transcript、outline 或公告改写成适合小红书、公众号、newsletter、LinkedIn、X/Twitter、短视频、SEO 的内容包。 | 把长内容拆成多平台内容包，并在本地 review、编辑、批准、导出时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-writer.html?lang=zh) |
| `kelly-pr-review` | 通过 `gh` CLI 做 GitHub PR review desk：收集待 review PR、准备 review notes、在本地 UI 批准后执行 `gh pr review`。 | review PR、批准/comment/request changes，或批量处理 PR review decision 时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-pr-review.html?lang=zh) |
| `kelly-drama` | 短剧生产工作台：剧集概览、角色库、关系图、分集表、shot sheet，并协调角色参考图和 AI/人工任务。 | 从策划到分镜管理短剧系列，写分集、建角色、管理 storyboard、review AI 生成图时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-drama.html?lang=zh) |
| `kelly-mv` | 纯视觉 MV 工作台：上传 MP3、写 MV concept、建立角色和参考卡、生成/上传镜头图和视频，并围绕音乐做 storyboard。 | 做没有旁白/字幕的纯视觉 MV，用歌曲驱动镜头和画面规划时使用。 | [查看 ↗](https://mr-kelly.github.io/skills/s/kelly-mv.html?lang=zh) |

---

## App UI 截图

大多数 Kelly skills 不只是 chat prompt：它们带本地浏览器 UI，用于 review、approval、dashboard、planning 和 handoff。当 agent 能先准备工作，但 Kelly 还需要一个清楚的地方查看上下文、编辑草稿、比较表格、批准安全动作、阻止高风险动作，或者带备注把任务交回给 agent 时，这些 UI 就很有用。

共同模式是本地操作台：demo-safe data、状态筛选、详情面板、可编辑建议、批准控件、dashboard 和本地 handoff 记录。下面的截图展示每个 App UI 的主要使用场景。

<details>
<summary><b>📸 展开全部 App UI 截图</b></summary>

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

### `kelly-invest-webull`

Kelly Invest（Webull）是本地只读投资组合 dashboard，通过 Webull OpenAPI（App Key/Secret，region `us`）连接个人券商账户，并有严格的"绝不交易"边界。Demo 在不暴露真实凭证的前提下展示操作界面：组合市值、未实现盈亏、资产配置、持仓，以及按账户和按标的的详情。

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-invest-webull-ui-zh-CN.png" alt="Kelly Invest 总览"></td>
    <td width="50%"><img src="screenshots/kelly-invest-webull-positions-zh-CN.png" alt="Kelly Invest 持仓"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>投资组合操作台，显示市值、未实现盈亏、当日涨跌、现金、按资产类别的环形配置图和当日涨跌榜。</td>
    <td><strong>持仓</strong><br>可排序的持仓表，含标的、资产类别、数量、平均成本、现价、市值、未实现盈亏和组合权重。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-invest-webull-accounts-zh-CN.png" alt="Kelly Invest 账户"></td>
    <td><img src="screenshots/kelly-invest-webull-detail-zh-CN.png" alt="Kelly Invest 标的详情"></td>
  </tr>
  <tr>
    <td><strong>账户</strong><br>按账户（现金/融资）显示净清算价值、现金、购买力，以及每个账户下的持仓。</td>
    <td><strong>标的详情</strong><br>单个标的视图，显示成本、市值、未实现盈亏及百分比、当日涨跌、权重和所属账户。</td>
  </tr>
</table>

### `kelly-family-office`

Kelly Family Office 通过 CSV 导入和手工录入，把个人、信托、公司等多个主体和成员的持仓合并成一个只读 dashboard，并换算成基准货币。Demo 在不使用真实账户数据的前提下展示操作界面：总 AUM 和未实现盈亏，以及按主体、资产类别、机构和业绩的汇总。

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-family-office-ui-zh-CN.png" alt="Kelly Family Office 总览"></td>
    <td width="50%"><img src="screenshots/kelly-family-office-entities-zh-CN.png" alt="Kelly Family Office 按主体"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>合并操作台，显示以基准货币计的总 AUM、未实现盈亏、主体和账户数量，以及总体配置。</td>
    <td><strong>按主体/成员</strong><br>每个家族主体（个人、信托、公司）及其合并 AUM、组合权重和未实现盈亏。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-family-office-assets-zh-CN.png" alt="Kelly Family Office 按资产类别"></td>
    <td><img src="screenshots/kelly-family-office-institutions-zh-CN.png" alt="Kelly Family Office 按机构"></td>
  </tr>
  <tr>
    <td><strong>按资产类别</strong><br>股票、债券、现金、加密、房地产、私募股权和另类资产的配置，含环形图、权重条和数值表。</td>
    <td><strong>按账户/机构</strong><br>按托管机构和券商合并，查看资产存放位置以及在各银行和券商之间的集中度。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-family-office-performance-zh-CN.png" alt="Kelly Family Office 业绩"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>业绩</strong><br>以基准货币计的成本与市值对比及未实现盈亏，按主体和整个家族办公室汇总。</td>
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

### `kelly-crm`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-crm-ui-zh-CN.png" alt="Kelly CRM 总览"></td>
    <td width="50%"><img src="screenshots/kelly-crm-deals-zh-CN.png" alt="Kelly CRM 交易 pipeline"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>CRM 操作台：分阶段 pipeline 金额、到期跟进、近期互动和人脉统计。</td>
    <td><strong>交易</strong><br>跨阶段的 pipeline 表格，包含金额、概率、下一步和每笔交易的互动时间线。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-crm-contacts-zh-CN.png" alt="Kelly CRM 联系人"></td>
    <td><img src="screenshots/kelly-crm-followups-zh-CN.png" alt="Kelly CRM 跟进队列"></td>
  </tr>
  <tr>
    <td><strong>联系人</strong><br>联系人列表：关系强度、最近接触，以及每个联系人的互动历史和进行中交易。</td>
    <td><strong>跟进队列</strong><br>Agent 起草的跟进消息，带可编辑草稿、风险标记和批准/请求修改/搁置决定。</td>
  </tr>
</table>

### `kelly-messenger`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-messenger-ui-zh-CN.png" alt="Kelly Messenger 总览"></td>
    <td width="50%"><img src="screenshots/kelly-messenger-inbox-zh-CN.png" alt="Kelly Messenger 统一收件箱"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>消息操作台：待回复决定计数、各平台同步状态和最久等待指示。</td>
    <td><strong>统一收件箱</strong><br>WhatsApp、Slack、Discord、Telegram 的会话按最新活动排序，带等待时长标记。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-messenger-chat-zh-CN.png" alt="Kelly Messenger 会话"></td>
    <td><img src="screenshots/kelly-messenger-outbox-zh-CN.png" alt="Kelly Messenger 回复 outbox"></td>
  </tr>
  <tr>
    <td><strong>会话</strong><br>聊天记录视图，composer 预填 agent 建议回复，可直接编辑后进入队列。</td>
    <td><strong>回复 outbox</strong><br>外发回复的审批队列：每条消息先经人工批准，再由 agent 通过平台连接器发送。</td>
  </tr>
</table>

### `kelly-social`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-social-ui-zh-CN.png" alt="Kelly Social 总览"></td>
    <td width="50%"><img src="screenshots/kelly-social-timeline-zh-CN.png" alt="Kelly Social 统一时间线"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>X、Instagram、Facebook 的跨平台 KPI 卡片，带粉丝趋势和本周热门帖子。</td>
    <td><strong>统一时间线</strong><br>所有平台的帖子在一条流里，带每帖点赞、回复、转发和浏览数据。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-social-accounts-zh-CN.png" alt="Kelly Social 账号"></td>
    <td><img src="screenshots/kelly-social-detail-zh-CN.png" alt="Kelly Social 账号详情"></td>
  </tr>
  <tr>
    <td><strong>账号</strong><br>账号清单：粉丝数、互动率、采集方式和同步新鲜度。</td>
    <td><strong>账号详情</strong><br>单账号画像：粉丝趋势 sparkline、热门帖子和同步历史。</td>
  </tr>
</table>

### `kelly-seo`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-seo-ui-zh-CN.png" alt="Kelly SEO 总览"></td>
    <td width="50%"><img src="screenshots/kelly-seo-queries-zh-CN.png" alt="Kelly SEO 查询"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>Search Console KPI 卡片、每日点击/曝光图表、Top movers 和各站点同步状态。</td>
    <td><strong>查询</strong><br>Top 查询表：点击、曝光、CTR、排名、周期变化和机会标记。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-seo-pages-zh-CN.png" alt="Kelly SEO 页面"></td>
    <td><img src="screenshots/kelly-seo-opportunities-zh-CN.png" alt="Kelly SEO 机会"></td>
  </tr>
  <tr>
    <td><strong>页面</strong><br>Top 页面的搜索表现变化和收录警告。</td>
    <td><strong>机会</strong><br>Agent 提出的 SEO 动作——标题重写、内链、内容 brief——带可编辑草稿和审批。</td>
  </tr>
</table>

### `kelly-feedback`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-feedback-ui-zh-CN.png" alt="Kelly Feedback 总览"></td>
    <td width="50%"><img src="screenshots/kelly-feedback-inbox-zh-CN.png" alt="Kelly Feedback 收件箱"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>用户之声操作台：每周各渠道流入、情绪分布、热门聚类和来源新鲜度。</td>
    <td><strong>收件箱</strong><br>来自邮件、Discord、Slack、X 和应用商店评论的原始反馈流，带分诊控件。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-feedback-requests-zh-CN.png" alt="Kelly Feedback 需求"></td>
    <td><img src="screenshots/kelly-feedback-roadmap-zh-CN.png" alt="Kelly Feedback roadmap 裁决"></td>
  </tr>
  <tr>
    <td><strong>需求</strong><br>聚类后的 feature requests：频次、加权分数、趋势和代表性引述。</td>
    <td><strong>Roadmap 裁决</strong><br>Agent 提出的采纳/拒绝/合并提案，带 changelog 草稿和用户回复草稿供审批。</td>
  </tr>
</table>

### `kelly-radar`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-radar-ui-zh-CN.png" alt="Kelly Radar 总览"></td>
    <td width="50%"><img src="screenshots/kelly-radar-signals-zh-CN.png" alt="Kelly Radar 竞品信号"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>市场情报台：待分诊信号、watchlist 新鲜度、趋势 movers 和研究 pipeline。</td>
    <td><strong>信号</strong><br>竞品定价、changelog、发布、口碑和招聘信号，带严重度标记和 Act/Watch/Ignore 分诊。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-radar-research-zh-CN.png" alt="Kelly Radar 研究台"></td>
    <td><img src="screenshots/kelly-radar-trends-zh-CN.png" alt="Kelly Radar 趋势"></td>
  </tr>
  <tr>
    <td><strong>研究台</strong><br>研究课题按 brief 审批 → 深度研究 → 引用报告的流程推进。</td>
    <td><strong>趋势</strong><br>上升关键词和社区话题，带动量 sparkline 和可移交内容/roadmap 的机会卡。</td>
  </tr>
</table>

### `kelly-devops`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-devops-ui-zh-CN.png" alt="Kelly DevOps 总览"></td>
    <td width="50%"><img src="screenshots/kelly-devops-services-zh-CN.png" alt="Kelly DevOps 服务"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>产品矩阵健康台：服务、证书、域名和支出摘要，以及近期事件流。</td>
    <td><strong>服务</strong><br>被监控端点的可用性、延迟 sparkline、TLS 证书状态和检查历史。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-devops-expiries-zh-CN.png" alt="Kelly DevOps 到期台账"></td>
    <td><img src="screenshots/kelly-devops-actions-zh-CN.png" alt="Kelly DevOps 行动队列"></td>
  </tr>
  <tr>
    <td><strong>到期台账</strong><br>域名、SSL 证书、key 轮换和套餐续费在一张表里，按剩余天数分级着色。</td>
    <td><strong>行动队列</strong><br>Agent 提出的续费/轮换/排查行动卡，带证据和审批控件。</td>
  </tr>
</table>

### `kelly-audit`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-audit-ui-zh-CN.png" alt="Kelly Audit 总览"></td>
    <td width="50%"><img src="screenshots/kelly-audit-orders-zh-CN.png" alt="Kelly Audit 订单"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>财务稽核台：风险金额、应收账龄条、异常复核队列预览和导入历史。</td>
    <td><strong>订单</strong><br>标准化订单表，带开票/回款状态标记和关联异常指示。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-audit-invoices-zh-CN.png" alt="Kelly Audit 发票"></td>
    <td><img src="screenshots/kelly-audit-anomalies-zh-CN.png" alt="Kelly Audit 异常队列"></td>
  </tr>
  <tr>
    <td><strong>发票</strong><br>发票台账：到期日、已回款金额、逾期天数和匹配状态。</td>
    <td><strong>异常队列</strong><br>规则命中的异常，带订单-发票-回款证据链和可审批的催款邮件草稿。</td>
  </tr>
</table>

### `kelly-tickets`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-tickets-ui-zh-CN.png" alt="Kelly Tickets 总览"></td>
    <td width="50%"><img src="screenshots/kelly-tickets-intake-zh-CN.png" alt="Kelly Tickets 进线"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>派单指挥台：SLA 风险、本周各渠道进线、工单分类分布和班组负载。</td>
    <td><strong>进线</strong><br>微信、电话、表单、邮件的原始投诉，带分类字段和转工单控件。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-tickets-dispatch-zh-CN.png" alt="Kelly Tickets 派单审批"></td>
    <td><img src="screenshots/kelly-tickets-board-zh-CN.png" alt="Kelly Tickets 工单看板"></td>
  </tr>
  <tr>
    <td><strong>派单审批</strong><br>Agent 提出的班组指派：优先级、SLA 目标、派单理由和给班组的可编辑备注。</td>
    <td><strong>工单看板</strong><br>工单沿「未结-已派-处理中-等待-已解决」跟踪，带 SLA 指示和历史时间线。</td>
  </tr>
</table>

### `kelly-lesson`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-lesson-ui-zh-CN.png" alt="Kelly Lesson 总览"></td>
    <td width="50%"><img src="screenshots/kelly-lesson-plans-zh-CN.png" alt="Kelly Lesson 教案库"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>教学质量台：合规通过率、年级×学科覆盖、教师概览和审核队列。</td>
    <td><strong>教案库</strong><br>按学科、年级、教师组织的教案，带来源标记、合规得分和结构化教案详情。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-lesson-checks-zh-CN.png" alt="Kelly Lesson 合规检查"></td>
    <td><img src="screenshots/kelly-lesson-review-zh-CN.png" alt="Kelly Lesson 审核队列"></td>
  </tr>
  <tr>
    <td><strong>合规检查</strong><br>逐条规则的通过/提醒/不合格结果，带证据片段，可按规则和教师筛选。</td>
    <td><strong>审核队列</strong><br>教案提交带合规摘要、智能体修改建议和给教师的反馈草稿，供审批。</td>
  </tr>
</table>

### `kelly-inquiry`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-inquiry-ui-zh-CN.png" alt="Kelly Inquiry 总览"></td>
    <td width="50%"><img src="screenshots/kelly-inquiry-inquiries-zh-CN.png" alt="Kelly Inquiry 询盘"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>询盘指挥台：回复 SLA 计数、本周渠道构成、销售漏斗和逾期商机提醒。</td>
    <td><strong>询盘</strong><br>WhatsApp、Instagram、邮件询盘：国家、阶段、预估金额和下次跟进。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-inquiry-quotes-zh-CN.png" alt="Kelly Inquiry 报价"></td>
    <td><img src="screenshots/kelly-inquiry-approvals-zh-CN.png" alt="Kelly Inquiry 审批队列"></td>
  </tr>
  <tr>
    <td><strong>报价</strong><br>报价单工作台：行项目来自商品知识库，带有效期和底价护栏。</td>
    <td><strong>审批队列</strong><br>回复和报价的审批制 outbox——未经批准不会发出任何消息。</td>
  </tr>
</table>

### `kelly-picks`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-picks-ui-zh-CN.png" alt="Kelly Picks 总览"></td>
    <td width="50%"><img src="screenshots/kelly-picks-candidates-zh-CN.png" alt="Kelly Picks 候选品"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>选品台：本周各来源候选品、Top movers 和各来源扫描新鲜度。</td>
    <td><strong>候选品</strong><br>候选品表：动量、预估毛利率、竞争评级和「立项/观察/放弃」阶段。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-picks-detail-zh-CN.png" alt="Kelly Picks 利润卡"></td>
    <td><img src="screenshots/kelly-picks-decisions-zh-CN.png" alt="Kelly Picks 评审队列"></td>
  </tr>
  <tr>
    <td><strong>利润卡</strong><br>可实时改数的利润测算——售价、到岸成本、运费、平台费、广告费 → 毛利率和保本 ACOS——外加前 10 名评论数竞争解读。</td>
    <td><strong>评审队列</strong><br>Agent 提出的立项/观察/放弃提案，带采购和上架 brief 供审批。</td>
  </tr>
</table>

### `kelly-listing`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-listing-ui-zh-CN.png" alt="Kelly Listing 总览"></td>
    <td width="50%"><img src="screenshots/kelly-listing-drafts-zh-CN.png" alt="Kelly Listing 草稿工作台"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>上架指挥台：产品 × 平台状态矩阵、合规通过率和可导出数。</td>
    <td><strong>草稿工作台</strong><br>Amazon 草稿：标题实时字数、五点描述、后台搜索词字节计数、A+ 大纲和站点语言变体切换。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-listing-checks-zh-CN.png" alt="Kelly Listing 合规检查"></td>
    <td><img src="screenshots/kelly-listing-review-zh-CN.png" alt="Kelly Listing 审核队列"></td>
  </tr>
  <tr>
    <td><strong>合规检查</strong><br>逐条规则的通过/提醒/不合格——禁用词、字数上限、五点条数——覆盖全部草稿。</td>
    <td><strong>审核队列</strong><br>草稿提交带合规摘要和关键词策略说明，批准后才能导出或发布。</td>
  </tr>
</table>

### `kelly-ads`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-ads-ui-zh-CN.png" alt="Kelly Ads 总览"></td>
    <td width="50%"><img src="screenshots/kelly-ads-campaigns-zh-CN.png" alt="Kelly Ads 广告活动"></td>
  </tr>
  <tr>
    <td><strong>总览</strong><br>跨平台投放看板：综合 ROAS/ACOS 对比目标、各平台卡片、花费收入柱状图和「只花钱不出单排行」。</td>
    <td><strong>广告活动</strong><br>Amazon、Meta、TikTok、Google 的活动表：预算进度、花费、ROAS 和按目标着色的 ACOS。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-ads-alerts-zh-CN.png" alt="Kelly Ads 异常"></td>
    <td><img src="screenshots/kelly-ads-adjustments-zh-CN.png" alt="Kelly Ads 调整队列"></td>
  </tr>
  <tr>
    <td><strong>异常</strong><br>确定性异常流：ACOS 超标、预算烧穿、零转化花费、CPC 飙升、素材被拒。</td>
    <td><strong>调整队列</strong><br>Agent 提出的出价/预算/否定词调整，带证据和影响预估，批准后才执行。</td>
  </tr>
</table>

### `kelly-standup`

<table>
  <tr>
    <td width="50%"><img src="screenshots/kelly-standup-ui-zh-CN.png" alt="Kelly Standup 今日看板"></td>
    <td width="50%"><img src="screenshots/kelly-standup-members-zh-CN.png" alt="Kelly Standup 成员"></td>
  </tr>
  <tr>
    <td><strong>今日看板</strong><br>晨会一屏看全：团队摘要、提交统计、每人「昨天/今天/阻塞」卡片和来源渠道标记。</td>
    <td><strong>成员</strong><br>团队名册：连续打卡、30 天参与率、未解决阻塞和每人更新时间线。</td>
  </tr>
  <tr>
    <td><img src="screenshots/kelly-standup-blockers-zh-CN.png" alt="Kelly Standup 阻塞"></td>
    <td><img src="screenshots/kelly-standup-reminders-zh-CN.png" alt="Kelly Standup 提醒"></td>
  </tr>
  <tr>
    <td><strong>阻塞</strong><br>全团队阻塞汇总：严重度、挂起时长和 agent 建议的下一步。</td>
    <td><strong>提醒</strong><br>催交提醒审批队列——agent 起草，批准后才发出。</td>
  </tr>
</table>

</details>

---

## 目录结构

- `.claude-plugin/marketplace.json` 让这个 bundle 仍可被 Claude Code 安装。
- `skills/` 每个子目录对应一个 skill。
- 每个 skill 至少包含 `SKILL.md`。
- App-based skills 通常还包含 `app/`、本地脚本、schema references、demo mode 和面向人的 `README.md`。

---

## Star History

<a href="https://star-history.com/#mr-kelly/skills&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=mr-kelly/skills&type=Date" width="600" />
  </picture>
</a>

<div align="center">

由 Kelly 构建 · 基于 [MIT](../LICENSE) 许可 · [🌐 Skills 在线画廊](https://mr-kelly.github.io/skills/?lang=zh)

</div>
