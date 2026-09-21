---
name: busabase-community
license: MIT
description: Read, answer and post on the Busabase community forum at community.busabase.com through its /api/v1/community REST API. Lists categories and posts, reads a thread with its replies, searches, and publishes posts and replies behind an explicit confirmation. Use when the user invokes $busabase-community or /busabase-community, asks what is happening in the Busabase community, wants an unanswered question triaged or answered, or wants something posted or announced there.
disable-model-invocation: false
allowed-tools: Bash(node:*), Read, Write, Edit, Grep, Glob
user-invocable: true
metadata:
  category: platform
  tags:
    - risk:gated-write
    - surface:busabase
---

# Busabase Community

One zero-dependency CLI over the forum's own REST API. No UI, no local mirror of
the forum, no scraping — `community.busabase.com` is the source of truth and the
API is the only way this skill touches it.

```bash
node skills/busabase-community/scripts/community.mjs <command> [--json]
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
cp skills/busabase-community/.env.example skills/busabase-community/.env
chmod 600 skills/busabase-community/.env      # then fill in BUSABASE_API_KEY
node skills/busabase-community/scripts/community.mjs setup    # is it configured?
node skills/busabase-community/scripts/community.mjs whoami   # is the key still valid?
```

The skill reads its own env file — no `source`, no exporting. Files are read
**nearest-first**, and a variable already exported in the shell always wins over
every file:

| Order | Where |
| --- | --- |
| 1 | `$BUSABASE_ENV_FILE`, if set |
| 2 | `skills/busabase-community/.env.local` |
| 3 | `skills/busabase-community/.env` |
| 4 | `~/.config/busabase-community/.env` |
| 5 | `~/.busabase/.env` — shared with the other Busabase tooling |

`.env` and `.env.local` are gitignored (`skills/*/.env` in the repo's
`.gitignore`). `.env.example` is the tracked template; it holds no values.
`setup` prints which files were read and which variable names came from each —
never a value.

| Variable | Default | What it is |
| --- | --- | --- |
| `BUSABASE_API_KEY` | — | Required. Bearer token for reading and posting |
| `BUSABASE_SYSTEMADMIN_KEY` | — | Optional. Unlocks `admin`. Falls back to `SYSTEMADMIN_KEY` |
| `BUSABASE_COMMUNITY_API_URL` | `https://busabase.com` | API origin |
| `BUSABASE_COMMUNITY_URL` | `https://community.busabase.com` | Forum origin, for links |
| `BUSABASE_ENV_FILE` | — | Optional. Read this file first, ahead of the defaults |

### First run — when the key is missing

Every command exits with the setup instructions when `BUSABASE_API_KEY` is
unset. **Do not work around that**: do not guess a key, do not fall back to
scraping the public site, and do not go quiet. Walk the user through it:

1. Run `setup` and show them its output.
2. Tell them where the key comes from — <https://busabase.com/docs/api-tokens>,
   signed in with the same account they use on the forum.
3. Tell them to put it in `skills/busabase-community/.env` (copy
   `.env.example`, `chmod 600`). It is gitignored and read automatically.
4. Ask them to say when it is set, then confirm with `whoami` before doing
   anything else.

Never ask the user to paste the key into chat, never write it into a tracked
file, and never echo it in output — `setup` prints only its length. When you
write the file **for** them, write only the variable they gave you and never
print the line back.

**Why the API origin is not the forum origin.** `community.busabase.com/api/v1/*`
only 307s to `busabase.com`, and `fetch` strips the `Authorization` header across
a cross-origin redirect — so calling the community host would always come back
`UNAUTHORIZED` no matter how good the key is. Do not "fix" that by pointing
`BUSABASE_COMMUNITY_API_URL` back at the community host.

## Commands

| Command | What it does |
| --- | --- |
| `setup` | Report whether the key is configured, or print how to configure it |
| `whoami` | Verify the key, print the account and the API/forum origins |
| `categories` | Category slugs, kinds and post counts |
| `posts [--category S] [--sort active\|latest\|top] [--unanswered] [--q TEXT] [--lang XX] [--limit N] [--offset N]` | List posts |
| `post <slug>` | One post with its replies |
| `new --category S --title T --body B [--lang XX] [--yes]` | Publish a post |
| `reply <postId> --body B [--yes]` | Publish a reply |
| `admin <operation> [flags] [--yes]` | Moderation surface — see below |

Every command takes `--json`. Use it when you are going to reason over the
result; use the plain output when you are showing it to the user.

`--category` takes a **slug** (`ask`, `feature-requests`, …) — run `categories`
first rather than guessing. `post` takes a **slug**; `reply` takes the post
**id** from `post <slug>`, which is not the same string.

## The moderation surface (`admin`)

`/api/v1/system-admin/community/*` is a second API with a second credential.
`BUSABASE_SYSTEMADMIN_KEY` is the **deployment's** `SYSTEM_ADMIN_API_SECRET_KEY`
— not a per-user token. It can hide, move and permanently delete anyone's
content, so treat it as an operator credential, not as your own.

Without it, `admin` stops with instructions and everything else keeps working.
Some deployments do not serve this API at all yet; there the first `admin` call
says so plainly rather than guessing.

| Group | Operations |
| --- | --- |
| Read | `overview` · `posts` · `replies` · `reports` · `categories` |
| Moderate | `moderate-post` · `moderate-reply` · `move-post` · `feature-status` · `restore-post` · `restore-reply` |
| Purge | `delete-post` · `delete-reply` — **irreversible** |
| Taxonomy | `create-category` · `update-category` · `archive-category` · `reorder-categories` |
| Reports | `handle-report` |

```bash
admin overview
admin posts --status hidden --include-deleted --limit 20
admin reports --status open
admin moderate-post --post-id <id> --status hidden --yes
admin feature-status --post-id <id> --feature-status planned --yes    # `none` clears it
admin create-category --slug how-to --kind question --name "How to" --name "zh-CN=怎么做" --yes
admin reorder-categories --category-ids c1,c2,c3 --yes
```

Flags are the API's field names in kebab-case (`--post-id`, `--include-deleted`,
`--category-slug`). A category's text repeats once per locale — a bare `--name`
is English, `--name "zh-CN=…"` is that locale.

Every write previews its payload and sends nothing without `--yes`, exactly like
`new` and `reply`.

**`removed` is not `delete`.** `moderate-post --status removed` is a soft delete
— the row survives, links do not rot, and `restore-post` undoes it. `delete-post`
purges the post, its replies, its reactions and its reports, and there is no
undo. Reach for the soft one unless the user asked for destruction in as many
words, and quote the irreversible warning back to them before running it.

## Permission boundary

**Publishing is immediate, public, and has no draft or review state on this
API.** There is no change request to stage and no merge to hold back.

So the gate is local and mandatory:

1. `new`, `reply` and every `admin` write without `--yes` print the exact JSON
   payload and send nothing. That is the default.
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
node --test skills/busabase-community/test/community.test.mjs
```

Offline: they cover argument parsing, URL building, config resolution, error
envelopes, both onboarding texts, the CJK-aware column padding, the env-file
search order and precedence, and the admin payload builder (booleans, numbers,
locale text, the `none` feature status).
They need no key and make no network calls, so they stay runnable in CI and on
a fresh clone.
