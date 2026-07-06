// geo-qa (⛩): the pre-ship quality gate for a proposed GEO content change.
//
// GEO (Generative Engine Optimization) rewrites make a page more citable by AI
// answer engines (ChatGPT / Perplexity / Gemini / Claude / Copilot). Because AI
// engines quote claims and stats verbatim, the biggest risk is shipping a
// FABRICATED or UNGROUNDED stat that then propagates into AI answers. This gate
// runs a small deterministic set of checks over a proposed GEO change and rolls
// them into a GEO Quality Score (GQS, 0-100) with a SHIP / FIX / BLOCK verdict:
//
//   any fail  -> BLOCK  (a hard problem: a stat with no cited source / grounding)
//   any warn  -> FIX    (soft problem: no quotable structure, no schema)
//   all pass  -> SHIP
//
// Erasable TypeScript only (no enum/namespace); no deps. Shared by the demo seed
// and by the optimize review flow so one draft can trip the gate.

import type { GeoGate, GeoGateCheck } from "./types.ts";

export interface GeoGateInput {
  // The proposed page copy / additions (the citable content).
  draft?: string;
  // Numeric claims/stats the change introduces, each optionally with a source.
  claims?: { text?: string; source?: string }[];
  // Whether the change adds structured data (schema.org JSON-LD).
  has_schema?: boolean;
  // Whether the change adds a Q&A / FAQ block AI engines can lift.
  has_qa_block?: boolean;
}

// A bare number followed by a stat-ish unit, e.g. "42%", "3x", "1,200 users".
const STAT_PATTERN =
  /\b\d[\d,.]*\s?(%|percent|x\b|times|users|customers|companies|hours|days|minutes|seconds|billion|million|thousand|k\b|\+)/i;

function draftHasBareStat(draft: string): boolean {
  return STAT_PATTERN.test(draft);
}

export function evaluateGeoGate(input: GeoGateInput): GeoGate {
  const draft = String(input.draft || "");
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const checks: GeoGateCheck[] = [];

  // 1. Factual grounding -> hard fail (BLOCK). Every numeric claim the change
  //    introduces must carry a source; a stat in the prose with no matching
  //    grounded claim is a fabrication risk.
  const ungroundedClaim = claims.find((claim) => String(claim.text || "").trim() && !String(claim.source || "").trim());
  const bareStatInProse = draftHasBareStat(draft) && !claims.some((claim) => String(claim.source || "").trim());
  const grounded = !ungroundedClaim && !bareStatInProse;
  checks.push({
    id: "factual-grounding",
    label: "Factual grounding",
    result: grounded ? "pass" : "fail",
    note: ungroundedClaim
      ? `Stat "${String(ungroundedClaim.text).slice(0, 60)}" has no cited source.`
      : bareStatInProse
        ? "The draft states a number/stat with no cited source — AI engines would quote it verbatim."
        : claims.length
          ? "Every quantitative claim carries a source."
          : "No quantitative claims to ground.",
  });

  // 2. Quotable structure -> soft warn (FIX). AI engines lift clear Q&A blocks;
  //    a page with none is far less citable.
  checks.push({
    id: "quotable-structure",
    label: "Quotable structure",
    result: input.has_qa_block ? "pass" : "warn",
    note: input.has_qa_block
      ? "Includes a Q&A / FAQ block engines can lift."
      : "No Q&A / FAQ block — add self-contained question/answer pairs.",
  });

  // 3. Structured data -> soft warn (FIX). schema.org markup helps engines and
  //    knowledge panels resolve the entity behind the claims.
  checks.push({
    id: "structured-data",
    label: "Structured data",
    result: input.has_schema ? "pass" : "warn",
    note: input.has_schema
      ? "Adds schema.org structured data."
      : "No schema.org markup — add Organization/FAQ/Article JSON-LD.",
  });

  const fails = checks.filter((check) => check.result === "fail").length;
  const warns = checks.filter((check) => check.result === "warn").length;
  const score = Math.max(0, 100 - fails * 45 - warns * 15);
  const verdict = fails > 0 ? "BLOCK" : warns > 0 ? "FIX" : "SHIP";
  const summary =
    verdict === "BLOCK"
      ? "Blocked before ship — a claim is ungrounded and could be quoted by an AI engine."
      : verdict === "FIX"
        ? "Shippable after a quick pass to make it more citable."
        : "Clears the GEO gate. Safe to publish.";

  return { verdict, score, checks, summary };
}
