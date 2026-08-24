# Revenue-Share Contract Simulator

Kelly Revenue-Share Simulator is a Busabase-backed App-in-Skill
control-panel/workspace for modeling revenue-based-financing (RBF) deals for
SME businesses such as retail and F&B chain stores. It never fetches live
revenue/banking data and never moves money — every number comes from
analyst-entered inputs run through pure, deterministic math. Creating,
editing, and deleting a scenario, and recording the underwriting decision,
are all direct writes made straight to Busabase — there is no separate
review/approval queue.

## What It Shows

- Overview: portfolio-level metrics across saved scenarios — average
  effective annualized cost, how many are flagged, and how many still need an
  underwriting decision.
- Scenarios: a filterable list (`All`, `Undecided`, `Approved`, `Needs
  Revision`, `Rejected`) plus a form to create or edit a scenario's inputs
  (average monthly revenue, revenue volatility, principal, initial and
  step-down revenue-share rates, repayment cap multiple, term length).
- Scenario detail: projected monthly cash flow and cumulative repayment
  chart, the Cash-Flow Payout Multiple (a P/E-like ratio of principal to
  annualized repayment cash flow), the implied effective annualized merchant
  cost, rule-based risk flags (cap not reached within term, merchant cost too
  high, high revenue volatility, thin term buffer), a decision panel (approve
  for underwriting / needs revision / reject) with a note, and delete.
- Comparison: pick any saved scenarios for a side-by-side table of inputs,
  projected repayment, payout multiple, effective cost, and decisions.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Revenue-Share Simulator overview"></td>
    <td width="50%"><img src="assets/screenshots/scenario-detail.webp" alt="Revenue-Share Simulator scenario detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Portfolio-level summary across saved scenarios: average effective cost, flagged deals, and deals still needing an underwriting decision.</td>
    <td><strong>Scenario detail</strong><br>Cash-flow/cumulative-repayment chart, Cash-Flow Payout Multiple, effective annualized merchant cost, risk flags, and the decision panel.</td>
  </tr>
  <tr>
    <td colspan="2" width="100%"><img src="assets/screenshots/comparison.webp" alt="Revenue-Share Simulator comparison"></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Comparison</strong><br>Side-by-side table of selected scenarios' inputs, projected repayment, payout multiple, effective cost, and decisions.</td>
  </tr>
</table>

## Demo Mode

Run the app and open a safe, fully offline mock scene:

```bash
pnpm --dir skills/kelly-revshare-simulator/content/kelly-revshare-simulator-app dev
```

Use the printed local URL, then add one of these demo paths:

```text
/?demo=1&lang=en#/overview
/?demo=scenarios&lang=en#/scenarios
/?demo=detail&lang=en#/scenarios/bubble-tea-chain-12-stores
/?demo=comparison&lang=en#/comparison
```

Add `lang=zh` for the Chinese UI chrome, e.g. `/?demo=1&lang=zh#/overview`.

Demo mode is fully offline (four scenarios ported verbatim from the retired
`content/kelly-revshare-simulator-app/server/demo.ts`) and never reads or writes Busabase; create/edit/delete/
decision actions taken while `?demo=` is set only update in-memory state in
the browser tab.

## Busabase Data

The AirApp is Busabase-backed: scenarios and settings both live in Busabase
Bases declared in `content/kelly-revshare-simulator-app/app/js/config.js` (see `references/ui-schema.md`).
Resources provision lazily on first run. There is no local file storage and
no separate provider choice.
