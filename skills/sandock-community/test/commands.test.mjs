// Behaviour tests for the command layer, driven through `run()` with a fake
// `fetch`. No credentials, no network.
//
// The pure-helper tests live in `community.test.mjs`. These cover the things a
// unit test of a helper cannot: whether a command SENDS anything, which
// credential it sends, and what it refuses to do. Those are the answers that
// matter when the command publishes to a public forum or deletes someone's post.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { CommunityCliError, run } from "../scripts/community.mjs";

/** A fetch that records every call and replies with whatever you queue up. */
function recorder(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init = {}) => {
    // A presigned PUT carries raw bytes, not JSON — record those as bytes
    // rather than throwing, so the upload path is testable at all.
    const isJson = typeof init.body === "string";
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      auth: init.headers?.authorization,
      contentType: init.headers?.["content-type"],
      body: isJson ? JSON.parse(init.body) : undefined,
      bytes: isJson ? undefined : init.body,
    });
    const next = queue.shift() ?? { status: 200, payload: {} };
    return new Response(next.payload === undefined ? "" : JSON.stringify(next.payload), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

const ENV = {
  SANDOCK_API_KEY: "user-key",
  SANDOCK_API_KEY_ALT: "alt-key",
};

const POST = {
  id: "cpost1",
  slug: "hello-abc",
  url: "/community/ask/hello-abc",
  title: "Hello",
  body: "Body",
  categorySlug: "ask",
  categoryName: "Ask",
  kind: "question",
  lang: "en",
  author: { id: "u1", name: "Kelly", image: null, isStaff: true },
  replyCount: 0,
  likeCount: 0,
  viewCount: 0,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  lastActivityAt: "2026-09-21T00:00:00.000Z",
  status: "published",
  isPinned: false,
  isLocked: false,
  isSolved: false,
  replies: [],
};

let log;
beforeEach(() => {
  log = [];
  console.log = (...args) => log.push(args.join(" "));
});

describe("the publish gate", () => {
  test("`new` without --yes sends nothing at all", async () => {
    const { calls, fetchImpl } = recorder();
    await run(["new", "--category", "ask", "--title", "A real title", "--body", "A body long enough."], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(calls.length, 0, "the preview must not reach the network");
    assert.match(log.join("\n"), /NOT sent/);
  });

  test("`edit` PATCHes the post by id, and previews without --yes", async () => {
    const preview = recorder();
    await run(["edit", "cpost1", "--body", "corrected body text"], { env: ENV, fetchImpl: preview.fetchImpl });
    assert.equal(preview.calls.length, 0);

    const { calls, fetchImpl } = recorder([{ payload: { ...POST, title: "Same title here" } }]);
    await run(["edit", "cpost1", "--body", "corrected body text", "--yes"], { env: ENV, fetchImpl });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    assert.equal(new URL(calls[0].url).pathname, "/api/v1/community/posts/cpost1");
    assert.deepEqual(calls[0].body, { body: "corrected body text" });
  });

  test("`edit-reply` PATCHes the reply, and `edit` with nothing to change is refused", async () => {
    const { calls, fetchImpl } = recorder([{ payload: { id: "crep1", bodyText: "new" } }]);
    await run(["edit-reply", "crep1", "--body", "new text", "--yes"], { env: ENV, fetchImpl });
    assert.equal(new URL(calls[0].url).pathname, "/api/v1/community/replies/crep1");
    assert.equal(calls[0].method, "PATCH");

    await assert.rejects(() => run(["edit", "cpost1", "--yes"], { env: ENV, fetchImpl }), CommunityCliError);
    assert.equal(calls.length, 1);
  });

  test("a route the host has not deployed is reported as such, not as a wrong id", async () => {
    const { fetchImpl } = recorder([
      { status: 404, payload: { error: "Not found", path: "/api/v1/community/posts/cpost1" } },
    ]);
    await assert.rejects(
      () => run(["edit", "cpost1", "--body", "a body that is long enough", "--yes"], { env: ENV, fetchImpl }),
      /does not serve that route yet/,
    );
  });

  test("a refused edit says whose it has to be, not that the category is closed", async () => {
    const { fetchImpl } = recorder([{ status: 403, payload: { error: "You can only edit your own posts" } }]);
    await assert.rejects(
      () => run(["edit", "cpost1", "--body", "someone else's post", "--yes"], { env: ENV, fetchImpl }),
      /Only the account that wrote it/,
    );
  });

  test("`reply` without --yes sends nothing at all", async () => {
    const { calls, fetchImpl } = recorder();
    await run(["reply", "cpost1", "--body", "a reply"], { env: ENV, fetchImpl });
    assert.equal(calls.length, 0);
  });

  test("`new --yes` posts once, to the right URL, with the user's key", async () => {
    const { calls, fetchImpl } = recorder([{ payload: POST }]);
    await run(["new", "--category", "ask", "--title", "A real title", "--body", "A body long enough.", "--yes"], {
      env: ENV,
      fetchImpl,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://sandock.ai/api/v1/community/posts");
    assert.equal(calls[0].auth, "Bearer user-key");
    assert.deepEqual(calls[0].body, {
      category: "ask",
      title: "A real title",
      body: "A body long enough.",
      lang: "en",
    });
  });

  test("a too-short title is refused before any request", async () => {
    const { calls, fetchImpl } = recorder();
    await assert.rejects(
      () =>
        run(["new", "--category", "ask", "--title", "hi", "--body", "A body long enough.", "--yes"], {
          env: ENV,
          fetchImpl,
        }),
      CommunityCliError,
    );
    assert.equal(calls.length, 0);
  });
});

describe("credentials", () => {
  test("reading uses the selected account's key", async () => {
    const { calls, fetchImpl } = recorder([{ payload: { items: [], total: 0, hasMore: false } }]);
    await run(["posts"], { env: ENV, fetchImpl });
    assert.equal(calls[0].auth, "Bearer user-key");
  });
});

describe("accounts", () => {
  test("--as picks that account's credential", async () => {
    const { calls, fetchImpl } = recorder([{ payload: { items: [], total: 0, hasMore: false } }]);
    await run(["posts", "--as", "alt"], { env: ENV, fetchImpl });
    assert.equal(calls[0].auth, "Bearer alt-key");
  });

  test("an unknown account refuses instead of falling back to the default", async () => {
    const { calls, fetchImpl } = recorder();
    await assert.rejects(
      () => run(["posts", "--as", "ghost"], { env: ENV, fetchImpl }),
      (/** @type {any} */ error) => {
        assert.match(error.message, /SANDOCK_API_KEY_GHOST is not set/);
        return true;
      },
    );
    assert.equal(calls.length, 0, "publishing as the wrong identity is not undoable");
  });

  test("$SANDOCK_ACCOUNT moves the default, and --as still overrides it", async () => {
    const env = { ...ENV, SANDOCK_ACCOUNT: "alt" };
    const first = recorder([{ payload: { items: [], total: 0, hasMore: false } }]);
    await run(["posts"], { env, fetchImpl: first.fetchImpl });
    assert.equal(first.calls[0].auth, "Bearer alt-key");

    const second = recorder([{ payload: { items: [], total: 0, hasMore: false } }]);
    await run(["posts", "--as", "default"], { env, fetchImpl: second.fetchImpl });
    assert.equal(second.calls[0].auth, "Bearer user-key");
  });

  test("`accounts` never prints a key", async () => {
    const { fetchImpl } = recorder();
    await run(["accounts"], { env: ENV, fetchImpl });
    const printed = log.join("\n");
    assert.match(printed, /default/);
    assert.match(printed, /alt/);
    for (const secret of ["user-key", "alt-key"]) {
      assert.ok(!printed.includes(secret), `${secret} must not appear`);
    }
  });

  test("`accounts --verify` reports a rejected account instead of giving up", async () => {
    const { calls, fetchImpl } = recorder([
      { status: 200, payload: { user: { name: "Kelly" } } },
      { status: 401, payload: { error: "Unauthorized" } },
    ]);
    await run(["accounts", "--verify"], { env: ENV, fetchImpl });
    assert.equal(calls.length, 2, "checks every account, not just the first");
    const printed = log.join("\n");
    assert.match(printed, /Kelly/);
    assert.match(printed, /REJECTED/);
  });
});

describe("failure modes", () => {
  test("no key at all produces the setup instructions, not a stack trace", async () => {
    const { fetchImpl } = recorder();
    await assert.rejects(
      () => run(["posts"], { env: {}, fetchImpl }),
      (/** @type {any} */ error) => {
        assert.ok(error instanceof CommunityCliError);
        assert.match(error.message, /SANDOCK_API_KEY is not set/);
        // The docs URL differs per product; that it offers one is the point.
        assert.match(error.message, /Create an API key: https:\/\/\S+/);
        return true;
      },
    );
  });

  test("a 404 without a path reads as a wrong id", async () => {
    const { fetchImpl } = recorder([{ status: 404, payload: { error: "Not found" } }]);
    await assert.rejects(
      () => run(["post", "no-such-slug"], { env: ENV, fetchImpl }),
      (/** @type {any} */ error) => {
        assert.match(error.message, /Check the slug or id/);
        return true;
      },
    );
  });

  test("a 401 names the credential that was actually rejected", async () => {
    const { fetchImpl } = recorder([{ status: 401, payload: { error: "Unauthorized" } }]);
    await assert.rejects(
      () => run(["posts", "--as", "alt"], { env: ENV, fetchImpl }),
      (/** @type {any} */ error) => {
        assert.match(error.message, /SANDOCK_API_KEY_ALT/);
        return true;
      },
    );
  });

  test("a success envelope is unwrapped, so a wrapped deployment reads the same", async () => {
    const { fetchImpl } = recorder([{ payload: { success: true, data: { items: [], total: 3, hasMore: false } } }]);
    await run(["posts", "--json"], { env: ENV, fetchImpl });
    assert.deepEqual(JSON.parse(log.join("\n")), { items: [], total: 3, hasMore: false });
  });

  test("a non-JSON body fails with a message rather than a parser crash", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      return new Response("<html>gateway error</html>", { status: 502, headers: { "content-type": "text/html" } });
    };
    await assert.rejects(
      () => run(["posts"], { env: ENV, fetchImpl }),
      (/** @type {any} */ error) => {
        assert.ok(error instanceof CommunityCliError);
        assert.match(error.message, /502/);
        return true;
      },
    );
  });
});

describe("upload", () => {
  // A directory of this suite's own, not a fixed name under /tmp. The three
  // forum skills run these same tests concurrently in CI, and a shared path
  // meant one suite's cleanup deleted the file another was still reading —
  // which looks like "cannot read" in whichever suite lost the race.
  const FIXTURES = mkdtempSync(path.join(tmpdir(), "community-upload-"));
  const PNG = path.join(FIXTURES, "shot.png");
  const TARGET = {
    uploadUrl: "https://bucket.example/presigned?sig=abc",
    storageKey: "attachments/blobs/sha256/ab/abcd.png",
    publicUrl: "https://cdn.example/attachments/blobs/sha256/ab/abcd.png",
    expiresIn: 3600,
    duplicate: false,
  };

  before(() => writeFileSync(PNG, Buffer.from("pretend png bytes")));
  after(() => rmSync(FIXTURES, { recursive: true, force: true }));

  test("asks for a target, PUTs the bytes, then confirms", async () => {
    const { calls, fetchImpl } = recorder([
      { payload: TARGET },
      { payload: {} },
      { payload: { publicUrl: TARGET.publicUrl } },
    ]);
    await run(["upload", PNG], { env: ENV, fetchImpl });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, "https://sandock.ai/api/v1/community/attachments/upload-urls");
    assert.equal(calls[0].auth, "Bearer user-key");
    assert.match(calls[0].body.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(calls[0].body.mimeType, "image/png");

    assert.equal(calls[1].url, TARGET.uploadUrl);
    assert.equal(calls[1].method, "PUT");
    // The target is already signed; sending a second credential is what breaks it.
    assert.equal(calls[1].auth, undefined);
    assert.ok(calls[1].bytes, "the bytes themselves must be sent");

    assert.equal(calls[2].url, "https://sandock.ai/api/v1/community/attachments/confirmations");
    assert.equal(calls[2].body.storageKey, TARGET.storageKey);
  });

  test("prints the markdown line, because that is what goes in a post body", async () => {
    const { fetchImpl } = recorder([{ payload: TARGET }, { payload: {} }, { payload: {} }]);
    await run(["upload", PNG], { env: ENV, fetchImpl });
    assert.match(log.join("\n"), /!\[\]\(https:\/\/cdn\.example\/attachments\/blobs\/sha256\/ab\/abcd\.png\)/);
  });

  test("stored bytes skip both the upload and the confirmation", async () => {
    const { calls, fetchImpl } = recorder([{ payload: { ...TARGET, duplicate: true, uploadUrl: "", expiresIn: 0 } }]);
    await run(["upload", PNG], { env: ENV, fetchImpl });
    assert.equal(calls.length, 1, "a duplicate has nothing to send and nothing to confirm");
    assert.match(log.join("\n"), /Already stored/);
  });

  test("a non-image is refused before anything is read or sent", async () => {
    const { calls, fetchImpl } = recorder();
    await assert.rejects(() => run(["upload", "notes.txt"], { env: ENV, fetchImpl }), CommunityCliError);
    assert.equal(calls.length, 0);
  });

  test("a relative upload target is resolved against the API origin", async () => {
    // A deployment on local-disk storage hands back a path on the API host, not
    // an absolute presigned URL. `fetch` rejects the former outright, so this is
    // the difference between working and ERR_INVALID_URL on every self-hosted
    // install — and an absolute fixture can never show it.
    const { calls, fetchImpl } = recorder([
      { payload: { ...TARGET, uploadUrl: "/api/dev/upload?key=attachments%2Fblobs%2Fsha256%2Fab%2Fabcd.png" } },
      { payload: {} },
      { payload: {} },
    ]);
    await run(["upload", PNG], { env: ENV, fetchImpl });

    assert.equal(calls[1].url, "https://sandock.ai/api/dev/upload?key=attachments%2Fblobs%2Fsha256%2Fab%2Fabcd.png");
  });

  test("a failed storage PUT is reported, and nothing is confirmed", async () => {
    const { calls, fetchImpl } = recorder([{ payload: TARGET }, { status: 403, payload: {} }]);
    await assert.rejects(() => run(["upload", PNG], { env: ENV, fetchImpl }), CommunityCliError);
    assert.equal(calls.length, 2, "a confirmation after a failed PUT would register bytes that are not there");
  });
});
