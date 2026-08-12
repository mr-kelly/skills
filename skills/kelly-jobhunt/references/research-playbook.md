# Research Playbook

How to run `/kelly-jobhunt research` well. `SKILL.md` states the boundaries; this
file is the working method — where addresses actually come from, what a usable
match reason looks like, and the ways this step goes wrong.

Read it before the first round. The difference between a queue the operator
sends and a queue they abandon is decided almost entirely here.

## The output format

`scripts/import_leads.mjs` takes one JSON file:

```json
{
  "companies": [
    {
      "key": "lanxi-tech",
      "name": "蓝汐科技",
      "website": "lanxi-tech.com",
      "sourceUrl": "https://lanxi-tech.com/careers",
      "industry": "企业协作 SaaS",
      "matchScore": 92,
      "matchReason": "招聘页在招 B 端产品经理，明确写了「有审批流经验优先」；团队 80 人，产品线单一。",
      "evidenceType": "official-site",
      "evidenceDate": "2026-08-12",
      "emailSubject": "应聘 B 端产品经理 — 陈默（协作工作台 / 审批中台）",
      "emailBody": "您好，\n\n我是陈默……"
    }
  ],
  "leads": [
    {
      "companyKey": "lanxi-tech",
      "email": "hr@lanxi-tech.com",
      "role": "HR 邮箱",
      "sourceUrl": "https://lanxi-tech.com/careers",
      "confidence": "high"
    }
  ]
}
```

`key` is the join between the two lists and the dedup key across rounds. Use a
stable slug of the company's own domain (`lanxi-tech.com` → `lanxi-tech`), not a
transliteration of the name — the name may be written three different ways
across three sources, the domain will not.

Run it dry first. It prints what it would add and what it would skip; `--apply`
writes.

## Where addresses actually come from

In descending order of "will a human read it":

| Source | Confidence | Notes |
| --- | --- | --- |
| The company's own careers page | `high` | Best case. Often `hr@`, `jobs@`, `talent@`. |
| The company's contact / about page | `high` | Sometimes the only address a small company publishes. |
| A job posting that names the company | `medium` | The posting may be stale even when the address is not. |
| An aggregator listing with a company-provided address | `medium` | Verify the company actually exists and is hiring. |
| A named person's public professional profile | `low` | Highest read rate when it lands, lowest deliverability. |
| A general-purpose inbox (`info@`, `contact@`, `service@`) | `low` | Reaches a person who cannot hire you. Use only as a last resort. |

**Never construct an address from a pattern.** `hr@` + domain looks right and is
wrong often enough to burn a company you actually wanted. If nothing is
published, import the company with no lead at all — the desk marks it
「未找到邮箱」, disables sending, and tells the operator to come back to
`research`. That is a correct outcome, not a failure.

## Method

Use whatever works: the channels the operator listed in `job-boards`, search
engines, career pages, public aggregators, browser automation. Depth beats
politeness about method. What does not change:

- **every company and every address carries the exact `sourceUrl` it came
  from** — that is what makes the batch checkable, and the operator will click
  some of them;
- no purchased, scraped-and-resold, or otherwise acquired contact lists;
- no using someone's credentials, and no bypassing a paywall or anti-bot control
  to reach data you are not entitled to.

If a channel needs a login the operator has, ask them to drive it and paste
results — do not log in as them.

## What a usable match reason looks like

`matchReason` is what the operator reads to decide whether to spend three
minutes on this company. It must contain something that could only be true of
this company.

Good:

> 招聘页在招 B 端产品经理，明确写了「有审批流经验优先」；团队 80 人，产品线单一，产品经理话语权大。

> 在做面向企业的模型编排平台，用户是研发与业务混合团队。近期完成 B 轮，正在扩产品线。

Not usable:

> 这是一家优秀的互联网公司，发展前景广阔，与您的背景高度匹配。

> 行业领先，团队年轻，适合您。

The test: **delete the company name — can you tell which company it is?** If
not, rewrite it or drop the company. A reason you cannot write is a signal you
did not actually find anything, and importing it wastes the operator's attention
on a row they will not send.

