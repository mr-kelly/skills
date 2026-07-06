# Kelly SEO

Kelly SEO is a local App-in-Skill desk covering **SEO + GEO (AI-search) + brand entity**: a dashboard over Google Search Console search analytics and an agent-prepared SEO opportunities review queue, plus an AI-visibility tracker, a GEO content-optimization queue, and an entity / knowledge-panel readiness checklist.

## What It Shows

- Overview: per-site KPI cards with 28d vs previous 28d deltas, a daily clicks/impressions trend, top movers, site freshness, and what needs review.
- Queries: top queries with clicks, impressions, CTR, position, deltas, and opportunity badges; per-query detail with trend and top pages.
- Pages: top pages with the same metrics plus indexing/canonical warnings; per-page detail with trend and top queries.
- Opportunities: agent-proposed SEO actions (title/meta rewrites, internal links, content briefs, page fixes) with editable drafts and approve / request changes / block decisions.
- AI visibility (GEO): an engines × prompts matrix showing whether AI answer engines (ChatGPT / Perplexity / Gemini / Claude / Copilot) cite the brand for a set of tracked prompts, at what answer position and sentiment, plus an overall visibility score and trend.
- GEO optimizer: an agent-proposed content-optimization queue (citable rewrites, quotable stats, Q&A blocks, schema) reviewed with the same five states — each change scored by the `geo-qa` gate (SHIP / FIX / BLOCK), with a fabricated stat BLOCKed before it can ship.
- Entity readiness: a brand-entity / knowledge-panel checklist (Wikidata, Wikipedia/notability, schema.org Organization, sameAs, consistent NAP, founder entity) with present / partial / missing status and an agent-proposed fix per gap.
- Sites: configured properties with verification type, last sync, and 28d totals.

## Demo Mode

Run the app and open a safe mock-data scene:

```bash
skills/kelly-seo/app/start.sh
```

Use the URL printed by the launcher, then add one of these demo paths:

```text
/?demo=overview&lang=en#/overview
/?demo=queries&lang=en#/queries
/?demo=pages&lang=en#/pages
/?demo=opportunities&lang=en#/opportunities
/?demo=geo&lang=en#/geo
/?demo=optimize&lang=en#/optimize
/?demo=entity&lang=en#/entity
/?demo=detail&lang=en#/queries/q-featherlog-app-release-notes-vs-changelog
```

Demo mode never reads live GSC data or files under `app/.data/`. The GEO demo uses an invented brand (Featherlog); the `#/optimize` scene includes one change the `geo-qa` gate BLOCKs for a fabricated stat.

## GSC Auth Setup

Both methods use the read-only scope `https://www.googleapis.com/auth/webmasters.readonly`.

Service account (recommended):

1. In Google Cloud, create a service account and download its JSON key file.
2. In Search Console, open each property → Settings → Users and permissions → Add user, and add the service account's email address (read access is enough).
3. In a local env file (for example `skills/kelly-seo/.env.local`), set `KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE=/absolute/path/to/key.json`.

Plain access token (quick manual runs):

1. Obtain a short-lived OAuth access token with the read-only webmasters scope (for example via `gcloud auth print-access-token` on an authorized account, or the OAuth playground).
2. Set `KELLY_SEO_GSC_ACCESS_TOKEN=<token>` and run `node skills/kelly-seo/scripts/sync_gsc.mjs`.

## Private Config

Copy `config.example.json` to `config.local.json` or `~/.config/kelly-seo/config.json` and list your site properties. Secrets live only in local env files referenced by name (`KELLY_SEO_GSC_SERVICE_ACCOUNT_FILE`, `KELLY_SEO_GSC_ACCESS_TOKEN`). Never commit keys, tokens, or files under `app/.data/`.

## Boundary

GSC access is read-only. The app itself never calls the GSC API or edits site content; approved opportunities are executed by the agent outside the app (in the site's repo/CMS) and reported back to `app/.data/execution_report.json`. GEO content changes follow the same rule (approved in `#/optimize`, published by the agent outside the app). AI-visibility data is observational — the skill never fabricates a citation, an answer position, or a stat; the `geo-qa` gate BLOCKs ungrounded claims so no invented number reaches AI answer engines.

---

## 中文说明

Kelly SEO 是一个本地 App-in-Skill 桌面，覆盖 **SEO + GEO（AI 搜索）+ 品牌实体**：

- **SEO 分析**：基于 Google Search Console 的点击、曝光、CTR、排名仪表盘，以及代理准备的 SEO 优化项审核队列（标题/描述改写、内链、内容简报、页面修复），可批准 / 要求修改 / 拦截。
- **AI 可见度（GEO）**：一个「引擎 × 提问」矩阵，展示 ChatGPT / Perplexity / Gemini / Claude / Copilot 是否为一组追踪提问引用了本品牌、在答案中的位置与情感，以及总体可见度得分和趋势。
- **GEO 内容优化**：代理提议让页面更易被 AI 引擎引用的改写（可引用改写、可引用数据、问答块、结构化数据），用同一套五状态审核；每项由 `geo-qa` 质量门评为 SHIP / FIX / BLOCK——编造数据会在发布前被拦截。
- **实体就绪度**：品牌实体 / 知识面板清单（Wikidata、维基百科/知名度、schema.org Organization、sameAs、名称一致性 NAP、创始人实体），每项标注已具备 / 部分 / 缺失并给出建议修复。

演示模式（`?demo=geo` / `?demo=optimize` / `?demo=entity`，可加 `lang=zh`）使用虚构品牌，不读取任何真实 GSC 数据或 `app/.data/` 文件。GEO 内容变更同样只在 App 外由代理发布；本技能绝不编造引用、答案位置或数据。
