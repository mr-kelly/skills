// social-qa (⛩): the pre-publish quality gate for the ECHO publishing desk.
//
// Given a draft's copy, it runs a small deterministic set of checks — brand
// voice, required disclosure, and banned claims — and rolls them into a Social
// Quality Score (SQS, 0-100) with a SHIP / FIX / BLOCK verdict:
//
//   any fail  -> BLOCK  (a hard problem: banned claim, missing #ad disclosure)
//   any warn  -> FIX    (soft problem: off-voice, thin hook)
//   all pass  -> SHIP
//
// Erasable TypeScript only (no enum/namespace); no deps. Shared by the demo
// seed and by the composer approval flow so one draft can trip the gate.

import type { GateCheck, QualityGate } from "./types.ts";

export interface GateInput {
  hook?: string;
  body?: string;
  hashtags?: string[];
  cta?: string;
  channels?: string[];
}

// Absolute/unverifiable marketing claims a personal build-in-public brand
// should never ship without proof. Demo-safe, invented brand vocabulary.
const BANNED_CLAIMS = [
  "guaranteed",
  "guarantee",
  "100% secure",
  "risk-free",
  "get rich",
  "best in the world",
  "number one",
  "#1 in the world",
  "cure",
  "miracle",
];

// Words that signal paid / affiliate content and therefore require disclosure.
const PROMO_MARKERS = ["sponsor", "sponsored", "partner", "affiliate", "paid promotion", "ad:"];
const DISCLOSURE_MARKERS = ["#ad", "#sponsored", "#partner", "paid partnership"];

function text(input: GateInput): string {
  return [input.hook, input.body, input.cta, (input.hashtags || []).join(" ")].filter(Boolean).join("\n").toLowerCase();
}

export function evaluateGate(input: GateInput): QualityGate {
  const blob = text(input);
  const checks: GateCheck[] = [];

  // 1. Banned / unverifiable claims -> hard fail (BLOCK).
  const hit = BANNED_CLAIMS.find((claim) => blob.includes(claim));
  checks.push({
    id: "banned-claims",
    label: "Banned claims",
    result: hit ? "fail" : "pass",
    note: hit ? `Contains an unverifiable claim: "${hit}".` : "No banned or absolute claims.",
  });

  // 2. Disclosure: if it reads as promotional, it must disclose.
  const looksPromo = PROMO_MARKERS.some((marker) => blob.includes(marker));
  const hasDisclosure = DISCLOSURE_MARKERS.some((marker) => blob.includes(marker));
  checks.push({
    id: "disclosure",
    label: "Disclosure",
    result: looksPromo && !hasDisclosure ? "fail" : "pass",
    note:
      looksPromo && !hasDisclosure
        ? "Reads as paid/partner content but has no #ad disclosure."
        : looksPromo
          ? "Promotional and discloses correctly."
          : "No disclosure required.",
  });

  // 3. Brand voice: build-in-public voice wants a real hook, not clickbait,
  //    and not ALL CAPS shouting. Soft problem -> warn (FIX).
  const hook = String(input.hook || "").trim();
  const shouting = /[A-Z]{6,}/.test(`${input.hook || ""} ${input.body || ""}`);
  const thinHook = hook.length > 0 && hook.length < 12;
  const voiceOk = hook.length >= 12 && !shouting;
  checks.push({
    id: "brand-voice",
    label: "Brand voice",
    result: voiceOk ? "pass" : "warn",
    note: shouting
      ? "All-caps shouting is off-brand for build-in-public."
      : thinHook
        ? "Hook is too thin to earn the scroll."
        : hook.length === 0
          ? "No hook — the first line has to do work."
          : "On-voice, specific hook.",
  });

  const fails = checks.filter((check) => check.result === "fail").length;
  const warns = checks.filter((check) => check.result === "warn").length;
  const score = Math.max(0, 100 - fails * 40 - warns * 15);
  const verdict = fails > 0 ? "BLOCK" : warns > 0 ? "FIX" : "SHIP";
  const summary =
    verdict === "BLOCK"
      ? "Blocked before publish — resolve the failing checks."
      : verdict === "FIX"
        ? "Publishable after a quick fix pass."
        : "Clears the gate. Safe to schedule.";

  return { verdict, score, checks, summary };
}
