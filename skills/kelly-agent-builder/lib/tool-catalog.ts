// Fixed catalog of tools that a mock agent config may be allowed to use. This
// is the single source of truth for the tool checklist rendered in the app and
// for server-side validation of allowed_tools. Keep generic and brand-free.

export interface ToolCatalogEntry {
  id: string;
  label_en: string;
  label_zh: string;
  category: "read" | "write" | "external" | "compute";
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { id: "web_search", label_en: "Web search", label_zh: "网页搜索", category: "read" },
  { id: "code_exec", label_en: "Code execution", label_zh: "代码执行", category: "compute" },
  { id: "file_read", label_en: "File read", label_zh: "文件读取", category: "read" },
  { id: "file_write", label_en: "File write", label_zh: "文件写入", category: "write" },
  { id: "send_email", label_en: "Send email", label_zh: "发送邮件", category: "external" },
  { id: "calendar", label_en: "Calendar", label_zh: "日历", category: "external" },
  { id: "crm_lookup", label_en: "CRM lookup", label_zh: "CRM 查询", category: "read" },
  { id: "db_query", label_en: "Database query", label_zh: "数据库查询", category: "read" },
  { id: "slack_post", label_en: "Chat post (Slack-like)", label_zh: "群聊发布", category: "external" },
  { id: "http_request", label_en: "HTTP request", label_zh: "HTTP 请求", category: "external" },
];

export const TOOL_CATALOG_IDS: string[] = TOOL_CATALOG.map((entry) => entry.id);

export function isKnownTool(id: string): boolean {
  return TOOL_CATALOG_IDS.includes(id);
}
