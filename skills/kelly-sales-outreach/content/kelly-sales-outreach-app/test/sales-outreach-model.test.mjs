import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApprovalFields,
  buildProfileFields,
  createSalesOutreachDesk,
  missingProfileRequirements,
  nextStep,
  normalizeProfile,
  pickBestLead,
} from "../app/js/sales-outreach-model.js";

const record = (id, baseKey, fields) => ({ id, baseKey, fields });
const profileRecord = record("profile-self", "profile", {
  seller_name: "Kelly",
  offer_name: "AI 客服质检",
  offer_summary: "全量分析客服会话并给出改进项。",
  from_email: "kelly@example.com",
});
const sample = [
  profileRecord,
  record("company-a", "companies", {
    name: "秒购电商",
    key: "miaogou",
    match_score: 92,
    email_subject: "客服全量质检",
    email_body: "您好……",
    status: "draft",
    evidence_type: "first-party",
  }),
  record("company-b", "companies", {
    name: "绿印家居",
    key: "luyin",
    match_score: 78,
    email_subject: "客服质检",
    email_body: "您好……",
    status: "sent",
    sent_to: "cx@luyin.example.com",
    sent_at: "2026-08-10",
    evidence_type: "market-signal",
  }),
  record("company-c", "companies", {
    name: "云禾生活",
    key: "yunhe",
    match_score: 66,
    email_subject: "客服质检",
    email_body: "您好……",
    status: "draft",
    evidence_type: "public-directory",
  }),
  record("lead-a1", "leads", { email: "hello@miaogou.example.com", company_key: "miaogou", confidence: "medium" }),
  record("lead-a2", "leads", { email: "cx@miaogou.example.com", company_key: "miaogou", confidence: "high" }),
  record("lead-b", "leads", { email: "cx@luyin.example.com", company_key: "luyin", confidence: "high" }),
];

test("sorts accounts by evidence strength then ICP match", () => {
  const desk = createSalesOutreachDesk(sample);
  assert.deepEqual(
    desk.companies.map((company) => [company.ref, company.name]),
    [
      ["#1", "秒购电商"],
      ["#2", "云禾生活"],
      ["#3", "绿印家居"],
    ],
  );
});

test("splits review and sent buckets and identifies blocked prospects", () => {
  const desk = createSalesOutreachDesk(sample);
  assert.equal(desk.counts["to-send"], 2);
  assert.equal(desk.counts.sent, 1);
  assert.equal(desk.attention.blocked, 1);
});

test("picks the best public contact but preserves the address already used", () => {
  const desk = createSalesOutreachDesk(sample);
  assert.equal(desk.companies.find((company) => company.key === "miaogou").bestLead.email, "cx@miaogou.example.com");
  assert.equal(
    pickBestLead({ sentTo: "old@example.com" }, [
      { email: "new@example.com", confidence: "high" },
      { email: "old@example.com", confidence: "low" },
    ]).email,
    "old@example.com",
  );
});

test("onboarding requires only the offer name and description", () => {
  assert.deepEqual(normalizeProfile(undefined).missing, ["产品或服务名称", "产品或服务说明"]);
  assert.deepEqual(missingProfileRequirements({ offerName: "AI 质检" }), ["产品或服务说明"]);
  assert.equal(normalizeProfile(profileRecord).ready, true);
  assert.equal(normalizeProfile(profileRecord).mailReady, false);
});

test("approval enforces contact, draft, duplicate-send, and opt-out boundaries", () => {
  const company = createSalesOutreachDesk(sample).companies.find((item) => item.key === "miaogou");
  assert.throws(() => buildApprovalFields(company, "", "2026-08-12"), /MISSING_CONTACT/);
  assert.throws(
    () => buildApprovalFields({ ...company, emailBody: "" }, "cx@example.com", "2026-08-12"),
    /MISSING_DRAFT/,
  );
  assert.throws(
    () => buildApprovalFields({ ...company, status: "sent" }, "cx@example.com", "2026-08-12"),
    /ALREADY_SENT/,
  );
  assert.throws(
    () => buildApprovalFields({ ...company, status: "opted-out" }, "cx@example.com", "2026-08-12"),
    /OPTED_OUT/,
  );
  assert.deepEqual(buildApprovalFields(company, "cx@example.com", "2026-08-12"), {
    status: "queued",
    "sent-to": "cx@example.com",
    "approved-at": "2026-08-12",
  });
});

test("profile writes use the declared sales schema", () => {
  assert.deepEqual(
    buildProfileFields(
      { sellerName: "Kelly", offerName: " AI 质检 ", offerSummary: "全量分析", targetIndustries: "电商" },
      "2026-08-12",
      { onboardingVersion: 1 },
    ),
    {
      "seller-name": "Kelly",
      "offer-name": "AI 质检",
      "offer-summary": "全量分析",
      "value-proposition": "",
      "proof-points": "",
      "target-industries": "电商",
      "target-regions": "",
      "buyer-roles": "",
      "ideal-customer": "",
      "research-channels": "",
      "collateral-file": "",
      "from-email": "",
      "updated-at": "2026-08-12",
      "onboarding-version": 1,
    },
  );
});

test("the desk always names the next bounded command", () => {
  assert.equal(nextStep(createSalesOutreachDesk([])).command, "/kelly-sales-outreach profile");
  assert.equal(nextStep(createSalesOutreachDesk([profileRecord])).command, "/kelly-sales-outreach research");
  assert.equal(nextStep(createSalesOutreachDesk(sample)).command, "/kelly-sales-outreach research");

  const queued = [
    profileRecord,
    record("company-q", "companies", {
      name: "秒购",
      key: "miaogou",
      email_subject: "x",
      email_body: "y",
      status: "queued",
      sent_to: "cx@example.com",
    }),
    record("lead-q", "leads", { email: "cx@example.com", company_key: "miaogou", confidence: "high" }),
  ];
  assert.equal(nextStep(createSalesOutreachDesk(queued)).command, "/kelly-sales-outreach send");
  queued[0] = record("profile-self", "profile", {
    ...profileRecord.fields,
    smtp_vault_key: "SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS",
  });
  assert.equal(nextStep(createSalesOutreachDesk(queued)).command, "node scripts/send_emails.mjs");
});
