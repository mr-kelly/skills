# Kelly Listing

Kelly Listing is a local App-in-Skill listing factory (上架工作台) for a cross-border e-commerce seller: the agent turns product source material — or a kelly-picks handoff brief — into platform-specific listing drafts (Amazon, Shopify, TikTok Shop, eBay, with US/DE/JP locale variants), deterministic compliance checks run against per-platform rule sets, and the seller reviews, edits, approves, and exports upload-ready files — all over local files.

## What It Shows

- Overview: KPI cards (products, drafts with per-platform badges, compliance pass rate, exported this week), a product × platform status matrix (none/draft/approved/exported), review-queue preview, recent activity.
- Products: the source-material library — SKU, category, source badge (manual / kelly-picks handoff), specs, feature list, target keywords, image checklist with status ticks, linked drafts.
- Drafts: the workbench — every platform field editable with live character counts against the caps (and a byte counter for Amazon backend search terms), the compliance panel alongside, and locale tabs for variants.
- Checks: rule × draft results with pass/warn/fail badges and evidence, filterable by rule, platform, product, and result.
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
</table>

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-listing/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=products&lang=en#/products
/?demo=drafts&lang=en#/drafts
/?demo=checks&lang=en#/checks
/?demo=review&lang=en#/review
/?demo=detail&lang=en#/drafts/d-lunchbox-amazon-us
```

The featured deep link for the workbench detail is `/?demo=detail&lang=zh#/drafts/d-lunchbox-amazon-us` — an Amazon US draft with a title one character under the 200 cap, five bullets, backend search terms with a live byte count, an A+ outline, and its compliance panel. The demo persona is "Nimbus Home", a home/kitchen gadget seller; one draft (`Draft #4`, magnetic spice rack) deliberately fails three checks (banned phrase "FDA approved", backend terms over 249 bytes, only 4 bullets), and the lunch box carries a German (DE) locale variant.

Use `lang=zh` for Chinese screenshots — the desk chrome and agent meta content (product names 可折叠硅胶饭盒 / 磁吸调料架 / 可折叠洗衣篮 / 厨房电子秤, rule names, keyword-strategy notes, review reasons) are Chinese, while listing copy stays in the marketplace language (English/German). Demo mode never reads or writes files under `app/.data/`.

## Payload Format

`scripts/ingest_drafts.ts` accepts a single draft object or `{ "products": [...], "drafts": [...] }`:

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

After ingesting, run `node scripts/run_checks.ts` to refresh compliance results, and `node scripts/export_listings.ts --out <dir>` to export approved drafts as Markdown plus a flat-file-ready `listings.csv`. `scripts/execute_decisions.ts` is dry-run by default. See `references/listing-schema.md` for the full contract.

## Rule-Set Config

Per-platform rules live in config under `platforms[].rules` — title caps (200 Amazon / 70 Shopify / 255 TikTok Shop / 80 eBay), `bullets_exact`, `search_terms_max_bytes` (249), SEO meta lengths, required fields — plus top-level `banned_words` (or a `banned_words_file` JSON array), `competitor_brands`, `keyword_stuffing.max_repeats`, and `allowed_all_caps`. Checks are deterministic: character caps count code points, byte caps use `Buffer.byteLength`, and ASCII banned-word matching uses word boundaries.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-listing/config.json` and fill in the brand profile, platform rule sets, locales, and banned words. No secrets are required by default; if a publish handoff needs a marketplace token, reference it by env var name in local env files only.

## Boundary

The app renders local files only — it never touches any network beyond 127.0.0.1 and never publishes anything. Drafting and checking are local; publishing to marketplaces is approval-required and executed by the agent outside the app after the seller approves. Never commit seller data: `config.local.json`, `.env*`, `app/.data/`, and `exports/` are gitignored.
