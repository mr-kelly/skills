# Community API contract

Seven endpoints, Bearer auth, JSON in and out. The same shape is served by
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

## `PATCH /api/v1/community/posts/{postId}` · `PATCH /api/v1/community/replies/{replyId}`

Edit your own. Both are author-only: another account's id answers 403, and a
locked post cannot be edited. Same immediacy as publishing — no draft state.

```jsonc
{ "title": "…", "body": "…", "lang": "zh-CN" }   // post: any subset, same limits as create
{ "body": "…" }                                   // reply: 2–20000 chars
```

→ the updated `Post` / `Reply`. The slug never changes; `isEdited` becomes true.

## `POST /api/v1/community/attachments/upload-urls`

Two routes for putting an image where a post body can point at it. A forum
image is a markdown link in `body`, never a field on the post, so these hand
back a URL and stop — writing `![](publicUrl)` into the body is the caller's
job.

```jsonc
{
  "fileName": "screenshot.png",   // 1–255 chars
  "mimeType": "image/png",        // png | jpeg | gif | webp only
  "sizeBytes": 20480,             // 10MB ceiling, far below the general 200MB
  "contentHash": "sha256:<hex>"   // optional, and worth sending — see below
}
```

→ `{ uploadUrl, storageKey, publicUrl, expiresIn, duplicate }`

`PUT` the bytes to `uploadUrl` with the same `content-type` and **no
Authorization header** — the target is already presigned, and a second
credential invalidates the signature.

When `duplicate` is `true` these exact bytes are already stored: `uploadUrl` is
empty, `expiresIn` is `0`, and both the `PUT` and the confirmation below are
skipped. That is what `contentHash` buys — storage is content-addressed
(`attachments/blobs/sha256/<first2>/<hex>.<ext>`), so the same screenshot
uploaded twice occupies one object. Omit the hash and every upload mints a new
random key instead.

Deliberately narrower than the general attachment API underneath it: `spaceId`,
`context` and `metadata` are not accepted at all. A forum credential can upload
a picture for a post and nothing else.

## `POST /api/v1/community/attachments/confirmations`

```jsonc
{ "storageKey": "…", "fileName": "…", "mimeType": "…", "sizeBytes": 20480, "contentHash": "sha256:<hex>" }
```

→ `{ publicUrl }` — the URL to put in the markdown.

The key must be one this endpoint minted (`attachments/…`); a key from another
namespace is refused.

## Errors

Two envelopes are in the wild and the script reads both:

```jsonc
{ "error": "Missing or invalid Authorization header", "code": "UNAUTHORIZED" }
{ "success": false, "code": 401, "message": "Missing or invalid Authorization header", "data": {} }
```

Some deployments also wrap success as `{ success: true, data: … }`; the script
unwraps that when present.

---
