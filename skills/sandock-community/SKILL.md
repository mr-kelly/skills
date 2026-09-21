---
name: sandock-community
license: MIT
description: Read, answer and post on the Sandock community forum at community.sandock.ai through its /api/v1/community REST API. Lists categories and posts, reads a thread with its replies, searches, and publishes posts and replies behind an explicit confirmation. Use when the user invokes $sandock-community or /sandock-community, asks what is happening in the Sandock community, wants an unanswered question triaged or answered, or wants something posted or announced there.
disable-model-invocation: false
allowed-tools: Bash(node:*), Read, Write, Edit, Grep, Glob
user-invocable: true
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:sandock
---

# Sandock Community

One zero-dependency CLI over the forum's own REST API. No UI, no local mirror of
the forum, no scraping — `community.sandock.ai` is the source of truth and the
API is the only way this skill touches it.

```bash
node skills/sandock-community/scripts/community.mjs <command> [--json]
```

## When to use

- "社区里有什么新帖 / 有没有没人回的问题" → `posts --unanswered`
- "看一下这个帖子" → `post <slug>`
- "帮我回复他" → read the thread first, draft in chat, then `reply` after approval
- "发个公告 / 提个 feature request" → `new` after approval

Not for: emailing, tweeting, or announcing anywhere else. That is a different
skill and a separate approval.

## Setup

```bash
node skills/sandock-community/scripts/community.mjs setup    # is it configured?
node skills/sandock-community/scripts/community.mjs whoami   # is the key still valid?
```

| Variable | Default | What it is |
| --- | --- | --- |
| `SANDOCK_API_KEY` | — | Required. Bearer token |
| `SANDOCK_COMMUNITY_API_URL` | `https://sandock.ai` | API origin |
| `SANDOCK_COMMUNITY_URL` | `https://community.sandock.ai` | Forum origin, for links |

### First run — when the key is missing

Every command exits with the setup instructions when `SANDOCK_API_KEY` is
unset. **Do not work around that**: do not guess a key, do not fall back to
scraping the public site, and do not go quiet. Walk the user through it:

1. Run `setup` and show them its output.
2. Tell them where the key comes from — <https://sandock.ai/docs/api-keys>,
   signed in with the same account they use on the forum.
3. Tell them to store it outside this repository, e.g. in `~/.sandock/.env`
   (`chmod 600`), and to load it into the shell that runs this skill:
   `set -a && . ~/.sandock/.env && set +a`.
4. Ask them to say when it is set, then confirm with `whoami` before doing
   anything else.

Never ask the user to paste the key into chat, never write it into this
repository, and never echo it in output — `setup` prints only its length.

**Why the API origin is not the forum origin.** `community.sandock.ai/api/v1/*`
only 307s to `sandock.ai`, and `fetch` strips the `Authorization` header across
a cross-origin redirect — so calling the community host would always come back
`UNAUTHORIZED` no matter how good the key is. Do not "fix" that by pointing
`SANDOCK_COMMUNITY_API_URL` back at the community host.

## Commands

| Command | What it does |
| --- | --- |
| `setup` | Report whether the key is configured, or print how to configure it |
| `whoami` | Verify the key and print the API/forum origins (Sandock serves no `users/me`, so this probes `categories`) |
| `categories` | Category slugs, kinds and post counts |
| `posts [--category S] [--sort active\|latest\|top] [--unanswered] [--q TEXT] [--lang XX] [--limit N] [--offset N]` | List posts |
| `post <slug>` | One post with its replies |
| `new --category S --title T --body B [--lang XX] [--yes]` | Publish a post |
| `reply <postId> --body B [--yes]` | Publish a reply |

Every command takes `--json`. Use it when you are going to reason over the
result; use the plain output when you are showing it to the user.

`--category` takes a **slug** (`ask`, `feature-requests`, …) — run `categories`
first rather than guessing. `post` takes a **slug**; `reply` takes the post
**id** from `post <slug>`, which is not the same string.

## Permission boundary

**Publishing is immediate, public, and has no draft or review state on this
API.** There is no change request to stage and no merge to hold back.

So the gate is local and mandatory:

1. `new` and `reply` without `--yes` print the exact JSON payload and send
   nothing. That is the default.
2. Show the user that payload — the real title and body, verbatim, not a summary.
3. Re-run with `--yes` only after they say yes, in that same turn.

Never pass `--yes` on your own initiative, never on the first attempt, and never
because the user approved a *different* post earlier in the conversation. A
published post is visible to everyone immediately and this API has no delete.

Other rules:

- Read the thread before answering it. `post <slug>` exists for that.
- Post in the language of the thread. `--lang` is the post's declared language
  and a post has exactly one; there is no "all".
- When the user dictates wording, publish their wording. Do not improve it.
- One topic per post. Do not batch unrelated answers into one reply.

## Evidence of completion

A post or reply counts as done only when the command returned and printed the
new id and URL. Quote them back. If the command printed a payload preview, the
work is **not** done — nothing was sent.

## Reference

`references/api.md` — the endpoint contract (paths, parameters, payload limits,
response fields). Read it before changing the script.

## Tests

```bash
node --test skills/sandock-community/test/community.test.mjs
```

Offline: they cover argument parsing, URL building, config resolution, error
envelopes, the onboarding text, and the CJK-aware column padding. They need no
key and make no network calls, so they stay runnable in CI and on a fresh clone.
