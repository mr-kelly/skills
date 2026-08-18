// Pure domain logic ported verbatim (JS, types stripped) from the retired
// lib/data-provider/busabase-provider.ts. This is the correct, already-tested
// normalization/governance model for Kelly Insure Data — same field
// resolution order, same completeness scoring, same status defaults — so it
// is ported rather than re-derived from the schema doc.

export function compactArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

export function text(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const locale = value["zh-CN"] || value.zh || value.en;
    if (locale) return String(locale);
  }
  return "";
}

export function fieldsOf(record) {
  return record?.headCommit?.payload || record?.headCommit?.fields || record?.fields || record?.commit?.fields || {};
}

export function fieldName(field) {
  return text(field?.name) || String(field?.slug || field?.id || "");
}

export function metadataFields(metadata = {}) {
  return Object.entries(metadata).map(([key, value]) => ({ key, value }));
}

export function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function governance(fields, requiredFields) {
  const required = (requiredFields || []).filter(Boolean);
  const missing = required.filter((key) => !isPresent(fields[key]));
  const completeness = required.length ? Math.round(((required.length - missing.length) / required.length) * 100) : 100;
  const status = text(fields.status) || (missing.length ? "needs_metadata" : "active");
  return { completeness_pct: completeness, missing_fields: missing, status };
}

export function normalizeFile(file, requiredFields) {
  const metadata = file.metadata || file.asset?.metadata || {};
  const gov = governance(metadata, requiredFields);
  return {
    id: String(file.id || file.assetId || file.asset?.id || file.path || file.name || crypto.randomUUID()),
    name: String(file.displayName || file.name || file.fileName || file.asset?.fileName || "Untitled file"),
    path: String(file.path || file.node?.slug || file.name || ""),
    size: Number(file.size || file.asset?.size || 0),
    mime_type: String(file.mimeType || file.asset?.mimeType || ""),
    updated_at: String(file.updatedAt || file.asset?.createdAt || ""),
    asset_id: file.assetId || file.asset?.id || undefined,
    url: file.url || file.asset?.url || undefined,
    metadata,
    governance: gov,
  };
}

export function normalizeQa(record, mapping) {
  const fields = fieldsOf(record);
  const required = [mapping.question, mapping.answer, mapping.source].filter(Boolean);
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    question: text(fields[mapping.question || "question"]) || "(no question)",
    answer: text(fields[mapping.answer || "answer"]),
    category: mapping.category ? text(fields[mapping.category]) : "",
    source: text(fields[mapping.source || "carrier"]),
    tags: mapping.tags ? compactArray(fields[mapping.tags]) : [],
    updated_at: String(record.updatedAt || record.createdAt || ""),
    status: text(fields[mapping.status || "status"]) || record.status || "active",
    fields,
    governance: governance(fields, required),
  };
}

export function normalizeNews(record, mapping, collection) {
  const fields = fieldsOf(record);
  const required = [mapping.title].filter(Boolean);
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    collection,
    title: text(fields[mapping.title || "title"]) || "(untitled)",
    summary: text(fields[mapping.summary || "content"]),
    url: text(fields[mapping.url || "source_url"]),
    source: text(fields[mapping.source || "carrier"]),
    published_at: text(fields[mapping.published_at || "published_at"]) || String(record.updatedAt || ""),
    category: text(fields[mapping.category || "category"]),
    tags: mapping.tags ? compactArray(fields[mapping.tags]) : [],
    status: text(fields[mapping.status || "status"]) || record.status || "active",
    fields,
    governance: governance(fields, required),
  };
}

export function normalizeFeedback(record, mapping) {
  const fields = fieldsOf(record);
  const required = [mapping.title, mapping.content, mapping.source, mapping.created_at, mapping.status].filter(Boolean);
  return {
    id: String(record.id || fields.id || crypto.randomUUID()),
    title: text(fields[mapping.title || "title"]) || "(untitled feedback)",
    content: text(fields[mapping.content || "content"]),
    source: text(fields[mapping.source || "source"]),
    user_name: text(fields[mapping.user_name || "user_name"]),
    contact: text(fields[mapping.contact || "contact"]),
    rating: text(fields[mapping.rating || "rating"]),
    category: text(fields[mapping.category || "category"]),
    tags: compactArray(fields[mapping.tags || "tags"]),
    created_at: text(fields[mapping.created_at || "created_at"]) || String(record.createdAt || record.updatedAt || ""),
    status: text(fields[mapping.status || "status"]) || record.status || "new",
    fields,
    governance: governance(fields, required),
  };
}

export function qualityScore(items) {
  if (!items.length) return 100;
  return Math.round(
    items.reduce((sum, item) => sum + Number(item.governance?.completeness_pct || 0), 0) / items.length,
  );
}

export function needsGovernance(items) {
  return items.filter((item) => {
    const status = item.governance?.status || "";
    return (
      Boolean(item.governance?.missing_fields?.length) ||
      ["draft", "review", "needs_metadata", "needs_review"].includes(status)
    );
  }).length;
}
