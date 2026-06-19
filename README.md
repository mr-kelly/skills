# mr-kelly/skills

Local Claude Code marketplace with reusable AI agent skills.

## Install

Recommended for multiple AI coding agents:

```bash
npx skills add mr-kelly/skills
```

In Claude Code:

```text
/plugin marketplace add mr-kelly/skills
/plugin install mr-kelly-skills
```

## Skills

| Skill | What It Does | When To Use It | README |
| --- | --- | --- | --- |
| `agent-rules` | Keeps rules and skills for Codex, Claude Code, Copilot, Kiro, Cursor, and Gemini aligned from one source of truth. It creates and verifies symlinks so agents share `AGENTS.md` and `.agents/skills/`. | Use it when setting up a repo for multiple coding agents, checking agent rule drift, or fixing broken skill/rule symlinks. | [Open README](skills/agent-rules/README.md) |
| `app-in-skill-creator` | Documents and scaffolds the App-in-Skill pattern: a skill bundled with a small local review UI, local handoff files, locks, scripts, and safe approval boundaries. | Use it when building a skill that needs a browser-based review queue, approval desk, dashboard, or lightweight local workflow. | [Open README](skills/app-in-skill-creator/README.md) |
| `kelly-content` | Repurposes one source idea, article, transcript, outline, or announcement into channel-ready drafts for platforms like Xiaohongshu, WeChat, newsletters, LinkedIn, X/Twitter, short video, and SEO snippets. | Use it when turning long-form source material into a multi-platform content pack with local review, edits, approvals, and export. | [Open README](skills/kelly-content/README.md) |
| `kelly-email` | Runs an AI-assisted inbox-zero workflow across configured email accounts. It triages unread mail, drafts replies, prepares cleanup actions, and uses a local UI for human approval before execution. | Use it when processing unread email, drafting support replies, archiving or marking messages read after approval, or managing email through an App-in-Skill UI. | [Open README](skills/kelly-email/README.md) |
| `kelly-pr-review` | Runs a GitHub PR review desk through `gh` CLI. It gathers review-requested pull requests, prepares review notes, uses a local UI for approval, and executes approved `gh pr review` actions. | Use it when reviewing GitHub pull requests, approving/commenting/requesting changes from a local queue, or batching PR review decisions. | [Open README](skills/kelly-pr-review/README.md) |

## App UI Screenshots

These skills include local browser UIs for review, approval, and handoff workflows.

### `kelly-content`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-content-topics.png" alt="Kelly Content topic discovery"></td>
    <td width="50%"><img src="docs/screenshots/kelly-content-main.png" alt="Kelly Content main draft"></td>
  </tr>
  <tr>
    <td><strong>Topic discovery</strong><br>Mock editorial planning with keyword clusters, audience fit, and topic opportunities.</td>
    <td><strong>Main draft</strong><br>Long-form writing workspace with outline, draft sections, source notes, and approval status.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-content-distribution.png" alt="Kelly Content distribution review"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Distribution review</strong><br>Channel handoff view for publishing, social snippets, newsletter framing, and final checks.</td>
    <td></td>
  </tr>
</table>

### `kelly-email`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-email-all.png" alt="Kelly Email inbox approval desk"></td>
    <td width="50%"><img src="docs/screenshots/kelly-email-review.png" alt="Kelly Email needs review"></td>
  </tr>
  <tr>
    <td><strong>Inbox approval desk</strong><br>Mock inbox queue with approvals, sender context, reply drafts, and status filters.</td>
    <td><strong>Needs review</strong><br>Human-in-the-loop review scene for a partnership reply that needs tone and timing judgment.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-email-blocked.png" alt="Kelly Email blocked security request"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Blocked security request</strong><br>Risk-heavy email scenario where the assistant blocks a suspicious request instead of drafting a reply.</td>
    <td></td>
  </tr>
</table>

### `kelly-pr-review`

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/kelly-pr-review-review.png" alt="Kelly PR Review needs review"></td>
    <td width="50%"><img src="docs/screenshots/kelly-pr-review-ready.png" alt="Kelly PR Review ready to approve"></td>
  </tr>
  <tr>
    <td><strong>Needs review</strong><br>Mock pull request review with findings, confidence signals, test notes, and suggested actions.</td>
    <td><strong>Ready to approve</strong><br>Approval-focused review where checks pass and the final recommendation is ready to send.</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/kelly-pr-review-blocked.png" alt="Kelly PR Review blocked review"></td>
    <td></td>
  </tr>
  <tr>
    <td><strong>Blocked review</strong><br>Security-sensitive PR scenario with unresolved risk, blocking rationale, and reviewer handoff details.</td>
    <td></td>
  </tr>
</table>

## Layout

- `.claude-plugin/marketplace.json` defines the marketplace and plugin.
- `skills/` contains one folder per skill.
- Each skill folder contains `SKILL.md`.
- Skill folders should also include a `README.md` for human-facing usage notes.
