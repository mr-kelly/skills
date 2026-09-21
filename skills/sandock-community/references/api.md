# Community API contract

Five endpoints, Bearer auth, JSON in and out. The same shape is served by
Sandock, Busabase and Buda — Sandock is the one that publishes it, in
`/api/v1/openapi.json`, so that document is the contract of record for all
three.

Base: `https://sandock.ai` (see SKILL.md on why not the `community.` host).
Header: `Authorization: Bearer $SANDOCK_API_KEY`.

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
