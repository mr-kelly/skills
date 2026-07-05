#!/usr/bin/env node
// CLI for the reply-draft review loop. This is how the kelly-email skill drives
// lib/reply-review/ in the real flow — local or busabase, selected by
// KELLY_EMAIL_REPLY_PROVIDER. The triage handoff is untouched; this covers only
// the reply-draft edit-to-canonical slice.
//
// Usage:
//   reply_review.mjs open --email-id <id> --to <addr> --subject <s> --draft <text|-> [--thread-id <t>]
//   reply_review.mjs list
//   reply_review.mjs review <reply_id> --verdict approve|request_changes|revise|block [--edits <text|->] [--comment <c>]
//   reply_review.mjs approved <reply_id>      # prints the approved reply JSON (for the skill to send), or nothing
//   reply_review.mjs sent <reply_id>          # mark as sent (merge/close); call AFTER the skill sends
//   reply_review.mjs tasks                    # reply drafts in changes_requested (agent should revise)
//
// "--draft -" / "--edits -" reads that value from stdin (for long bodies).

import { createReplyReviewStore } from "../lib/reply-review/index.ts";

const argv = process.argv.slice(2);
const command = argv[0];
const positional: string[] = [];
const flags: Record<string, string | boolean> = {};
for (let i = 1; i < argv.length; i += 1) {
  const part = argv[i];
  if (part.startsWith("--")) {
    const key = part.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i += 1;
    }
  } else {
    positional.push(part);
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function resolveText(value: string | boolean | undefined): Promise<string> {
  if (value === "-") return (await readStdin()).trim();
  return typeof value === "string" ? value : "";
}

function str(value: string | boolean | undefined): string {
  return typeof value === "string" ? value : "";
}

function out(value: unknown) {
  process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

const store = await createReplyReviewStore();

try {
  if (command === "open") {
    const draft = await resolveText(flags.draft || "");
    const res = await store.openReplyDraft({
      email_id: str(flags["email-id"]),
      to: str(flags.to),
      subject: str(flags.subject),
      draft,
      thread_id: str(flags["thread-id"]),
    });
    out(res);
  } else if (command === "list") {
    out(await store.listReplyDrafts());
  } else if (command === "review") {
    const reply_id = positional[0];
    if (!reply_id) throw new Error("review needs a <reply_id>");
    const edits = flags.edits !== undefined ? await resolveText(flags.edits) : undefined;
    out(await store.reviewReply(reply_id, { verdict: str(flags.verdict), edits, comment: str(flags.comment) }));
  } else if (command === "approved") {
    const reply_id = positional[0];
    if (!reply_id) throw new Error("approved needs a <reply_id>");
    const reply = await store.getApprovedReply(reply_id);
    if (reply) out(reply);
  } else if (command === "sent") {
    const reply_id = positional[0];
    if (!reply_id) throw new Error("sent needs a <reply_id>");
    out(await store.markSent(reply_id));
  } else if (command === "tasks") {
    out(await store.listAgentTasks());
  } else {
    process.stderr.write("Usage: reply_review.mjs open|list|review|approved|sent|tasks ... (see file header)\n");
    process.exit(1);
  }
  out(`# provider: ${store.kind}`);
} catch (error) {
  process.stderr.write(`reply_review error: ${error.message}\n`);
  process.exit(1);
}
