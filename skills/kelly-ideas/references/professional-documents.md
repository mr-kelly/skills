# Professional BRD, MRD, and PRD Quality Standard

Read this reference before drafting, revising, or marking a Kelly Ideas document complete. The
goal is not maximum length. The goal is a professional artifact that preserves the operator's
reasoning, supports a real decision, and can be handed to the next person or Agent without a second
interview.

## Shared Quality Gate

Every completed document must:

1. Start with the user or business decision, not implementation detail.
2. Separate **confirmed evidence**, **assumptions to validate**, and **unknowns**. Never turn an
   unanswered consultant question into a confident claim.
3. Explain the current state, desired outcome, constraints, risks, and the decision this document
   enables.
4. Include at least one meaningful diagram and one decision-oriented table. A diagram must explain
   a journey, flow, state transition, system boundary, or causal relationship. A table must support
   comparison, prioritization, ownership, metrics, risk, or acceptance decisions.
5. Give every important metric a definition, baseline status, target or decision threshold, and
   measurement method. Mark unvalidated numbers as hypotheses.
6. End with open questions and the next decision or handoff. A reader must know what happens next.

Use concise prose, but do not collapse distinct decisions into one paragraph. Prefer concrete
examples, exact user operations, and visible failure/recovery behavior over generic claims such as
"improve efficiency" or "better experience".

## Evidence Language

Use these labels consistently:

- **Confirmed:** supplied by the operator through an answered question or supported by a cited
  primary source.
- **Assumption:** plausible but not yet validated. State how it will be tested.
- **Unknown:** materially unanswered. Create a consultant question when the answer blocks a
  decision.
- **Decision:** a deliberate choice made from the evidence and assumptions; not a fact about the
  market or user.
- **Inference:** the team's interpretation of confirmed evidence; keep it distinguishable from the
  evidence itself.

Use machine-readable provenance markers next to claims:

- `[Q:<record-id>]` for an answered Kelly Ideas consultant question;
- `[SRC:<primary-url>]` for an external primary source;
- `[ASSUMPTION]` and `[UNKNOWN]` when no evidence exists yet;
- `[DECISION]` and `[INFERENCE]` to distinguish a chosen direction or interpretation from evidence.

Wrap provenance markers in Markdown inline code when writing a document, for example
`` `[Q:q-e1]` `` or `` `[ASSUMPTION]` ``, so the AirApp renders them as compact reference chips.

Every confirmed claim must carry at least one provenance marker. Every referenced question ID must
exist in the idea's `questions` records and be answered. A vague phrase such as "from user
feedback" or "based on research" is not provenance.

Do not invent research citations, market size, conversion rates, user quotes, or baselines. When
external research is used, link the primary source next to the claim and distinguish source facts
from the team's inference.

## BRD: Why This Is Worth Doing

A professional BRD should make an investment or stop decision possible. Include:

- executive decision summary;
- target user and job to be done;
- current journey or workflow, with the painful moments made visible;
- problem evidence and cost of the status quo;
- functional, emotional, and business value;
- business objectives and measurable success criteria;
- strategic fit and why this operator or team can win;
- constraints, dependencies, risks, and explicit non-goals;
- assumptions, unknowns, and the next decision.

Recommended visuals:

- current-state journey or causal problem map;
- before/after value chain;
- evidence and success-metric table;
- risk/decision matrix.

## MRD: Who Buys and Why This Wins

A professional MRD should make a target-segment and go-to-market decision possible. Include:

- market thesis and scope;
- primary ICP plus excluded or later segments;
- jobs, triggers, anxieties, objections, and buying context;
- alternatives used today, including manual work and doing nothing;
- competitive comparison based on verifiable dimensions;
- positioning, differentiated promise, and reasons to believe;
- pricing and packaging hypotheses, clearly labeled as hypotheses;
- route to the first users and the buying/adoption journey;
- demand-validation experiments with thresholds;
- market, channel, trust, and compliance risks;
- assumptions, unknowns, and the next market decision.

Recommended visuals:

- ICP/segment map;
- current alternatives comparison;
- acquisition or adoption journey;
- validation experiment table.

## PRD: What Gets Built and How We Know It Works

A professional PRD should let design and engineering build and verify the product without guessing
about user intent. Include:

- product intent and user outcome;
- personas or actors and concrete user stories;
- scope, priorities, non-goals, and release boundary;
- information architecture and primary navigation;
- end-to-end happy path plus error, empty, loading, retry, recovery, and re-entry states;
- functional requirements with stable IDs and priorities;
- human approval, permission, privacy, and irreversible-action boundaries;
- data objects and ownership at the level needed for implementation;
- acceptance criteria tied to visible user behavior;
- integration paths, instrumentation, rollout, and rollback;
- unresolved questions and handoff readiness.

Recommended visuals:

- primary user-flow diagram;
- state machine for work that changes status;
- system or data-boundary diagram when multiple components interact;
- requirement-to-acceptance matrix;
- failure/recovery matrix.

## Markdown and Visual Contract

- Use tables for comparisons, ownership, priorities, evidence, metrics, risks, and acceptance
  mappings.
- Use fenced `mermaid` blocks for flows, journeys, state transitions, and architecture with three
  or more connected parts.
- Use fenced `svg` blocks only for a bespoke diagram Mermaid cannot express. Include `<title>` and
  `<desc>`; never include scripts, styles, remote references, animation, or event handlers.
- Use Markdown images only for operator-approved or Busabase-hosted assets. Give every image useful
  alt text and explain what decision the image supports.
- Do not rely on raw HTML. The AirApp sanitizes stored Markdown and SVG, renders Mermaid in strict
  mode, and shows source fallback when a diagram is invalid.

After each visual, add one short sentence explaining the conclusion the reader should take from it.
If the same conclusion is already obvious from a nearby heading or table, do not repeat it.

## Draft vs. Complete

The `gaps` field contains **blocking document omissions**, not every remaining business
uncertainty. Keep the document as `草稿` when a missing answer could change the target user, value proposition,
scope, safety boundary, pricing posture, or acceptance criteria. List those gaps explicitly and
ask the next highest-value question.

Mark it `已完善` only when the document passes the shared quality gate and its next decision is
clear. `已完善` means ready for review or handoff, not that every uncertainty in the business has
been eliminated.
