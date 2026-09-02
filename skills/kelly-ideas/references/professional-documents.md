# Professional BRD, MRD, and PRD Quality Standard

Read this reference before drafting, revising, or marking a Kelly Ideas document complete. The
goal is not maximum length. The goal is a professional artifact that preserves the operator's
reasoning, supports a real decision, and can be handed to the next person or Agent without a second
interview.

## Industry Reference Baseline

This standard adapts, rather than copies, four established bodies of practice:

- [IIBA Business Analysis Standard](https://www.iiba.org/knowledgehub/the-business-analysis-standard/4-implementing-business-analysis/4-4-understanding-requirements-and-designs/): keep business goals, stakeholder needs, solution requirements, and transition requirements distinguishable.
- [Atlassian product requirements guidance](https://www.atlassian.com/software/confluence/templates/product-requirements): connect objectives to success metrics; expose assumptions, options, user stories, supporting designs, open questions, and explicit out-of-scope items.
- [Aha! MRD guidance](https://www.aha.io/roadmapping/guide/requirements-management/what-is-a-market-requirements-document): keep the MRD rooted in market research and focused on the opportunity, target customers, alternatives, high-level capabilities, and metrics rather than detailed implementation.
- [W3C WAI accessibility principles](https://www.w3.org/WAI/fundamentals/accessibility-principles/): make non-text alternatives, adaptable presentation, perceivable content, keyboard operation, understandable errors, and testing with users part of product acceptance when the product has a user interface.

These sources are reference anchors, not evidence that a particular idea is viable. Market claims still require the operator's evidence or a cited primary source.

## Document Boundaries

Each document owns a different decision. Do not repeat the same feature list three times under different headings.

| Document | Decision it enables | Proper level of detail | Must not become |
| --- | --- | --- | --- |
| BRD | Invest, pause, or stop | Business outcomes, stakeholder needs, constraints, value, success measures | A feature backlog or UI specification |
| MRD | Choose the market, ICP, positioning, and validation path | Research-backed market/customer needs and high-level capabilities | A speculative TAM slide or detailed implementation plan |
| PRD | Commit a release scope that design, engineering, and QA can implement and verify | User behavior, requirement IDs, states, permissions, integrations, acceptance, rollout | An architecture implementation spec or an unprioritized wish list |

The flow is directional: BRD business requirements justify the change; MRD stakeholder and market needs choose where to compete; PRD solution and transition requirements define the release. If a downstream discovery invalidates an upstream decision, revise the upstream document and increment its version rather than hiding the contradiction in the PRD.

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

Recommended section order:

1. Executive decision summary.
2. Evidence, assumptions, and unknowns.
3. Target stakeholders and current-state journey.
4. Cost of the status quo and desired business outcome.
5. Options considered and recommended direction.
6. Objectives, baselines, thresholds, and measurement.
7. Constraints, dependencies, risks, and non-goals.
8. Investment decision, owner, and next gate.

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

Recommended section order:

1. Market decision summary and scope.
2. Evidence quality and research coverage.
3. Primary ICP, buyer, user, and excluded segments.
4. Jobs, triggers, anxieties, and buying context.
5. Current alternatives and competitive dimensions.
6. Positioning, differentiated promise, and reasons to believe.
7. High-level capabilities, never detailed UI or engineering design.
8. Pricing/packaging hypotheses and route to first users.
9. Validation experiments, thresholds, risks, and next market decision.

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

Recommended section order:

1. Product intent, release decision, owner, and status.
2. Actors, user outcomes, and concrete user stories.
3. Scope, priorities, release boundary, and non-goals.
4. Information architecture and primary user flow.
5. Functional requirements with stable IDs and observable acceptance criteria.
6. Non-functional requirements: performance, reliability, privacy, security, accessibility, localization, and auditability as applicable.
7. State model covering loading, empty, success, error, retry, recovery, re-entry, and cancellation.
8. Data objects, ownership, retention, integrations, and permission boundaries.
9. Instrumentation, rollout, migration/transition, rollback, and operational readiness.
10. Requirement-to-acceptance traceability, unresolved questions, and handoff decision.

### Requirement Classification

Use the IIBA classification to prevent important requirements from disappearing inside a feature list:

| Requirement type | Question to answer in Kelly Ideas | Typical destination |
| --- | --- | --- |
| Business | What outcome justifies the change? | BRD objectives and success measures |
| Stakeholder | What must each user, buyer, approver, operator, or affected party be able to achieve? | BRD/MRD needs and PRD user stories |
| Solution: functional | What behavior or information must the release provide? | PRD requirement IDs and acceptance criteria |
| Solution: non-functional | How well and under what constraints must it work? | PRD performance, reliability, privacy, security, accessibility, localization |
| Transition | What migration, onboarding, rollout, training, or rollback is needed to reach the target state? | PRD rollout and operational readiness |

### Accessibility Is A Requirement, Not Polish

For any product with a user interface, name the relevant accessibility requirements and how they will be tested. At minimum consider text alternatives for non-text content, adaptable layouts, contrast and readable scaling, keyboard operation, focus visibility, understandable instructions and errors, and assistive-technology testing. Do not claim WCAG conformance from a visual review alone; identify the target level and the required conformance testing when it matters.

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

## Final Review Protocol

Before writing `status: 已完善`, read the rendered document from top to bottom and answer yes to all applicable checks:

1. Does the first screen state the decision, target user, evidence strength, and current status?
2. Can every confirmed claim be traced to an answered question or primary source?
3. Are assumptions paired with a validation method and unknowns paired with a next question?
4. Does every table help make a decision, and does every visual explain a relationship that prose alone would obscure?
5. Are goals measurable, with baseline status, threshold, owner, and measurement method where applicable?
6. Does the document stay inside its BRD/MRD/PRD boundary?
7. Are privacy, security, accessibility, failure recovery, and irreversible actions explicit where relevant?
8. Are non-goals, dependencies, risks, next decision, and handoff readiness visible?

If any answer is no and the omission could change the decision, keep the document in draft and add the blocking item to `gaps`.
