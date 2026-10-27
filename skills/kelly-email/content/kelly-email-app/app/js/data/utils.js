export function utcNow() {
  return new Date().toISOString();
}

export function normalizeQueryValue(value, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}
