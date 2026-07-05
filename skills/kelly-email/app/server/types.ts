// Server-side domain types for kelly-email. Re-exports the shared lib types and
// adds the API query/response shapes the Hono server and state module use.

export type {
  Attachment,
  Batch,
  Config,
  ConfigMeta,
  ConfigWithMeta,
  DecisionRecord,
  DecisionsPayload,
  ItemDecision,
  ItemExecution,
  Onboarding,
  ReviewBrief,
  ReviewItem,
} from "../../lib/types.ts";

// Query string params parsed from the request URL. Values may arrive as string
// or string[] (Hono returns strings; demo helpers tolerate both).
export interface StateQuery {
  demo?: string | boolean;
  lang?: string;
  mode?: string | string[];
  q?: string | string[];
  [key: string]: unknown;
}

// Status -> count map plus the derived buckets attached in state/demo payloads.
export interface StatusCounts {
  needs_review?: number;
  to_approve?: number;
  approved?: number;
  done?: number;
  blocked?: number;
  [status: string]: number | undefined;
}

// Body of a /api/decision POST.
export interface DecisionRequestBody {
  ids?: string[];
  id?: string;
  action?: string;
  comment?: string;
  draft?: string;
  suggested_reply?: string;
  [key: string]: unknown;
}
