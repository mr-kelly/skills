# Kelly Creators

Kelly Creators is a local App-in-Skill command desk for influencer / creator marketing. The agent sweeps creator candidates, scores fit, and drafts outreach and briefs; you review creator cards, approve outreach and briefs, gate content before it publishes, and track campaign ROI. It is organized around the four phases of the discipline: **Discover → Plan → Activate → Measure**.

## What It Shows

- Overview: pipeline funnel (discovery → outreach → negotiating → live → measured), budget allocation, and total reach.
- Creators: candidate cards with the C³ ACE fit score, platform, niche, followers, engagement rate, and rate — sortable by fit, followers, engagement, or cost.
- Outreach: the needs-review approval queue with editable outreach/brief drafts, risk badges, and Approve / Request changes / Block decisions. Includes the content-reviewer quality gate (SHIP / FIX / BLOCK).
- ROI: per-creator spend, estimated value, CPM, and ROI.
- The app never sends anything. Approved outreach, briefs, and contracts are executed by the skill through other channels (for example instagram-outreach or kelly-email) only after explicit approval.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Creators overview"></td>
    <td width="50%"><img src="assets/screenshots/creators.webp" alt="Kelly Creators candidates"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Pipeline funnel across the four phases, budget allocation, total reach, and the top fit-scored candidates.</td>
    <td><strong>Creators</strong><br>Sortable candidate cards with C³ ACE fit scores, platform, niche, and audience size.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/outreach.webp" alt="Kelly Creators outreach queue"></td>
    <td width="50%"><img src="assets/screenshots/roi.webp" alt="Kelly Creators ROI board"></td>
  </tr>
  <tr>
    <td><strong>Outreach</strong><br>Needs-review approval queue with editable outreach drafts and the FTC/claim disclosure gate.</td>
    <td><strong>ROI</strong><br>Per-creator spend, estimated value, CPM, and return once a partnership goes live.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-creators/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=creators&lang=en#/creators
/?demo=outreach&lang=en#/outreach
/?demo=roi&lang=en#/roi
/?demo=detail&lang=en#/creators/cr-lena-glow
```

Demo mode never reads local creator files or private config. Handles are invented — no real creators.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-creators/config.json`, then put platform tokens in local env files only. Never commit real creator data, tokens, or files under `app/.data/`.

---

# Kelly Creators（中文）

Kelly Creators 是一个本地 App-in-Skill 达人营销指挥台。智能体扫描候选创作者、评估匹配度、起草外联与创意 brief；你审核创作者卡片、批准外联与 brief、在内容发布前把关，并跟踪投放 ROI。整体围绕达人营销的四个阶段：**发现 → 规划 → 激活 → 衡量**。

## 界面内容

- 总览：管道漏斗（发现 → 外联 → 谈判 → 进行中 → 已衡量）、预算分配与总触达。
- 创作者：带 C³ ACE 匹配分的候选卡片（平台、垂类、粉丝、互动率、报价），可按匹配分、粉丝、互动、成本排序。
- 外联：待审批队列，含可编辑的外联/brief 草稿、风险徽章，以及批准 / 请求修改 / 搁置决定；含内容质检门（可发布 / 需修改 / 禁止）。
- ROI：每位创作者的花费、预估价值、千次曝光成本与投资回报。
- 应用本身不发送任何内容。批准后的外联、brief 与合同仅在明确批准后，由技能通过其他渠道（如 instagram-outreach 或 kelly-email）执行。

## 演示模式

运行 `skills/kelly-creators/app/start.sh`，用启动器打印的 URL 加上 `?demo=…` 查看安全的模拟数据。演示模式不会读取本地创作者文件或私有配置，所有账号均为虚构。

## 私有配置

将 `config.example.json` 复制为 `config.local.json` 或 `~/.config/kelly-creators/config.json`，平台令牌仅存放在本地 env 文件中。切勿提交真实创作者数据、令牌或 `app/.data/` 下的文件。
