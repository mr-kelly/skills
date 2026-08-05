# Kelly Finance

Kelly Finance is a Busabase-backed App-in-Skill **FP&A and corporate-finance
modeling desk**. It builds clean three-statement models with a
dependency-free Python starter-model script, and gives you a calm browser UI
to review model KPIs, work through a check queue, leave notes, approve or
block, and hand agent work back — before anything is delivered to investors
or written back to the source-of-truth books.

## What It Shows

- **Overview**: model KPI cards (revenue, gross margin, ending cash, free cash flow) with a five-year forecast table (revenue → gross profit → EBITDA → net income → ending cash → free cash flow) and a "needs attention" panel counting checks that need a note, are ready for the agent, or are blocked.
- **Checks**: the model-audit review queue — balance-sheet ties, cash roll-forward, net income → retained earnings, depreciation ↔ PP&E, debt/interest linkage, working-capital movements — each with evidence and approve / request-changes / block / dismiss controls.
- **Workbook**: the generated workbook path and its tab contract (Assumptions, Income Statement, Balance Sheet, Cash Flow, Checks).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Finance model overview"></td>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Kelly Finance model audit checks"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Model KPI cards and a five-year forecast table (revenue through free cash flow), with a needs-attention summary.</td>
    <td><strong>Model audit checks</strong><br>Review queue for statement ties, hardcodes, formula direction, and debt/working-capital linkage — each check approvable, blockable, or sent back with a note.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/workbook.webp" alt="Kelly Finance workbook tab contract"></td>
    <td width="50%"></td>
  </tr>
  <tr>
    <td><strong>Workbook</strong><br>Generated workbook path plus the tab contract — Assumptions, Income Statement, Balance Sheet, Cash Flow, Checks — reviewed before any approved export.</td>
    <td></td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe mock-data model:

```bash
pnpm --dir skills/kelly-finance/app dev
```

Then open `http://127.0.0.1:<port>/?demo=1#/overview` (add `lang=zh` for the
Chinese UI). Demo mode opens a deterministic offline model (`ExampleCo`, a
five-year fundraising forecast) and never reads or writes Busabase; demo
decisions stay in the browser.

## Create A Three-Statement Template

```bash
node skills/kelly-finance/scripts/build_three_statement_model.mjs \
  --company "ExampleCo" --start-year 2026 --years 5 \
  --currency USD --base-revenue 1000000 --seed-checks --apply
```

The dependency-free `scripts/build_three_statement_model.py` (kept as Python
— see `SKILL.md`) emits an `.xlsx` with `Assumptions`, `Income Statement`,
`Balance Sheet`, `Cash Flow`, and `Checks` tabs; the `.mjs` wrapper writes
the result to Busabase. See `references/three-statement-modeling.md` for the
review checklist and model-quality bar, and `references/finance-ui-schema.md`
for the Busabase field contract.

## Boundary

The app reads and writes its own Busabase Bases only. It never connects to
banks or accounting/ERP systems, sends files, moves money, or changes
external systems. Any real external action (sending a model to investors,
changing source-of-truth books) is approval-required and executed by the
agent outside the app after human review.

---

## 中文说明

Kelly Finance 是一个基于 Busabase 的 App-in-Skill **FP&A 与公司财务建模桌面**：用无依赖的 Python 脚本搭建规范的三表起始模型，并提供一个安静的浏览器操作台，用于查看模型 KPI、逐项过一遍检查队列、留备注、批准或拦截、把返工交还给代理——一切都在交付给投资人或写回源账本之前完成。

- **总览**：营收、毛利率、期末现金、自由现金流等 KPI 卡片，配五年预测表（营收→毛利→EBITDA→净利→期末现金→自由现金流），以及统计"需处理"检查项的提醒面板。
- **检查**：模型审计审核队列——资产负债表勾稽、现金滚动、净利→留存收益、折旧↔固定资产、债务/利息联动、营运资本变动——每项带证据，可批准 / 要求修改 / 拦截 / 忽略。
- **工作簿**：生成的工作簿路径与其页签契约（假设、利润表、资产负债表、现金流量表、检查）。

演示模式（`?demo=1`，可加 `lang=zh`）打开一个确定性的离线模型（虚构公司 ExampleCo），不读取或写入 Busabase。App 只读写自己的 Busabase Base，绝不连接银行/ERP、发送文件或转移资金；任何对外动作都需人工审核后由代理在 App 外执行。
