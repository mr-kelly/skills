# Kelly Insure Data

Kelly Insure Data is a Busabase Cloud App-in-Skill for insurance-industry data governance. It reads an operator-provisioned Busabase workspace: one Drive node for the file drive, one Base for QA pairs, two Bases for featured information and insurer notices, and one Base for user feedback. The AirApp itself is entirely read-only; a trusted set of skill-root scripts handles backup/restore and PDF text backfill.

## What It Shows

- Overview: file, QA, news, and feedback counts; data quality score; metadata field coverage; and records that still need governance.
- 文件盘: Busabase Drive-node files with metadata fields, missing-field badges, source, owner, jurisdiction, carrier, product line, and review status.
- 问答: QA Base records with canonical question/answer text, source traceability, review status, and completeness checks.
- 资讯精选 / 保司通知: Featured Information and Insurer Notices records combined in the `#/news` route, with title, carrier, publish date, category, URL, summary, and governance warnings. Each item is labelled `featured` or `notice`.
- 用户反馈: Feedback Base records with feedback text, source, user/contact fields, rating, status, tags, and completeness checks.
- Help & Settings: sanitized Busabase target slugs and Base field schemas, without exposing tokens.

The app is read-only. It surfaces quality gaps and review targets; it never mutates Busabase itself.

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Insure Data overview"></td>
    <td width="50%"><img src="assets/screenshots/files.webp" alt="Kelly Insure Data file drive"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Insurance governance cockpit with counts, score, metadata coverage, and records requiring cleanup.</td>
    <td><strong>文件盘</strong><br>Busabase Drive-node file list with metadata completeness and missing-field diagnostics.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/qa.webp" alt="Kelly Insure Data QA base"></td>
    <td width="50%"><img src="assets/screenshots/news.webp" alt="Kelly Insure Data news base"></td>
  </tr>
  <tr>
    <td><strong>问答</strong><br>Canonical insurance QA records with source, review status, and answer-quality warnings.</td>
    <td><strong>资讯精选 / 保司通知</strong><br>Featured information and insurer notices combined, with carrier, dates, and source URLs.</td>
  </tr>
</table>

## Running the App

```bash
cd skills/kelly-insure-data/app
pnpm install
pnpm run build:sdk
pnpm run dev
```

Open the printed URL. On loopback with no Busabase session yet, you'll see a "Connect Busabase" gate (Cloud or a custom server). Deployed as an AirApp, it uses its ambient Busabase session directly — no local setup screen.

## Demo Mode

```text
/?demo=overview&lang=zh#/overview
/?demo=files&lang=zh#/files
/?demo=qa&lang=zh#/qa
/?demo=news&lang=zh#/news
/?demo=feedback&lang=zh#/feedback
/?demo=settings&lang=zh#/settings
```

Demo mode never reads Busabase, tokens, or local production data.

## Busabase Workspace

The Drive node and the four Bases are an existing production insurance dataset, not something this AirApp creates or owns. `app/app/js/config.js` declares their slugs for lookup only:

- Drive: `hk-insurance-drive`
- Bases: `featured-information`, `insurance-news` (legacy alias `news`), `insurance-qa`, `user-feedback`

A missing Drive node or Base degrades to a visible warning in the Overview; the app never blocks behind a setup/provisioning screen the way most other Kelly App-in-Skills do, because there is nothing for a read-only reader to safely auto-create in someone else's canonical dataset.

## Backup, Restore, and PDF Text Backfill (trusted operator scripts)

Run from the skill root with the operator's own Busabase credentials:

```bash
cd skills/kelly-insure-data
npm install
BUSABASE_BASE_URL=... BUSABASE_API_KEY=... BUSABASE_SPACE_ID=... \
  npm run busabase:export -- --output app/.data/busabase_restore_manifest.json
BUSABASE_BASE_URL=... BUSABASE_API_KEY=... BUSABASE_SPACE_ID=... \
  npm run busabase:restore -- --manifest app/.data/busabase_restore_manifest.json --files-root /path/to/local/pdf-backup --dry-run
BUSABASE_BASE_URL=... BUSABASE_API_KEY=... BUSABASE_SPACE_ID=... \
  npm run busabase:backfill-pdf-text -- --drive-node-id <node-id> --files-root /path/to/local/pdf-backup --limit 5
```

- `busabase:export` writes a portable restore manifest (folder/Drive/Base shape, Drive file paths, sanitized asset metadata, Base records). It does not embed PDF bytes.
- `busabase:restore` previews restoration after a Busabase reset; add `--apply` only when ready to recreate missing folder, Drive files, Bases, and records.
- `busabase:backfill-pdf-text` parses local PDFs and previews the Asset text slot write and generated metadata; add `--apply` to write. The extracted text goes to the Asset text slot only (`PUT /api/v1/assets/{assetId}/text`) — `Asset.metadata` gets parser details, structured file fields, and a short `extraction_summary`, never the full PDF body. `busabase:backfill-pdf-metadata` remains available as a compatibility alias.

Keep real tokens in environment variables only. Never commit real insurance files, PDF backups, tokens, or anything under `app/.data/`.

---

# Kelly Insure Data（中文）

Kelly Insure Data 是一个面向保险行业数据治理的 Busabase Cloud App-in-Skill。它读取一个由运营者预先配置好的 Busabase 工作区：一个 Drive node 做「文件盘」，一个 Base 做「问答」，两个 Base 分别做「资讯精选」和「保司通知」，一个 Base 做「用户反馈」。AirApp 本身完全只读；一组受信任的 skill 根目录脚本负责备份/恢复与 PDF 文本回填。

## 界面内容

- Overview：展示文件数、问答数、资讯数、反馈数、数据质量分、Metadata 字段覆盖率，以及需要治理的记录。
- 文件盘：展示 Busabase Drive node 下的文件与 Metadata 字段，突出缺失字段、来源、负责人、地区、险种、承保方与审核状态。
- 问答：展示 Busabase Base 中的 QA 对，包含标准问题、标准答案、来源、审核状态与完整性检查。
- 资讯精选 / 保司通知：合并展示资讯精选和保司通知两个 Base 的记录，包含标题、承保方、发布时间、分类、链接、摘要与治理风险。每条记录标注 `featured` 或 `notice`。
- 用户反馈：展示用户反馈 Base 中的反馈内容、来源、用户/联系方式、评分、标签、状态与完整性检查。
- Help & Settings：展示 Busabase 目标 slug 和 Base 字段结构摘要，不暴露 token。

默认是只读治理视图；AirApp 从不修改 Busabase，数据录入/清洗都通过受信任的脚本完成。
