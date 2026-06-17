# Kelly Content

Repurpose one source idea into channel-ready content drafts with a local review and export workflow.

## What It Does

Kelly Content turns a blog post, long article, transcript, notes, outline, product announcement, or rough idea into a multi-platform content batch. It can prepare drafts for channels such as:

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
skills/kelly-content/app/.cache/current_batch.json
skills/kelly-content/app/.cache/decisions.json
skills/kelly-content/app/.cache/export_report.json
skills/kelly-content/app/.cache/agent.lock
```

Exports are written under:

```text
skills/kelly-content/exports/
```

## Configuration

Optional private config can store brand voice, audience, official URLs, CTA defaults, channel defaults, risk terms, and export preferences.

Supported config locations:

```text
KELLY_CONTENT_CONFIG=/absolute/path/to/config.yml
skills/kelly-content/config.local.yml
~/.config/kelly-content/config.yml
```

Use `config.example.yml` as a starting template only. Keep private settings out of committed files.

## Chat-Only Mode

If you do not want the local UI, ask for chat-only mode:

```text
kelly-content chat only
kelly-content 纯聊天
不要打开 UI，直接在这里处理
```

In chat-only mode, the skill presents numbered drafts directly in the conversation for review and approval.
