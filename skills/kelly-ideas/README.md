# Kelly Ideas

Kelly Ideas is a Busabase-backed App-in-Skill idea vault with a business
consultant attached. It interrogates a vague idea until it is sharp, then
carries it through BRD, MRD, and PRD.

## What It Shows

- Idea vault: every idea, its current rung, and its derived clarity score.
- BRD / MRD / PRD: the document for the currently selected idea, or a pick-
  list of ideas that have one.
- Idea detail: overview (one-liner, who, problem, why-now), the consultant's
  questions and your answers, and the advance gate — blocked with a reason,
  or ready with one click.
- Rich documents: rendered GitHub-flavored Markdown with tables, images,
  strict-mode Mermaid diagrams, and sanitized SVG figures.
- Decision-grade output: a completed BRD, MRD, or PRD includes evidence and
  assumptions, a meaningful diagram, a decision table, risks, and testable
  success or acceptance criteria.
- The gate is the one hard rule: an idea cannot leave a rung while any
  required field is blank or any question on that rung is unanswered, and
  the check is re-derived server-side on every advance, not trusted from
  the UI.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Ideas overview"></td>
    <td width="50%"><img src="assets/screenshots/idea-detail.webp" alt="Kelly Ideas idea detail"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>What is waiting on you, what is ready to advance, and what has been parked.</td>
    <td><strong>Idea detail</strong><br>A finished idea's overview: one-liner, who it's for, the problem, and why now.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/questions.webp" alt="Kelly Ideas consultant questions"></td>
    <td width="50%"><img src="assets/screenshots/documents.webp" alt="Kelly Ideas PRD document"></td>
  </tr>
  <tr>
    <td><strong>Consultant questions</strong><br>Each question shows why it's being asked, and an answer/skip action.</td>
    <td><strong>PRD</strong><br>A completed document, with its status, version, and any recorded gaps.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-ideas-app install
pnpm --dir content/kelly-ideas-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see mock data without a Busabase connection:

```text
/?demo=1&lang=en#/overview
/?demo=needs-answer&lang=en#/ideas/idea-vague/questions
/?demo=ready&lang=en#/ideas/idea-email/prd
/?demo=parked&lang=en#/ideas/idea-parked
```

Demo mode never reads or writes Busabase.

## Data

All persistent data — ideas, documents, questions, and settings — lives in
Busabase Bases under one application Folder. See `SKILL.md` and
`references/ideas-schema.md` for the resource map and record shapes.
