# Claim Verification Workflow

Every product claim in a video's `hook` / `pain_point` / `concept` / shot `script_line`
must be checked against the actual codebase before the video is marked `approved`. This
is not optional — three real corrections have already come out of this workflow (Vault
vs "钱包", Assets vs "网盘", the AI-agent-vs-APP production-database distinction).

## Procedure

1. **Extract claims.** Read the outline (or the existing `videos` record's `hook` /
   `pain-point` / `concept` / each linked shot's `script-line`) and list every factual
   claim about product behavior: feature names, file paths, API capabilities, positioning
   statements ("open source", "self-hostable", "no wallet, just Vault", etc).
2. **Verify each claim against the repo, not memory.** Use the `Explore` agent (or
   `general-purpose` for cross-repo claims) with a concrete, falsifiable question per
   claim batch — see the pattern used for the three existing videos:
   - "Does X literal feature/route/component exist? Where?"
   - "Does the docs/README explicitly support or contradict this positioning claim?"
   - Always ask for file paths as evidence, not just a yes/no.
3. **Write the correction table**, one row per claim:

   ```markdown
   | 原草稿说法 | 核实结果 |
   | --- | --- |
   | claim as originally stated | ✅/❌/🔄 + evidence + corrected wording |
   ```

   Use ✅ for confirmed-as-is, ❌ for wrong (needs rewrite), 🔄 for "technically different
   but the intent survives once reworded" — this last case is common: the human's mental
   model is usually directionally right and just needs vocabulary correction, not a
   rewrite of the idea.
4. **Rewrite the affected shots' `script_line`** to match the verified wording — never
   ship a shot whose script contradicts its own `code_reference`.
5. **If the human corrects your correction** (as happened twice on video 2 — the
   production-database claim and the cross-agent-sharing claim), that means you
   misunderstood their intent, not that the code changed. Re-verify against what they
   actually meant, update the table, and say plainly what changed and why.
6. Store the finished table in the `videos` record's `verified-claims` field (markdown).
   This field is the audit trail — never leave it blank or skip straight to `approved`.

## When to re-run

Re-run verification before `status` moves from `needs_review` to `approved` any time the
underlying app code has changed since the claims were last checked, or the human edits
the outline after initial verification.
