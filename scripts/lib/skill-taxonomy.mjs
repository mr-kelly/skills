// Shared reader for the skill taxonomy that lives in each SKILL.md frontmatter.
// See AGENTS.md for the axes and the allowed values.
//
// Deliberately a tiny hand-rolled YAML reader: the repo's tooling stays zero-dependency
// and the accepted shape is fixed:
//
//   metadata:
//     category: <id>
//     tags:
//       - risk:<id>
//       - industry:<id>
//       - surface:<id>
import fs from "node:fs/promises";
import path from "node:path";

// The 12 top-level categories. Order here is the order of sections on the site.
export const GROUPS = [
  { id: "finance", en: "Finance & Back Office", zh: "财务与后台" },
  { id: "invest", en: "Investing & Wealth", zh: "投资与财富" },
  { id: "rbf", en: "Revenue-Based Finance", zh: "收益分成融资" },
  { id: "legal", en: "Legal & Contracts", zh: "法务与合同" },
  { id: "sales-crm", en: "Sales & Customer", zh: "销售与客户" },
  { id: "comms", en: "Comms & Team", zh: "沟通与协同" },
  { id: "marketing", en: "Brand & Marketing", zh: "品牌与营销" },
  { id: "growth", en: "Growth & Analytics", zh: "增长与分析" },
  { id: "ecommerce", en: "Cross-Border E-commerce", zh: "跨境电商" },
  { id: "industry-intel", en: "Industry Intelligence", zh: "行业情报" },
  { id: "production", en: "Production", zh: "内容制作" },
  { id: "education", en: "Education & Teaching", zh: "教育与教学" },
  { id: "platform", en: "Agent & Dev Platform", zh: "Agent 与研发平台" },
];

// Risk axis (metadata tag `risk:<id>`) — what a skill can do to the outside world.
export const RISK_LABELS = [
  { id: "sandbox", en: "Sandbox data", zh: "沙盒数据" },
  { id: "read-only", en: "Read-only", zh: "只读" },
  { id: "local-write", en: "Local only", zh: "仅本地" },
  { id: "gated-write", en: "Gated write", zh: "审批后写" },
];

export const INDUSTRY_LABELS = [
  { id: "beauty", en: "Beauty", zh: "美业" },
  { id: "ecommerce", en: "E-commerce", zh: "电商" },
  { id: "education", en: "Education", zh: "教育" },
  { id: "family", en: "Family wealth", zh: "家族财富" },
  { id: "financial-services", en: "Financial services", zh: "金融服务" },
  { id: "insurance", en: "Insurance", zh: "保险" },
  { id: "legal", en: "Legal", zh: "法律" },
  { id: "property-management", en: "Property mgmt", zh: "物业" },
  { id: "real-estate", en: "Real estate", zh: "房产" },
  { id: "restaurant", en: "Restaurant", zh: "餐饮" },
  { id: "retail", en: "Retail", zh: "零售" },
];

// Alias directories whose SKILL.md is a hardlink to their replacement's file.
// They ship for backwards compatibility but must not be listed twice.
export const LEGACY_ALIASES = new Set(["app-in-skill-creator", "kelly-app-creator"]);

export function parseSkillMeta(txt) {
  if (!txt.startsWith("---\n")) return null;
  const end = txt.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const lines = txt.slice(4, end).split("\n");

  const start = lines.findIndex((l) => l === "metadata:");
  if (start === -1) return null;

  let category = "";
  const tags = [];
  let inTags = false;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // dedented back to a top-level key
    const field = line.match(/^ {2}([a-z]+):\s*(.*)$/);
    if (field) {
      inTags = field[1] === "tags";
      if (field[1] === "category") category = field[2].trim();
      continue;
    }
    const item = line.match(/^ {4}- (.+)$/);
    if (item && inTags) tags.push(item[1].trim());
  }
  return { category, tags };
}

export async function readSkillMeta(root, dir) {
  let txt;
  try {
    txt = await fs.readFile(path.join(root, "skills", dir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  return parseSkillMeta(txt);
}

/** Every non-alias skill directory, in directory order. */
export async function listSkillDirs(root) {
  const entries = await fs.readdir(path.join(root, "skills"), { withFileTypes: true });
  return entries
    .filter((d) => d.isDirectory() && !LEGACY_ALIASES.has(d.name))
    .map((d) => d.name)
    .sort();
}

/**
 * The marketplace listing's tag set, derived from the skills themselves so it can never
 * drift from AGENTS.md. Categories first, then the industries they cover.
 */
export function deriveMarketplaceTags(metas) {
  const categories = new Set();
  const industries = new Set();
  for (const meta of metas) {
    if (meta?.category) categories.add(meta.category);
    for (const tag of meta?.tags || []) {
      if (tag.startsWith("industry:")) industries.add(tag.slice("industry:".length));
    }
  }
  return [
    "app-in-skill",
    "agent-skills",
    ...[...categories].sort(),
    ...[...industries].sort().map((i) => `industry-${i}`),
  ];
}
