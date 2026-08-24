# Kelly Writer

Kelly Writer is a Busabase-backed App-in-Skill review desk for repurposing one source idea, blog post, transcript, or announcement into channel-ready drafts — Xiaohongshu, WeChat, newsletter, LinkedIn, X/Twitter, short video scripts, SEO snippets, and an official blog draft. The agent drafts each channel variant; you review, edit, and approve drafts in a quiet review UI before anything is exported.

## What It Shows

- **Overview**: draft metrics (needs review / approved / done / blocked) and the channel breakdown.
- **Drafts**: the review queue over channel drafts, with editable title/body, hashtags/CTA/media-brief/title-options support panels, a review note, and Approve / Request changes / Block decisions.
- **Settings**: sanitized brand/audience/channel configuration and the exact trusted-script commands to run next.
- The AirApp never generates content or exports anything itself. Generation and export are trusted skill-root scripts run outside the browser (see below).

## App UI Screenshots

<table>
  <tr>
    <td width="50%"><img src="assets/screenshots/overview.webp" alt="Kelly Writer overview"></td>
    <td width="50%"><img src="assets/screenshots/distribution.webp" alt="Kelly Writer distribution review"></td>
  </tr>
  <tr>
    <td><strong>Overview</strong><br>Channel breakdown and the drafts that need attention next.</td>
    <td><strong>Drafts</strong><br>Channel-ready draft review queue with editable title/body and approval controls.</td>
  </tr>
</table>

## Running Locally

```bash
pnpm --dir content/kelly-writer-app install
pnpm --dir content/kelly-writer-app dev
```

Open the printed URL. A standalone local preview asks you to connect
Busabase (Cloud or a custom server) and select a Space — never an API key.

## Demo Mode

Add a demo path to see a mock content batch without a Busabase connection:

```text
/?demo=overview&lang=en#/overview
/?demo=drafts&lang=en#/drafts
/?demo=settings&lang=en#/settings
```

Demo mode never reads or writes Busabase.

## Data

All state — channel drafts and the brand/audience/channel profile — lives in
two Busabase Bases under one application Folder. See `SKILL.md` for the
resource map.

```bash
node scripts/generate_batch.mjs --source path-or-text --apply
node scripts/export_decisions.mjs --apply
```

Both are trusted skill-root scripts with their own `package.json`; they
connect with `BUSABASE_BASE_URL` / `BUSABASE_API_KEY` / `BUSABASE_SPACE_ID`,
never the AirApp's ambient session. `export_decisions.mjs` writes a
Markdown+ZIP pack per approved draft to `exports/<batch-id>/` and marks the
draft `done` — it never publishes anywhere.

## Philosophy

The App-in-Skill pattern pairs an agent skill with a small companion UI. See the spec paper: <https://mr-kelly.github.io/research/app-in-skill-specification-for-pairing-agent-skills-with-a-local-companion-ui.pdf>.
