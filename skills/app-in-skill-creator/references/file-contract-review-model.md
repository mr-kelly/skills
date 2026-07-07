# File Contract And Review Model

Use this reference when designing handoff files, review states, batch schemas, decisions, agent tasks, or execution reports.

## File Contract

Use predictable JSON files so both the agent and UI can recover after interruption:

- `app/.data/onboarding.json`: onboarding completion marker. Absent or `completed:false` means the skill is still in onboarding.
- `app/.data/current_batch.json`: latest agent-generated batch.
- `app/.data/decisions.json`: user decisions and notes keyed by item id.
- `app/.data/execution_report.json`: latest execution results or merge log.
- `app/.data/agent_tasks.json`: queued agent work, usually items in `changes_requested` or carrying an `@ai` comment.
- `app/.data/agent.lock`: temporary lock while the skill is generating, writing, or executing.

Keep files minimal and auditable. Store only the content needed for review and execution.

## Workflow States

Prefer workflow states over domain categories. These states mirror Busabase's change-request lifecycle so the vocabulary holds whether the backing store is local files or Busabase:

- `needs_review`: user must give a verdict, edit, block, or approve.
- `changes_requested`: the user asked the agent to revise; the agent re-drafts and returns the item to `needs_review`.
- `approved`: a concrete next step is ready for the agent to merge, execute, or continue.
- `done`: action completed, merged to the canonical artifact, or intentionally no-op.
- `blocked`: cannot proceed without new information or external state.

Avoid an extra `to_approve` layer unless the human truly must approve each item before anything can continue. If the item already has a safe, concrete, reversible next step, put it under `approved` or an equivalent "ready for agent next" state.

Show categories and risks as badges, not primary navigation.

## Review Model

The file handoff is the local serialization of one review model, shared with Busabase.

| Term | Meaning | Local file | Busabase |
| --- | --- | --- | --- |
| change request | what the agent prepared: a proposed creation or edit awaiting review | items in `current_batch.json` | `change_request` |
| operation | one change inside a change request, with before -> after fields | an item's fields + draft | `operation` |
| review | a human verdict on a change request | entry in `decisions.json` | `review` |
| verdict | the decision verb | `decision.action` | review verdict + revise operations |
| merge | apply an approved change to the canonical/published artifact | `execution_report.json` + export | merge to canonical record |
| comment | a note on an item; `@ai` asks the agent to act | comment/note field | `comment` |
| agent task | queued work for the agent | `agent_tasks.json` | agent task endpoint |

Use this vocabulary consistently across the skill, app, scripts, and providers so switching backends is a configuration change, not a rewrite.

## Verdict Verbs

Use provider-neutral verdict verbs:

- `approve`: verdict approved; the item becomes `approved` and is eligible for merge or execution.
- `request_changes`: ask the agent to revise; the item moves to `changes_requested` and is enqueued as an agent task.
- `revise`: the human saved their own edit as a new version; the item stays in review.
- `block`: reject or close the item.

Domain-specific action labels can be simpler in the UI, such as `archive`, `publish`, `send`, or `export`, but the decision file should map them into a concrete provider-neutral verdict plus a domain operation.

## App Types

App-in-Skill does not mandate one app shape. Pick the type that fits the work, or combine several in one app.

| App type | User is | Data shape | Stateful |
| --- | --- | --- | --- |
| Review queue | judging/editing exceptions and approving meaningful actions | list of items + decisions | yes |
| Dashboard | monitoring | metrics, status, reports | usually no |
| Workspace | creating/editing | drafts, assets, collections | partly |
| Control panel | configuring/launching | parameters, modes, triggers | partly |
| Collaboration | handing off/deciding together | shared items + actors | yes |

The review queue is the most common pattern: the agent prepares a batch with proposed actions and drafts; the human judges exceptions, edits, blocks, or approves meaningful actions; the skill executes.

Types compose. A content workflow may show a workspace for drafting, a review queue for approval, and a dashboard for performance in one app or several apps sharing a provider.

## Review Queue Batch Schema

The schema below is a minimal starting point for review queues. Other app types adapt it.

```json
{
  "batch_id": "skill-YYYYMMDD-HHMMSS",
  "generated_at": "ISO timestamp",
  "source": "skill-name",
  "mode": "app-in-skill",
  "metrics": {
    "needs_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "items": [
    {
      "id": "stable local id",
      "title": "human-readable title",
      "summary": "short summary",
      "body": "trimmed source content for review",
      "category": "customer|system|finance|other",
      "risk": ["money"],
      "status": "needs_review|changes_requested|approved|done|blocked",
      "proposed_action": "archive|send_reply|draft_reply|no_action",
      "reason": "why this action is proposed",
      "draft": "optional editable draft",
      "suggested_reply": "optional agent-recommended reply draft for review-first items",
      "decision": {
        "action": "approve|request_changes|draft_reply|revise|block|no_action",
        "comment": "user note",
        "decided_at": "ISO timestamp"
      },
      "execution": {
        "status": "pending|executed|blocked|error",
        "operation": "domain-specific operation",
        "target": "optional target id/path/folder/channel",
        "reason": "optional result detail",
        "executed_at": "ISO timestamp"
      }
    }
  ]
}
```

Write a validator before relying on a schema for external actions.

## Execution Semantics

Model execution plans as real domain actions, not generic verbs.

A local approval may be named simply in the UI, but the execution report should contain:

- the concrete operation,
- target identifiers,
- connector/account/source ids,
- safety flags,
- execution result,
- blocked/error reason when applicable.

Examples:

- `operation`: `move_to_folder`, `target_folder`: configured destination, `mark_read`: true.
- `operation`: `publish_post`, `channel`: configured channel id, `draft_id`: stable local id.
- `operation`: `export_file`, `path`: output path, `format`: `markdown`.

If a target is missing, block and ask for configuration instead of guessing.

Execution should be idempotent where possible. Store stable item ids and execution results, and re-read decisions immediately before execution.
