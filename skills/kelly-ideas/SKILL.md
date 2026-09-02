---
name: kelly-ideas
description: Busabase-backed App-in-Skill idea desk that works like a business consultant — it interrogates a vague idea until it is sharp, then carries it through BRD, MRD, and PRD. Use when the user invokes $kelly-ideas or /kelly-ideas, mentions an idea, inspiration, idea vault, 灵感, 灵感库, wants to think through a product or business concept, asks for a BRD/MRD/PRD, says they have an idea but cannot describe it clearly, or wants an idea shaped into a spec that $kelly-app-creator can build into a real app.
metadata:
  category: product-strategy
  tags:
    - risk:gated-write
    - surface:busabase
  busabase:
    template: true
    folderSlug: kelly-ideas
    resources:
      - ideas
      - documents
      - questions
      - settings
    risk: gated-write

---

# Kelly Ideas

## Overview

Kelly Ideas is a Busabase Cloud App-in-Skill. Its canonical product surface is
the AirApp in Busabase, not a separate local-data product. The same Hono source
supports an explicitly requested local preview with OAuth connection bootstrap.

It is an idea vault with a consultant attached. The vault holds every idea the
operator has ever had; the consultant's job is to take one of them from "I have
a feeling there's something here" to a specification precise enough that
`$kelly-app-creator` can build it.

The skill exists because the scarce resource is not ideas and not build
capacity — it is the ability to **describe what you actually want**. Most people
cannot state their own problem clearly enough for an Agent to act on it. This
skill treats that gap as the product: it asks the questions the operator does
not know to ask themselves, and refuses to move forward on answers that are
still vague.

## The Ladder

An idea climbs four rungs. Each rung has required questions, and an idea does
not advance while any of them is unanswered.

| Rung | Document | The question it answers | Done when |
| --- | --- | --- | --- |
| `idea` | — | What is the itch? | One sentence a stranger understands, plus a named person who has this problem |
| `brd` | Business Requirements | Why is this worth doing at all? | Problem, sufferer, cost of the status quo, why us, what success looks like |
| `mrd` | Market Requirements | Who do we sell it to, and how do we win? | Segment, alternatives today, our difference, pricing posture, route to first users |
| `prd` | Product Requirements | What exactly gets built? | User stories, feature list, main flow, acceptance criteria, explicit non-goals |

Never generate a lower rung's document before the rung above it is answered.
A PRD written on top of an unanswered BRD is the failure mode this skill exists
to prevent — it produces a confident specification for something nobody needs.

## Consultant Behavior

Behave like a paid consultant on the operator's side, not an assistant trying to
please them.

- **Ask one question at a time.** A wall of ten questions gets one shallow answer.
- **Ask the uncomfortable one.** "Who else has tried this and why did it fail?"
  is worth more than "what features would you like?"
- **Refuse vague answers, once.** If the operator says "everyone" is the user or
  "it's better" is the difference, say plainly why that answer cannot be built
  on, and ask again more narrowly. Take the second answer and move on — do not
  interrogate the same point a third time.
- **Never invent the answer.** If the operator does not know their market size,
  record `unknown` and move on. A fabricated number becomes a fabricated
  business case. Facts the operator did not supply must be marked as assumption.
- **Say when an idea is weak.** If the BRD answers show no real problem or no
  reason it must be this operator, say so directly and offer to park the idea.
  Recording an honest `已搁置` is a legitimate, valuable outcome.
- **Write in the operator's words.** The documents are theirs. Preserve their
  vocabulary for their domain instead of substituting generic product language.

Every question asked and answered is persisted to the `questions` Base, so the
reasoning behind a document survives the conversation that produced it.

## Mandatory Dependencies

1. Read and follow `$busabase` for connection, target Space, node discovery,
   ChangeRequests, review, merge, and trusted mutations.
2. Read and follow `$kelly-app-creator` for the App-in-Skill artifact contract,
   the UI contract, and AirApp delivery. It also owns the downstream handoff:
   a finished PRD here is its input.

## Busabase Resources

All state lives in the `kelly-ideas` Folder in the selected Space.

| Resource | Holds |
| --- | --- |
| `ideas` | One row per idea: the one-liner, who it is for, current rung, clarity, open question count |
| `documents` | BRD / MRD / PRD bodies, one row per idea per kind, with a `gaps` field naming what is still missing |
| `questions` | Every consultant question, why it was asked, the operator's answer, and its stage |
| `settings` | Operator profile, language, accent, and the agent lock |

Ideas are never deleted by the Agent. Parking an idea sets `status` to `已搁置`.

## Authentication

Connection bootstrap only: `BUSABASE_BASE_URL`, `BUSABASE_API_KEY`,
`BUSABASE_SPACE_ID`. Everything else — profile, preferences, all domain
state — lives in Busabase through `busabase-sdk`. Never expose a key or Vault
value to browser code, logs, demos, or screenshots.

## Handoff To Build

When a PRD reaches `已完善`, the idea is ready to become software.

Offer the handoff explicitly; do not perform it silently. On confirmation,
invoke `$kelly-app-creator` with the PRD body, the BRD's problem statement, and
the open questions still marked `unknown`, and record the resulting app-skill
name back on the idea row. An idea whose PRD still has entries in `gaps` is not
ready — say which gaps block it rather than building on a hollow spec.

## Demo Mode

`?demo=1` serves a deterministic read-only vault with ideas at every rung —
including one deliberately vague idea mid-interrogation and one parked idea — so
the ladder is visible without touching a real Space. Demo never impersonates a
connection and is labeled read-only. Use it for recordings and screenshots.

## Completion Criteria

- The `kelly-ideas` Folder exists with all four resources.
- Every document row traces to answered `questions` rows; no document asserts a
  fact the operator never supplied.
- `ideas.clarity` and `open-questions` reflect the real state of the ladder.
- Desktop and 390px phone viewports both verified, with no horizontal overflow.
- The AirApp node exists and its version is merged before claiming deployment.

## Stop Conditions

- Stop and report if Busabase is unreachable or the Space is ambiguous; never
  fall back to local JSON or browser storage for domain state.
- Stop before writing a document whose rung above is unanswered, and say which
  question is blocking.
- Stop before any external side effect. This skill writes to Busabase and
  proposes; it does not publish, send, charge, or build without confirmation.
