import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApprovalFields,
  buildProfileFields,
  createJobhuntDesk,
  normalizeProfile,
  pickBestLead,
} from "../app/js/jobhunt-model.js";

const record = (id, baseKey, fields) => ({ id, baseKey, fields });

const profileRecord = record("profile-self", "profile", {
  name: "陈默",
  target_role: "B 端产品经理",
  highlights: "五年 B 端产品经验。",
  resume_file: "chenmo.pdf",
  from_email: "chenmo@example.com",
});

const sample = [
  profileRecord,
  record("company-a", "companies", {
    name: "蓝汐科技",
    key: "lanxi",
    match_score: 92,
    email_subject: "应聘 B 端产品经理",
    email_body: "您好……",
    status: "draft",
  }),
  record("company-b", "companies", {
    name: "潮汐云",
    key: "chaoxi",
    match_score: 78,
    email_subject: "应聘产品经理",
    email_body: "您好……",
    status: "sent",
    sent_to: "hr@chaoxi.example.com",
    sent_at: "2026-08-09",
  }),
  record("company-c", "companies", {
    name: "麦芒零售",
    key: "maimang",
    match_score: 66,
    email_subject: "应聘产品经理",
    email_body: "您好……",
    status: "draft",
  }),
  record("lead-a1", "leads", { email: "jobs@lanxi.example.com", company_key: "lanxi", confidence: "medium" }),
  record("lead-a2", "leads", { email: "hr@lanxi.example.com", company_key: "lanxi", confidence: "high" }),
  record("lead-b1", "leads", { email: "hr@chaoxi.example.com", company_key: "chaoxi", confidence: "high" }),
];

test("sorts companies by match score and assigns stable batch references", () => {
  const desk = createJobhuntDesk(sample);
  assert.deepEqual(
    desk.companies.map((company) => [company.ref, company.name]),
    [
      ["#1", "蓝汐科技"],
      ["#2", "潮汐云"],
      ["#3", "麦芒零售"],
    ],
  );
});

test("buckets split on draft versus everything already approved", () => {
  const desk = createJobhuntDesk(sample);
  assert.deepEqual(desk.counts, { all: 3, "to-send": 2, sent: 1 });
  assert.deepEqual(
    desk.buckets["to-send"].map((company) => company.name),
    ["蓝汐科技", "麦芒零售"],
  );
});

test("attention counts a company with no contact address as blocked", () => {
  const desk = createJobhuntDesk(sample);
  assert.equal(desk.attention.toSend, 2);
  assert.equal(desk.attention.blocked, 1);
  assert.equal(desk.companies.find((company) => company.key === "maimang").bestLead, null);
});

test("picks the highest-confidence address, and keeps the one already used", () => {
  const desk = createJobhuntDesk(sample);
  const lanxi = desk.companies.find((company) => company.key === "lanxi");
  assert.equal(lanxi.leads.length, 2);
  assert.equal(lanxi.bestLead.email, "hr@lanxi.example.com");

  const chaoxi = desk.companies.find((company) => company.key === "chaoxi");
  assert.equal(chaoxi.bestLead.email, "hr@chaoxi.example.com");
});

test("an already-sent company keeps its recorded address even if a better one appears later", () => {
  const company = { sentTo: "old@example.com" };
  const leads = [
    { email: "new@example.com", confidence: "high" },
    { email: "old@example.com", confidence: "low" },
  ];
  assert.equal(pickBestLead(company, leads).email, "old@example.com");
});

test("profile readiness lists exactly what is still missing", () => {
  const empty = normalizeProfile(undefined);
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.missing, ["目标岗位", "自我介绍", "简历附件", "发件邮箱"]);

  const partial = normalizeProfile(record("p", "profile", { target_role: "产品经理", highlights: "五年经验" }));
  assert.deepEqual(partial.missing, ["简历附件", "发件邮箱"]);

  assert.equal(normalizeProfile(profileRecord).ready, true);
});

test("approval refuses to queue a send without a contact or a drafted email", () => {
  const desk = createJobhuntDesk(sample);
  const lanxi = desk.companies.find((company) => company.key === "lanxi");

  assert.throws(() => buildApprovalFields(lanxi, "", "2026-08-11"), /MISSING_CONTACT/);
  assert.throws(
    () => buildApprovalFields({ ...lanxi, emailBody: "" }, "hr@lanxi.example.com", "2026-08-11"),
    /MISSING_DRAFT/,
  );

  assert.deepEqual(buildApprovalFields(lanxi, "hr@lanxi.example.com", "2026-08-11"), {
    status: "queued",
    "sent-to": "hr@lanxi.example.com",
    "approved-at": "2026-08-11",
  });
});

test("profile fields are written back with the Busabase field slugs", () => {
  assert.deepEqual(
    buildProfileFields(
      { name: "陈默", targetRole: " 产品经理 ", locations: "杭州", fromEmail: "a@example.com" },
      "2026-08-11",
    ),
    {
      name: "陈默",
      "target-role": "产品经理",
      locations: "杭州",
      industries: "",
      highlights: "",
      "resume-file": "",
      "from-email": "a@example.com",
      "updated-at": "2026-08-11",
    },
  );
});
