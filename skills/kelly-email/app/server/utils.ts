export function utcNow() {
  return new Date().toISOString();
}

export function normalizeQueryValue(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) return value[0] || fallback;
  return (value as string) || fallback;
}
