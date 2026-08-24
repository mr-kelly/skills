# Kelly Listing

Kelly Listing is a Busabase App-in-Skill listing factory (上架工作台) for a cross-border e-commerce seller: the agent turns product source material — or a kelly-picks handoff brief — into platform-specific listing drafts (Amazon, Shopify, TikTok Shop, eBay, with US/DE/JP locale variants), deterministic compliance checks run against per-platform rule sets and the claims registry, and the seller reviews, edits, approves, and exports upload-ready files through the App-in-Skill review queue.

## What It Shows

- Overview: KPI cards (products, drafts with per-platform badges, compliance pass rate, exported this week), a product × platform status matrix (none/draft/approved/exported), review-queue preview, recent activity.
- Products: the source-material library — SKU, category, source badge (manual / kelly-picks handoff), specs, feature list, target keywords, image checklist with status ticks, linked drafts.
- Drafts: the workbench — every platform field editable with live character counts against the caps (and a byte counter for Amazon backend search terms), the compliance panel alongside, and locale tabs for variants.
- Checks: rule × draft results with pass/warn/fail badges and evidence, filterable by rule, platform, product, and result.
- Claims: the compliance registry — approved marketing claims, rejected claims, and banned-word/restricted-phrase rules.
- Review: the queue with approve / request changes / block decisions, compliance summaries, the agent's keyword-strategy notes, and stable refs (`Draft #1`).
- Settings: sanitized seller profile, platform rule sets, locales, banned-word counts, and export preferences.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Listing overview"></td>
    <td width="50%"><img src="assets/screenshots/needs-review.webp" alt="Kelly Listing review queue"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Listing command desk with product × platform status matrix, compliance pass rate, and export readiness.</td>
    <td><strong>Review queue</strong><br>Draft submissions with compliance summaries and keyword-strategy notes for approval before export or publish.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/checks.webp" alt="Kelly Listing compliance checks"></td>
    <td width="50%"><img src="assets/screenshots/drafts.webp" alt="Kelly Listing draft workbench"></td>
  </tr>
  <tr>
    <td><strong>Compliance checks</strong><br>Per-rule pass/warn/fail results — banned words, character caps, bullet counts — across all drafts.</td>
    <td><strong>Draft workbench</strong><br>Amazon draft with live title character count, five bullets, backend search terms byte counter, A+ outline, and locale tabs.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/claims.webp" alt="Kelly Listing claims registry"></td>
    <td width="50%"><img src="assets/screenshots/products.webp" alt="Kelly Listing products"></td>
  </tr>
  <tr>
    <td><strong>Claims registry</strong><br>Approved marketing claims and banned or restricted phrases, each with evidence and compliance status.</td>
    <td><strong>Products</strong><br>Product catalog with SKU, category, source, per-platform listing status, and last-updated.</td>
  </tr>
</table>

## Demo Mode

Start the AirApp locally and open a safe mock-data scene:

```bash
pnpm --dir skills/kelly-listing/content/kelly-listing-app dev
```

Then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=drafts&lang=en#/drafts
/?demo=checks&lang=en#/checks
/?demo=claims&lang=en#/claims
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/drafts/d-lunchbox-amazon-us
```

The featured deep link for the workbench detail is `/?demo=detail&lang=zh#/drafts/d-lunchbox-amazon-us` — an Amazon US draft with a title one character under the 200 cap, five bullets, backend search terms with a live byte count, an A+ outline, and its compliance panel. The demo persona is "Nimbus Home", a home/kitchen gadget seller; one draft (`Draft #4`, magnetic spice rack) deliberately fails three checks (banned phrase "FDA approved", backend terms over 249 bytes, only 4 bullets), and the lunch box carries a German (DE) locale variant. Demo mode never reads or writes Busabase.

Use `lang=zh` for Chinese screenshots — the desk chrome and agent meta content (product names 可折叠硅胶饭盒 / 磁吸调料架 / 可折叠洗衣篮 / 厨房电子秤, rule names, keyword-strategy notes) are Chinese, while listing copy stays in the marketplace language (English/German).

## Draft Payload Format

`scripts/ingest_drafts.mjs` accepts a single draft object or `{ "products": [...], "drafts": [...] }`:

```json
{
  "products": [
    {
      "name": "Collapsible Silicone Lunch Box",
      "sku": "NH-LB-01",
      "category": "Kitchen & Dining",
      "source": "kelly_picks",
      "platforms": ["amazon", "tiktok_shop"],
      "keywords": ["collapsible lunch box", "silicone bento box"],
      "specs": [{ "name": "Capacity", "value": "1.2 L" }],
      "features": ["Collapses to 1/3 height"],
      "images": [{ "name": "Main image on white", "status": "ready" }]
    }
  ],
  "drafts": [
    {
      "product": "NH-LB-01",
      "platform": "amazon",
      "locale": "US",
      "keyword_strategy": "Lead with 'collapsible lunch box'.",
      "fields": {
        "title": "…",
        "bullets": ["…", "…", "…", "…", "…"],
        "description": "…",
        "search_terms": "…",
        "aplus_outline": ["…"]
      }
    }
  ]
}
```

After ingesting, run `node scripts/run_checks.mjs --apply` to refresh compliance results, and `node scripts/export_listings.mjs --out <dir>` to export approved drafts as Markdown plus a flat-file-ready `listings.csv`. `scripts/execute_decisions.mjs` is dry-run by default. See `references/listing-schema.md` for the full Busabase field contract.

## Rule-Set Config

Per-platform rules live on the Settings row's `platforms[]` — title caps (200 Amazon / 70 Shopify / 255 TikTok Shop / 80 eBay), `bullets_exact`, `search_terms_max_bytes` (249), SEO meta lengths, required fields — plus top-level `banned_words`, `competitor_brands`, `keyword_stuffing.max_repeats`, and `allowed_all_caps`. Checks are deterministic: character caps count code points, byte caps use `TextEncoder` (`Buffer.byteLength` in the trusted scripts), and ASCII banned-word matching uses word boundaries.

## Busabase Setup

Kelly Listing provisions its own Folder and six Bases (`products`, `drafts`, `checks`, `claims`, `claim-rules`, `settings`) lazily on first run in a Busabase Space — no manual setup required. See `SKILL.md`'s Busabase Resources section.

## Boundary

The AirApp reads and writes Busabase only — it never touches marketplace APIs or remote systems beyond Busabase. Drafting and checking are performed by the trusted `scripts/*.mjs` scripts, never by the browser; publishing to marketplaces is approval-required and executed by the agent outside the app after the seller approves. Never commit seller data: env files, local payload files, and `exports/` should stay out of git.
