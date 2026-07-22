# Kelly Writer

Repurpose one source idea into channel-ready content drafts with a local review and export workflow.


## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Writer todo queue"></td>
    <td width="50%"><img src="assets/screenshots/topics.webp" alt="Kelly Writer topic discovery"></td>
  </tr>
  <tr>
    <td><strong>Todo queue</strong><br>Confirmed content directions queued for AI writing, with ownership, status, and next-step controls.</td>
    <td><strong>Topic discovery</strong><br>Mock editorial planning with keyword clusters, audience fit, and topic opportunities.</td>
  </tr>
  <tr>
    <td width="50%"><img src="assets/screenshots/main.webp" alt="Kelly Writer main draft"></td>
    <td width="50%"><img src="assets/screenshots/distribution.webp" alt="Kelly Writer distribution review"></td>
  </tr>
  <tr>
    <td><strong>Main draft</strong><br>Long-form writing workspace with outline, draft sections, source notes, and approval status.</td>
    <td><strong>Distribution review</strong><br>Channel handoff view for publishing, social snippets, newsletter framing, and final checks.</td>
  </tr>
</table>

## What It Does

Kelly Writer turns a blog post, long article, transcript, notes, outline, product announcement, or rough idea into a multi-platform content batch. It can prepare drafts for channels such as:

- Xiaohongshu
- WeChat
- newsletter
- LinkedIn
- X/Twitter
- short video scripts
- SEO snippets
- multi-platform publishing plans

By default, it uses a local App-in-Skill UI so drafts can be reviewed, edited, approved, and exported before anything leaves the local workflow.

## When To Use It

Use this skill when you want to:

- turn long-form source material into multiple shorter platform drafts
- adapt one idea for Chinese and English social channels
- create a content pack from a product launch, article, transcript, or notes
- review and approve generated drafts in a local dashboard
- export approved content to Markdown and JSON

## Workflow

1. Provide source material, target audience, desired channels, language, and CTA.
2. The skill extracts the core idea, proof points, examples, keywords, and reusable quotes.
3. It generates a local content batch.
4. The batch is validated and opened in the local review UI.
5. You edit or approve items in the UI.
6. Approved drafts are exported locally.

## Local UI

Default local app URL:

```text
http://127.0.0.1:3000/
```

The app reads and writes local files only. It does not publish posts, schedule content, upload media, or change external platforms.

## Local Files

```text
skills/kelly-writer/app/.data/current_batch.json
skills/kelly-writer/app/.data/decisions.json
skills/kelly-writer/app/.data/export_report.json
skills/kelly-writer/app/.data/agent.lock
```

Exports are written under:

```text
skills/kelly-writer/exports/
```

## Configuration

Optional private config can store brand voice, audience, official URLs, CTA defaults, channel defaults, risk terms, and export preferences.

Supported config locations:

```text
KELLY_WRITER_CONFIG=/absolute/path/to/config.json
skills/kelly-writer/config.local.json
~/.config/kelly-writer/config.json
```

Use `config.example.json` as a starting template only. Keep private settings out of committed files. Existing `KELLY_CONTENT_*` environment variables and `~/.config/kelly-content/config.json` remain supported as migration fallbacks; use the `kelly-writer` names for new configuration.

## Chat-Only Mode

If you do not want the local UI, ask for chat-only mode:

```text
kelly-writer chat only
kelly-writer 纯聊天
不要打开 UI，直接在这里处理
```

In chat-only mode, the skill presents numbered drafts directly in the conversation for review and approval.
