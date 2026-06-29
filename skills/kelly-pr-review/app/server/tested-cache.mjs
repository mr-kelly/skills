import { TESTED_PATH } from "./paths.mjs";
import { rejectIfLocked } from "./lock.mjs";
import { readJson, utcNow, writeJson } from "./utils.mjs";

function normalizeEntry(itemId, value) {
  if (!value || value.tested === false) return null;
  const testedAt = value.tested_at || value.updated_at || utcNow();
  return {
    id: itemId,
    tested: true,
    tested_at: testedAt,
    updated_at: value.updated_at || testedAt,
  };
}

export async function loadTestedCache() {
  const payload = await readJson(TESTED_PATH, { updated_at: "", items: {} });
  const items = {};
  for (const [id, value] of Object.entries(payload.items || {})) {
    const entry = normalizeEntry(id, value);
    if (entry) items[id] = entry;
  }
  return {
    updated_at: payload.updated_at || "",
    items,
  };
}

export function applyTestedCache(items, cache) {
  return items.map((item) => {
    const entry = cache.items?.[item.id];
    return {
      ...item,
      tested: Boolean(entry?.tested),
      tested_at: entry?.tested_at || "",
    };
  });
}

export async function setTested(itemId, tested) {
  await rejectIfLocked();
  const cache = await loadTestedCache();
  const id = String(itemId || "");
  if (!id) throw new Error("Missing item id");
  const now = utcNow();
  if (tested) {
    cache.items[id] = {
      id,
      tested: true,
      tested_at: cache.items[id]?.tested_at || now,
      updated_at: now,
    };
  } else {
    delete cache.items[id];
  }
  const payload = {
    updated_at: now,
    items: cache.items,
  };
  await writeJson(TESTED_PATH, payload);
  return payload.items[id] || { id, tested: false, tested_at: "", updated_at: now };
}
