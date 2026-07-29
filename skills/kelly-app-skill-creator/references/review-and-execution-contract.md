# Busabase Review And Execution Contract

Use this reference when an App-in-Skill collects human decisions, requests Agent
revision, claims work, prepares an external action, or reports execution.

## Contents

1. Responsibility boundary
2. Lifecycle and verdicts
3. Review record contract
4. Execution contract
5. Concurrency and recovery
6. Verification

## Responsibility Boundary

Keep three responsibilities distinct:

- The AirApp reads approved resources and records human edits, comments, and
  decisions only through ChangeRequest-producing procedures.
- A trusted Agent or Workflow reasons, revises, claims eligible work, resolves
  Vault-backed integrations, and performs any separately authorized external
  side effect.
- Busabase stores reviewable proposals, canonical records, decisions, claims,
  artifacts, and execution results.

The AirApp must never directly send, publish, delete, charge, transfer, or mutate
an external system. An `approved` domain item is eligible for its declared next
step; it is not blanket authorization to merge an unrelated ChangeRequest or
perform an external action whose own approval is still required.

## Lifecycle And Verdicts

Use workflow states rather than category labels. Adapt display copy to the domain
but preserve the semantics:

| State | Meaning |
| --- | --- |
| `needs_review` | A human must inspect, edit, decide, or opt out. |
| `changes_requested` | The human requested revision; an Agent task is pending. |
| `approved` or `ready` | The declared next step is eligible under the workflow policy. |
| `in_progress` | A named Agent/run owns the current attempt. |
| `done` | The defined deliverable or outcome exists and is referenced. |
| `blocked` | A named prerequisite, permission, target, or decision is missing. |

Do not introduce two approval queues for the same decision. For default-ready
work, model the opt-out window explicitly instead of pretending every item needs
approval.

Use these provider-neutral verdicts:

- `approve`: accept the declared proposal or next step;
- `request_changes`: send the item back for Agent revision;
- `revise`: save the human's edited proposal as a reviewable new version;
- `block`: prevent progression and record the reason.

Map the domain lifecycle to Base fields and, where canonical resources change,
to the exact Busabase ChangeRequest/review lifecycle. Do not assume a domain
`approved` value means a ChangeRequest has been merged.

## Review Record Contract

Use one stable item id plus a short visible reference such as `Review #12`. Keep
important fields human-readable in Base rather than one JSON blob:

- title, summary, source/evidence references, category and risk;
- lifecycle state, proposed action, reason, owner and relevant deadlines;
- editable draft or review note when the workflow needs one;
- verdict, decision comment, decider identity and decision time;
- deliverable, ChangeRequest, Doc, Drive/File, or external target references;
- execution status, attempt, result summary and terminal error.

Every decision must identify the item/version it reviewed. A stale UI must not
overwrite a newer proposal silently; return a conflict and reload the current
version.

Comments that explicitly request Agent work create or update a bounded Agent
task linked to the same item. Preserve the comment and resulting revision for
traceability instead of replacing the original proposal in place.

## Execution Contract

Model a real operation, not a generic `execute` verb. Before a trusted Agent or
Workflow acts, require:

- exact operation and target identifiers;
- eligibility and required verdict/version;
- integration/account identity and named Vault requirements;
- an idempotency key or equivalent duplicate-prevention rule;
- expected result and recovery behavior.

Re-read the canonical item, decision, target, and claim immediately before the
side effect. If a target, permission, secret requirement, or approval is missing,
move to `blocked` with one actionable recovery request; never guess.

Write an execution result containing operation, target, attempt/run identity,
started/completed timestamps, status, canonical artifact/result references, and
a sanitized error or blocked reason. Do not mark `done` merely because a job
started or a draft was generated.

## Concurrency And Recovery

Use Busabase records, versions, atomic claims, or ChangeRequest state as the
concurrency guard. Do not create a canonical local lock file.

Record claimant, run id, claim time, attempt, and heartbeat when needed. Reject
or reconcile stale writes using the reviewed version. Retries must reuse the
idempotency contract and must not duplicate messages, publishing, records,
files, payments, or other effects.

Keep the UI readable while work is claimed, but disable conflicting edits and
avoid redrawing an active textarea. Interrupted Agent runs remain recoverable
from the Busabase item, claim, decision, and result records alone.

## Verification

Verify:

- every UI action maps to one declared verdict or operation;
- domain state and ChangeRequest state are not conflated;
- request-changes creates traceable Agent work and a new review version;
- stale decisions and concurrent claims fail safely;
- missing targets and permissions become actionable `blocked` states;
- retries do not duplicate the side effect;
- execution reports contain concrete operations, targets, results, and errors;
- the AirApp cannot directly perform third-party side effects or read Vault
  values.
