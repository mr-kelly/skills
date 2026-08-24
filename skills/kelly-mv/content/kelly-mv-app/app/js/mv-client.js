// Browser-side helpers for Kelly MV's binary media (uploaded MP3, character
// reference-card images, shot images/videos), built on busabase-sdk's real
// `assets` client (verified present in the pinned busabase-sdk@0.11.0 — see
// the header comment on js/config.js). Unlike a prior skill in this
// migration (kelly-insure-data) which had to hand-roll raw `/api/v1/*` fetch
// calls because its vendored SDK version had no `assets` surface, this skill
// found `client.assets.{createUploadUrl,confirm,get,download}` fully typed
// and already used by Busabase's own product code (the Doc image-paste
// upload hook) — so uploads/reads go through the SDK, not raw fetch.
//
// One real deviation from the shared server.js template: `assets.get()`
// returns a root-relative `url` (e.g. `/api/storage/<key>`, or in practice
// against the standalone `npx busabase@0.11.0 server` CLI, `/api/dev/
// attachment/<key>`) that lives OUTSIDE `/api/v1/*` — the path every other
// converted skill's server.js proxies. server.js in this skill additionally
// proxies both `/api/storage/*` and `/api/dev/*` for exactly this reason
// (see its header comment); this module assumes that proxy exists and only
// ever uses paths relative to `window.location.origin`.
//
// KNOWN LIMITATION, confirmed live against `npx busabase@0.11.0 server`
// (the exact OSS target every converted skill's integration test runs):
// `assets.createUploadUrl()` returns an `/api/dev/upload` target, and that
// route 404s ("Not available in production") under the CLI's own
// NODE_ENV=production gate — so a real upload does not complete against
// that specific packaged CLI today, independent of this proxy (server.js's
// header comment has the full trace). The code here is written against the
// documented SDK contract and mirrors Busabase's own product usage (the Doc
// editor's image-paste upload), so it is correct and will start working
// as soon as the upstream package serves what it advertises; it just cannot
// be verified end-to-end against this specific OSS build today.

const urlCache = new Map();

function fileExtOf(name) {
  const match = /\.[a-z0-9]+$/i.exec(String(name || ""));
  return match ? match[0] : "";
}

// Upload a File/Blob as a new Busabase Asset. Mirrors the
// createUploadUrl -> PUT bytes -> confirm flow used by Busabase's own Doc
// image-paste upload hook (packages/busabase-core/.../use-doc-image-upload.ts).
export async function uploadAsset(client, file, { context = "kelly-mv" } = {}) {
  const fileName = file.name || `upload${fileExtOf(file.name)}`;
  const mimeType = file.type || "application/octet-stream";
  const sizeBytes = file.size;
  const requested = await client.assets.createUploadUrl({ fileName, mimeType, sizeBytes, context });
  if (requested.assetId) {
    // Content-addressed duplicate: the server already has this exact file.
    urlCache.set(requested.assetId, requested.publicUrl);
    return { assetId: requested.assetId, url: requested.publicUrl };
  }
  const put = await fetch(requested.uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: file,
  });
  if (!put.ok) throw new Error(`Asset upload failed (${put.status}).`);
  const confirmed = await client.assets.confirm({
    storageKey: requested.storageKey,
    fileName,
    mimeType,
    sizeBytes,
    context,
  });
  urlCache.set(confirmed.assetId, confirmed.publicUrl);
  return { assetId: confirmed.assetId, url: confirmed.publicUrl };
}

// Resolve an assetId to a fetchable URL, cached for the session (asset ids
// are content-addressed and the OSS server's `url` never expires; a Cloud
// deployment on presigned storage would need a shorter cache, out of scope
// here since every skill in this migration is OSS-tested).
export async function resolveAssetUrl(client, assetId) {
  if (!assetId) return "";
  if (urlCache.has(assetId)) return urlCache.get(assetId);
  try {
    const result = await client.assets.get({ assetId });
    const url = result?.asset?.url || "";
    if (url) urlCache.set(assetId, url);
    return url;
  } catch {
    return "";
  }
}

export async function resolveAssetUrls(client, assetIds) {
  const unique = [...new Set((assetIds || []).filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (id) => [id, await resolveAssetUrl(client, id)]));
  return new Map(pairs);
}