Where a reason is thin, say so in it (`公开信息较少，只看到官网在招同类岗位`)
rather than padding. The operator can decide; a padded reason removes that
choice.

## Scoring

`matchScore` is 0-100 and only sorts the list. It is not a decision and must
never be presented as one. A rough calibration:

- **85-100** — hiring for this exact role now, and the work overlaps the
  operator's actual experience.
- **70-84** — right kind of company and role family; some concrete overlap.
- **55-69** — plausible, but the operator is missing something the posting asks
  for, or the evidence is thin.
- **below 55** — do not import. If you are reaching for a reason to include it,
  it belongs in the next round with a better search, not in this one.

Keep the distribution honest. If every company scores above 90 the number stops
carrying information and the operator starts ignoring the sort.

## Evidence and freshness

A score answers "does this fit". It cannot answer "is this still open", and the
desk sorts on the second question first. Record both fields on every company:

| `evidenceType` | Use when |
| --- | --- |
| `official-site` | You read the role, or the need, on the company's own site. |
| `aggregator` | You found it on a job board. It may have closed; say so rather than laundering it. |
| `business-match` | There is no posting. The match is your judgement about what they do. |

`evidenceDate` is the day you **captured** it, in `YYYY-MM-DD` — not the day you
run the import. They differ as soon as a research pass is reviewed the next
morning, and staleness is the whole point of the field.

Leave `evidenceType` blank if you genuinely do not know. Blank renders in amber
as 未标注, next to anything older than 30 days, and both mean "check before
sending" — which is true and useful. Labelling an aggregator find as
`official-site` to clear the badge puts a possibly-dead role at the top of the
queue, which is the exact failure this field exists to prevent.

## Drafting the email

One letter per company, written at import time so the queue is reviewable
immediately.

- **Opening paragraph is the only part that must be unique.** Anchor it in the
  specific evidence from `matchReason` — a posting line, a product direction,
  something on their site. This is the paragraph the operator will check.
- **Middle comes from `highlights`.** Same substance every time; that is fine
  and expected.
- **Close with a low-cost next step** the reader can say yes to — offering a
  short teardown of their product beats "期待您的回复".
- Plain text. No HTML, no images, no tracking pixel, no attachments beyond the
  resume the sender adds.
- Subject line: role + name, plus one distinguishing clause. It is read in a
  list view, so front-load it.
- Length: shorter than the operator thinks. If it does not fit on one phone
  screen it will be skimmed.

Never write a claim that is not in the profile. If a posting asks for something
the operator does not have, either leave it unaddressed or acknowledge it
plainly — do not manufacture it.

## Volume and rhythm

Twenty to thirty companies per round. Longer lists do not get read carefully,
and a list that is not read carefully is board-and-pray with extra steps — the
exact thing this skill exists to replace.

Run a second round after the operator has sent the first. What they edited and
what they skipped is better search input than anything they could have specified
up front.

## Failure modes

| Symptom | What actually happened | What to do |
| --- | --- | --- |
| Many companies, few addresses | Searched job boards only; those hide contact details | Go to the companies' own sites |
| Every address is `info@` or `service@` | Took the first address on the page | Look for the careers/contact page specifically; if there is genuinely none, import with no lead |
| Same company twice under different names | Keyed off the display name, not the domain | Key off the domain; re-run the import, it dedups |
| Match reasons all sound alike | Wrote them from the company's marketing copy | Re-read the posting; if there is nothing specific, drop the company |
| Import says "跳过" for everything | Those companies are already in the desk | Working as intended — widen the search, do not force duplicates |
| A company was already approved or sent | The import skipped it | Correct. Never overwrite a company the operator already acted on |

## What this step must not do

- Do not mark a company `queued` or `sent`. Only the operator approves, and only
  the sender sends.
- Do not write more than one address per company into `sent-to`. The pool can
  hold several; the send decision picks exactly one.
- Do not touch the profile. `research` reads it and never writes it.
