#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type AnyRecord = Record<string, any>;

function parseArgs(argv = process.argv.slice(2)) {
  const flags: AnyRecord = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

function env() {
  const baseUrl = String(process.env.KELLY_INSURE_DATA_BUSABASE_URL || process.env.BUSABASE_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const apiKey = String(process.env.KELLY_INSURE_DATA_BUSABASE_API_KEY || process.env.BUSABASE_API_KEY || "");
  const spaceId = String(process.env.KELLY_INSURE_DATA_BUSABASE_SPACE_ID || process.env.BUSABASE_SPACE_ID || "");
  if (!baseUrl) throw new Error("Missing KELLY_INSURE_DATA_BUSABASE_URL or BUSABASE_BASE_URL.");
  if (!apiKey) throw new Error("Missing KELLY_INSURE_DATA_BUSABASE_API_KEY or BUSABASE_API_KEY.");
  return { baseUrl, apiKey, spaceId };
}

async function api(method: string, pathname: string, body?: unknown): Promise<any> {
  const config = env();
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
      ...(config.spaceId ? { "x-busabase-space": config.spaceId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`busabase ${method} ${pathname} -> ${response.status} ${detail}`.trim());
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function listDriveFiles(nodeId: string) {
  const files = await api("GET", `/api/v1/drives/${encodeURIComponent(nodeId)}/files`);
  return Array.isArray(files) ? files : [];
}

function firstSegment(filePath: string) {
  return filePath.split("/").filter(Boolean)[0] || "";
}

function inferCarrier(filePath: string, text: string) {
  const top = firstSegment(filePath);
  if (/萬通|万通|YF Life/i.test(text) || top === "万T") return "萬通保險國際有限公司";
  if (/友邦|AIA/i.test(text) || top === "友B") return "友邦保險";
  if (/保誠|保诚|Prudential/i.test(text) || top === "保C") return "保誠保險";
  return top;
}

function inferDocumentType(filePath: string, text: string) {
  const name = path.basename(filePath);
  const haystack = `${filePath}\n${text}`;
  if (/保單條款|保单条款|Policy Provision|policy terms/i.test(haystack)) return "保单条款";
  if (/產品介紹|产品介绍|產品小冊子|产品小册子|brochure/i.test(haystack)) return "产品介绍";
  if (/優惠|优惠|promotion/i.test(haystack)) return "优惠推广";
  if (/繳費|缴费|payment/i.test(haystack)) return "缴费指引";
  if (/核保|underwriting/i.test(haystack)) return "核保指引";
  if (/理賠|理赔|claims/i.test(haystack)) return "理赔服务";
  if (/市場支援|市场支援|company/i.test(haystack)) return "市场支援";
  return name.replace(/\.pdf$/i, "");
}

function inferPolicyType(filePath: string, text: string) {
  const haystack = `${filePath}\n${text}`;
  if (/醫療|医疗|medical/i.test(filePath)) return "medical";
  if (/危疾|重疾|critical illness/i.test(filePath)) return "critical_illness";
  if (/年金|annuity/i.test(filePath)) return "annuity";
  if (/年金|annuity/i.test(haystack)) return "annuity";
  if (/危疾|重疾|critical illness/i.test(haystack)) return "critical_illness";
  if (/醫療|医疗|medical/i.test(haystack)) return "medical";
  if (/萬用壽險|万用寿险|universal life/i.test(haystack)) return "universal_life";
  if (/儲蓄|储蓄|savings/i.test(haystack)) return "savings";
  if (/終身壽險|终身寿险|whole life/i.test(haystack)) return "whole_life";
  return "";
}

function inferProductName(filePath: string, text: string) {
  const parts = filePath.split("/").filter(Boolean);
  const productDir = parts
    .slice(0, -1)
    .reverse()
    .find((part) => /[_-]/.test(part) && !/^\d{2}_/.test(part));
  const pathCandidate = productDir || path.basename(filePath, ".pdf");
  const fromPath = pathCandidate
    .replace(/[-_](產品介紹|产品介绍|產品小冊子|产品小册子|保單條款|保单条款).*$/i, "")
    .replace(/^\d{6,8}[-_]/, "")
    .replace(/^[^_]+_/, "")
    .trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 60);
  const likely = lines.find(
    (line) =>
      /保|險|险|年金|計劃|计划|Life|Annuity/i.test(line) &&
      !/^｜.*｜$/.test(line) &&
      !/^(醫療|医疗|退休|財富|财富|Medical|Retire)/i.test(line),
  );
  return fromPath || likely || path.basename(filePath, ".pdf");
}

function inferEffectiveDate(filePath: string) {
  const match = filePath.match(/(20\d{2})([01]\d)([0-3]\d)?/);
  if (!match) return "";
  return match[3] ? `${match[1]}-${match[2]}-${match[3]}` : `${match[1]}-${match[2]}`;
}

async function pdfText(localFile: string, maxPages: number) {
  const args = ["-f", "1", "-l", String(maxPages), "-layout", localFile, "-"];
  const { stdout } = await execFileAsync("pdftotext", args, { maxBuffer: 1024 * 1024 * 5 });
  return stdout;
}

async function pdfPages(localFile: string) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [localFile]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number.parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

function metadataFor(file: AnyRecord, text: string, pages: number) {
  const tags = [
    firstSegment(file.path),
    inferDocumentType(file.path, text),
    inferPolicyType(file.path, text),
  ].filter(Boolean);
  return {
    metadata_schema: "kelly-insure-data.file_metadata.v1",
    metadata_source: "kelly-insure-data.backfill_pdf_metadata",
    parsed_at: new Date().toISOString(),
    parser: { method: "pdftotext + path heuristics", confidence: "medium" },
    carrier: inferCarrier(file.path, text),
    document_type: inferDocumentType(file.path, text),
    product_name: inferProductName(file.path, text),
    policy_type: inferPolicyType(file.path, text),
    effective_date: inferEffectiveDate(file.path),
    language: /[万萬保險险]/.test(text) ? "zh-Hant/zh-Hans" : "",
    tags,
    source_file: {
      drive_node_id: "",
      path: file.path,
      asset_id: file.assetId,
      pages,
      mime_type: file.mimeType,
      size: file.size,
    },
    extraction_summary: text.replace(/\s+/g, " ").slice(0, 500),
    governance: {
      status: "needs_review",
      completeness_pct: 75,
      missing_fields: ["human_reviewed_at", "source_url"],
      review_note: "Generated by PDF metadata backfill from local PDF text and file path.",
    },
  };
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs();
  const driveNodeId = String(args.driveNodeId || args["drive-node-id"] || process.env.KELLY_INSURE_DATA_BUSABASE_DRIVE_NODE_ID || "");
  const filesRoot = path.resolve(String(args.filesRoot || args["files-root"] || process.cwd()));
  const limit = args.limit ? Number.parseInt(String(args.limit), 10) : 0;
  const concurrency = Number.parseInt(String(args.concurrency || "4"), 10);
  const maxPages = Number.parseInt(String(args.maxPages || args["max-pages"] || "5"), 10);
  const apply = Boolean(args.apply);
  if (!driveNodeId) throw new Error("Missing --drive-node-id or KELLY_INSURE_DATA_BUSABASE_DRIVE_NODE_ID.");

  const files = (await listDriveFiles(driveNodeId))
    .filter((file) => file.mimeType === "application/pdf" && file.assetId)
    .slice(0, limit || undefined);
  const results: AnyRecord[] = [];
  await mapLimit(files, concurrency, async (file) => {
    const localFile = path.join(filesRoot, file.path);
    try {
      await fs.access(localFile);
      const [text, pages] = await Promise.all([pdfText(localFile, maxPages), pdfPages(localFile)]);
      const metadata = metadataFor(file, text, pages);
      metadata.source_file.drive_node_id = driveNodeId;
      if (apply) {
        await api("PATCH", `/api/v1/assets/${encodeURIComponent(file.assetId)}/metadata`, {
          metadata,
          mode: "merge",
        });
      }
      results.push({ path: file.path, assetId: file.assetId, applied: apply, metadata });
    } catch (error) {
      results.push({ path: file.path, assetId: file.assetId, error: error instanceof Error ? error.message : String(error) });
    }
  });

  const ok = results.filter((item) => !item.error).length;
  const failed = results.length - ok;
  console.log(JSON.stringify({ ok: true, apply, scanned: results.length, updated: apply ? ok : 0, planned: apply ? 0 : ok, failed, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
