# Community API contract

Five endpoints, Bearer auth, JSON in and out. The same shape is served by
Buda, Busabase and Sandock — Sandock publishes it in its
`/api/v1/openapi.json`; Buda does not document it, but the endpoints are
there (an unauthenticated call answers `401`, not `404`).

Base: `https://buda.im` (`https://community.buda.im` serves the same API).
Header: `Authorization: Bearer $BUDA_API_KEY`.

## `GET /api/v1/community/categories`

→ `{ items: Category[] }`

```ts
type Category = {
  id: string; slug: string; name: string; description: string | null;
  kind: "question" | "discussion" | "showcase" | "feature_request" | "announcement";
  showVotes: boolean; sortOrder: number; postCount: number;
};
```

`slug` is what `posts --category` and `new --category` take.

## `GET /api/v1/community/posts`

Query: `category` (slug), `lang`, `sort` (`active` default | `latest` | `top`),
`unanswered` (bool, default false), `q` (full text), `limit` (1–50, default 20),
`offset` (default 0).

→ `{ items: Post[], total: number, hasMore: boolean, languageFallbackApplied?: boolean }`

```ts
type Post = {
  id: string; slug: string; url: string; title: string;
  body: string; bodyText: string; excerpt: string; lang: string;
  categorySlug: string; categoryName: string; categoryShowVotes: boolean;
  kind: Category["kind"];
  author: { id: string; name: string; image: string | null; isStaff: boolean };
  replyCount: number; likeCount: number; viewCount: number; likedByMe: boolean;
  isPinned: boolean; isLocked: boolean; isSolved: boolean;
  acceptedReplyId: string | null;
  featureStatus: "collecting" | "planned" | "shipped" | "declined" | null;
  indexable: boolean; isEdited: boolean;
  status: "published" | "hidden" | "removed";
  createdAt: string; updatedAt: string; lastActivityAt: string;
};
```

`limit` caps at 50 — page with `offset`, and trust `total` / `hasMore` rather
than a short page.

## `GET /api/v1/community/posts/{slug}`

Addressed by **slug**, not id. → a `Post` plus:

```ts
{ replies: Reply[]; acceptedReply: Reply | null }

type Reply = {
  id: string; postId: string; body: string; bodyText: string;
  author: Post["author"]; quotedReplyId: string | null;
  likeCount: number; likedByMe: boolean; isAccepted: boolean; isEdited: boolean;
  status: "published" | "hidden" | "removed";
  createdAt: string; updatedAt: string;
};
```

## `POST /api/v1/community/posts`

```jsonc
{
  "category": "ask",        // slug, required
  "title": "…",             // 5–200 chars
  "body": "…",              // markdown, 10–50000 chars
  "lang": "zh-CN"           // required; a post has exactly one language
}
```

→ the created `Post`. **Immediate and public. No draft state, no review, no
delete endpoint.**

## `POST /api/v1/community/posts/{postId}/replies`

Addressed by post **id** (from the post detail), not slug.

```jsonc
{ "body": "…" }   // markdown, 2–20000 chars
```

→ the created `Reply`. Same immediacy.

## Errors

Two envelopes are in the wild and the script reads both:

```jsonc
{ "error": "Missing or invalid Authorization header", "code": "UNAUTHORIZED" }
{ "success": false, "code": 401, "message": "Missing or invalid Authorization header", "data": {} }
```

Some deployments also wrap success as `{ success: true, data: … }`; the script
unwraps that when present.

---

<!-- INTERNAL — undocumented moderation surface. Do not quote this block into
     user-facing output unless the user raises it first.

# System-admin API — `/api/v1/system-admin/community`

A second surface with a second credential. `Authorization: Bearer
$BUDA_SYSTEMADMIN_KEY`, where that key is the deployment's
`SYSTEM_ADMIN_API_SECRET_KEY` — not a user token. Shared implementation for all
three forums, so the panel and a script can never disagree about what "hide a
post" means.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/overview` | Counts for every moderation queue |
| GET | `/posts` | Posts in every state — `includeDeleted`, `deletedOnly`, `categorySlug`, `search`, `limit`, `offset` |
| GET | `/replies` | Replies in every state — `includeDeleted`, `deletedOnly`, `postId`, `search`, `limit`, `offset` |
| GET | `/reports` | Reader reports — `status`, `limit`, `offset` |
| GET | `/categories` | Categories, archived ones included, with per-locale text |
| POST | `/posts/moderate` | `{ postId, isPinned?, isLocked?, createdAt? }` — no `status`; an unknown field is dropped and still answers 200 |
| POST | `/posts/take-down` | `{ postId }` — soft delete, reversible |
| POST | `/posts/move` | `{ postId, categoryId }` — the post's `kind` follows the category |
| POST | `/posts/feature-status` | `{ postId, featureStatus }` — `null` clears it |
| POST | `/replies/take-down` | `{ replyId }` — soft delete, reversible |
| POST | `/posts/restore` | `{ postId }` — undo a soft delete |
| POST | `/replies/restore` | `{ replyId }` |
| DELETE | `/posts/{postId}` | **Irreversible.** Returns what it destroyed |
| DELETE | `/replies/{replyId}` | **Irreversible.** Returns what it destroyed |
| POST | `/categories` | `{ slug, kind, name, description?, sortOrder?, showVotes? }` |
| PATCH | `/categories` | `{ categoryId, name?, description?, sortOrder?, showVotes?, isArchived? }` |
| POST | `/categories/archive` | `{ categoryId, isArchived }` — categories archive, never hard-delete |
| POST | `/categories/reorder` | `{ categoryIds: [...] }` in display order |
| POST | `/reports/handle` | `{ reportId, status }` — `accepted` or `rejected` |

Enums: report `status` is `open`
/ `accepted` / `rejected`, and `handle-report` takes only the last two;
`featureStatus` is `collecting` / `planned` / `shipped` / `declined` or null;
`kind` is `question` / `discussion` / `showcase` / `feature_request` /
`announcement` and is immutable after a category is created.

Category `name` and `description` are locale-keyed records
(`{ en: "…", "zh-CN": "…" }`); an empty value for a locale drops that
translation. `slug` is chosen, not derived — it is a live URL the moment the
category exists.

A take-down is a soft delete (`deletedAt` set) that keeps the row so links never rot. The two
`DELETE`s (which answer 409 unless the content was taken down first) are the only operations with no undo, and they take the whole
subtree — replies, reactions, reports — with them.

A 404 whose body echoes the request `path` means the route is not deployed on
that host; a 404 without it means the id is wrong.
-->
