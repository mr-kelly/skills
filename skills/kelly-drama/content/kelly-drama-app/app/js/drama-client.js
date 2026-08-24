// Browser-side helpers for Kelly Drama's binary media (character reference-
// card images, character reference-voice samples, shot storyboard images/
// videos), built on busabase-sdk's real `assets` client
// (createUploadUrl -> PUT bytes -> confirm), same as Kelly MV's mv-client.js
// (this skill's closest architectural twin) — see that module's header
// comment for the full trace of how `client.assets.*` was verified against
// busabase-sdk@0.11.0 and Busabase's own product usage (the Doc editor's
// image-paste upload hook).
//
// KNOWN LIMITATION, inherited from the same trace: `assets.createUploadUrl()`
// returns an `/api/dev/upload` target that 404s ("Not available in
// production") under the standalone `npx busabase@0.11.0 server` CLI's own
// NODE_ENV=production gate — so a real upload does not complete against that
// specific packaged OSS build today, independent of server.js's proxy (which
// still proxies `/api/storage/*` and `/api/dev/*` for exactly this reason).
// The code here is written against the documented SDK contract and mirrors
// Busabase's own product usage, so it is correct and will start working as
// soon as the upstream package serves what it advertises.

const urlCache = new Map();

function fileExtOf(name) {
  const match = /\.[a-z0-9]+$/i.exec(String(name || ""));
  return match ? match[0] : "";
}

// Upload a File/Blob as a new Busabase Asset.
export async function uploadAsset(client, file, { context = "kelly-drama" } = {}) {
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

// Resolve an assetId to a fetchable URL, cached for the session.
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
