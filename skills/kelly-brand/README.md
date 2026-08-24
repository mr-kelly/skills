# Kelly Brand

Kelly Brand is a Busabase-backed App-in-Skill workbench for a brand's **narrative single source of truth**, organized around the **TALE** framework — **Trace → Architect → Land → Evaluate**. The agent drafts the message house; you curate which drafts become the **canonical** narrative; a drift monitor flags off-brand usage across channels.

## What It Shows

- **Overview** — the **message house**: the positioning statement, the value pillars, the overall Narrative Quality Score (NQS) with its SHIP / FIX / BLOCK gate, and the open drift-alert count.
- **Narrative** — message pillars plus vocabulary and guardrails, canonical vs draft, each editable with its NQS and TALE phase. Adopt / Request changes / Block per asset.
- **Stories** — the story bank and the proof points with their evidence (a named source and stat). A proof point with no source is blocked.
- **Drift** — off-brand usage the drift monitor flagged, each showing the offending copy vs the canonical guidance, with Approve fix / Dismiss.
- The AirApp never publishes anything. Adopting a draft as canonical and exporting the narrative are executed by the skill only after your explicit approval.

The left sidebar keeps fixed workflow filters (All / Needs Review / Canonical / Done / Blocked) alongside the views. "Canonical" is the label for the adopted (`approved`) state.

## TALE and the 16 sub-skills

Every narrative asset carries a TALE phase and names the sub-skill that produced it:

- **Trace** — narrative-baseline-mapper, category-narrative-mapper, audience-belief-mapper, positioning-truth-tracer.
- **Architect** — strategic-narrative-designer, message-system-architect, brand-language-codifier, story-bank-builder.
- **Land** — narrative-cascade-planner, pitch-narrative-builder, narrative-enablement-kit, proof-point-packager.
- **Evaluate** — message-test-designer, narrative-resonance-monitor, narrative-drift-monitor, and the gate: **narrative-quality-auditor ⛩** (NQS → SHIP / FIX / BLOCK).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Brand message house"></td>
    <td width="50%"><img src="assets/screenshots/drift.webp" alt="Kelly Brand drift alerts"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>The message house — positioning, value pillars, overall NQS, and the drift-alert count.</td>
    <td><strong>Drift</strong><br>Cross-channel off-brand alerts — offending usage versus the canonical guardrail.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/narrative.webp" alt="Kelly Brand narrative"></td>
    <td width="50%"><img src="assets/screenshots/stories.webp" alt="Kelly Brand story bank"></td>
  </tr>
  <tr>
    <td><strong>Narrative</strong><br>Message pillars and vocabulary guardrails, canonical versus draft.</td>
    <td><strong>Story bank</strong><br>Customer stories and evidence-backed proof points.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-brand-app install
pnpm --dir content/kelly-brand-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock brand ("Fernpath") without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=narrative&lang=en#/narrative
/?demo=stories&lang=en#/stories
/?demo=drift&lang=en#/drift
/?demo=settings&lang=en#/settings
```

Demo mode never reads or writes Busabase.

## Data

All state — narrative items and the cross-channel drift alerts they're
checked against, plus the brand profile — lives in three Busabase Bases
under one application Folder. See `SKILL.md` and `references/brand-schema.md`
for the resource map. `scripts/execute_decisions.mjs` is the trusted process
that promotes an approved item to canonical; it connects with
`BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID` and performs
no publishing itself.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
