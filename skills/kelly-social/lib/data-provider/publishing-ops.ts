// Pure reducer for ECHO publishing-desk operations.
//
// Given the current snapshot and one PublishingOperation, return a NEW snapshot
// with the relevant ECHO section updated. It never touches the monitoring
// sections (accounts / posts / sync_log / warnings). Both providers route their
// applyOperation() through this so local and Busabase stay behavior-identical.
//
// The app writes local state only; a publish_post / send_reply records the
// approval + intent (status -> done, scheduled_for) — the skill performs the
// real platform action out of band after approval. Erasable TS only, no deps.

import type {
  EngagementItem,
  PostDraft,
  PublishingOperation,
  ReviewStatus,
  ShortScript,
  SocialSnapshot,
} from "../types.ts";

const REVIEW_STATES: ReviewStatus[] = ["needs_review", "changes_requested", "approved", "done", "blocked"];

function assertStatus(status: unknown): ReviewStatus {
  if (typeof status !== "string" || !REVIEW_STATES.includes(status as ReviewStatus)) {
    const error = new Error(`Invalid review status: ${String(status)}. Expected one of ${REVIEW_STATES.join("|")}.`);
    (error as { statusCode?: number }).statusCode = 400;
    throw error;
  }
  return status as ReviewStatus;
}

function notFound(what: string, id: string): never {
  const error = new Error(`${what} not found: ${id}`);
  (error as { statusCode?: number }).statusCode = 404;
  throw error;
}

export function applyPublishingOperation(snapshot: SocialSnapshot, op: PublishingOperation): SocialSnapshot {
  const now = new Date().toISOString();
  const next: SocialSnapshot = {
    ...snapshot,
    calendar: [...(snapshot.calendar || [])],
    drafts: [...(snapshot.drafts || [])],
    shorts: [...(snapshot.shorts || [])],
    engagement: [...(snapshot.engagement || [])],
    crisis: snapshot.crisis
      ? { ...snapshot.crisis, steps: [...snapshot.crisis.steps] }
      : { status: "calm", publishing_paused: false, steps: [] },
    share_of_voice: snapshot.share_of_voice,
  };

  switch (op.operation) {
    case "review_draft": {
      const status = assertStatus(op.status);
      const index = (next.drafts as PostDraft[]).findIndex((draft) => draft.draft_id === op.draft_id);
      if (index < 0) notFound("draft", op.draft_id);
      // Never let a human approve past a hard gate BLOCK.
      const draft = (next.drafts as PostDraft[])[index];
      if (status === "approved" && draft.gate?.verdict === "BLOCK") {
        const error = new Error("Cannot approve a draft the social-qa gate BLOCKed. Revise it first.");
        (error as { statusCode?: number }).statusCode = 422;
        throw error;
      }
      (next.drafts as PostDraft[])[index] = {
        ...draft,
        status,
        review_note: op.review_note ?? draft.review_note,
        updated_at: now,
      };
      return next;
    }

    case "publish_post": {
      const index = (next.drafts as PostDraft[]).findIndex((draft) => draft.draft_id === op.draft_id);
      if (index < 0) notFound("draft", op.draft_id);
      const draft = (next.drafts as PostDraft[])[index];
      if (draft.gate?.verdict === "BLOCK") {
        const error = new Error("Cannot publish a draft the social-qa gate BLOCKed.");
        (error as { statusCode?: number }).statusCode = 422;
        throw error;
      }
      if (draft.status !== "approved") {
        const error = new Error("Cannot publish a draft that has not been human-approved.");
        (error as { statusCode?: number }).statusCode = 422;
        throw error;
      }
      (next.drafts as PostDraft[])[index] = {
        ...draft,
        status: "done",
        scheduled_for: op.scheduled_for ?? draft.scheduled_for ?? now,
        review_note: op.channel ? `Publish intent recorded for ${op.channel}.` : draft.review_note,
        updated_at: now,
      };
      // Reflect on the calendar if a slot links to this draft.
      next.calendar = (next.calendar || []).map((entry) =>
        entry.draft_id === op.draft_id
          ? { ...entry, status: "scheduled", scheduled_for: op.scheduled_for ?? entry.scheduled_for }
          : entry,
      );
      return next;
    }

    case "review_short": {
      const status = assertStatus(op.status);
      const index = (next.shorts as ShortScript[]).findIndex((short) => short.short_id === op.short_id);
      if (index < 0) notFound("short", op.short_id);
      const short = (next.shorts as ShortScript[])[index];
      (next.shorts as ShortScript[])[index] = {
        ...short,
        status,
        review_note: op.review_note ?? short.review_note,
        updated_at: now,
      };
      return next;
    }

    case "review_engagement": {
      const status = assertStatus(op.status);
      const index = (next.engagement as EngagementItem[]).findIndex((item) => item.item_id === op.item_id);
      if (index < 0) notFound("engagement item", op.item_id);
      const item = (next.engagement as EngagementItem[])[index];
      (next.engagement as EngagementItem[])[index] = {
        ...item,
        status,
        review_note: op.review_note ?? item.review_note,
      };
      return next;
    }

    case "send_reply": {
      const index = (next.engagement as EngagementItem[]).findIndex((item) => item.item_id === op.item_id);
      if (index < 0) notFound("engagement item", op.item_id);
      const item = (next.engagement as EngagementItem[])[index];
      if (item.status !== "approved") {
        const error = new Error("Cannot send a reply that has not been human-approved.");
        (error as { statusCode?: number }).statusCode = 422;
        throw error;
      }
      (next.engagement as EngagementItem[])[index] = {
        ...item,
        status: "done",
        review_note: op.channel ? `Reply intent recorded for ${op.channel}.` : "Reply sent.",
      };
      return next;
    }

    case "crisis_toggle": {
      const crisis = next.crisis;
      if (op.status) crisis.status = op.status;
      if (typeof op.publishing_paused === "boolean") crisis.publishing_paused = op.publishing_paused;
      if (op.step_id) {
        crisis.steps = crisis.steps.map((step) =>
          step.step_id === op.step_id ? { ...step, done: typeof op.done === "boolean" ? op.done : !step.done } : step,
        );
      }
      crisis.updated_at = now;
      return next;
    }

    default: {
      const error = new Error(`Unknown operation: ${(op as { operation?: string }).operation}`);
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }
  }
}
