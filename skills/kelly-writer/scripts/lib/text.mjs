// Small text helpers shared by the trusted generate/export scripts. Ported
// verbatim from the retired lib/common.ts.

export function slugify(input) {
  return (
    String(input || "content")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 80) || "content"
  );
}

export function isoStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
}
