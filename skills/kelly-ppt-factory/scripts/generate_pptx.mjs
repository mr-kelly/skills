#!/usr/bin/env node
// Trusted PPTX generation engine. Generating a real binary .pptx file is not
// something the browser AirApp can do, so this is a skill-root trusted
// script: it reads an approved deck and its slide cards from Busabase with
// its own credentials, generates the .pptx to a local output path with
// pptxgenjs, then writes the render/QA handoff fields back onto the deck
// row and creates/updates the deck's export record. The actual slide
// layout/style-application logic below is ported FAITHFULLY (same
// positions, same colors, same per-slide-type branching) from the retired
// scripts/generate_pptx.ts — this is real, working generation logic, not a
// stub to redesign.
//
// Only approved decks are generated: a deck is generatable when its own
// decision_action is a genuine "approve" (written exclusively by the
// review queue's decideItem() in content/kelly-ppt-factory-app/app/js/providers/busabase-provider.js)
// — not merely because status happens to read "approved"/"generated". This
// mirrors kelly-legal-precedent-desk's export_research_pack.mjs precedent:
// closing the gap where a spoofed status could otherwise be enough to
// trigger generation.
//
// Usage:
//   node scripts/generate_pptx.mjs --deck=<deck_id> [--out=/path/to/dir]
//
// Connects with the trusted process's own credentials (BUSABASE_BASE_URL,
// BUSABASE_API_KEY, BUSABASE_SPACE_ID), never the AirApp's ambient session.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBusabaseClient } from "busabase-sdk";
import { inspectProvisionedResources } from "busabase-sdk/airapp";
import pptxgen from "pptxgenjs";
import { appConfig } from "../content/kelly-ppt-factory-app/app/js/config.js";
import {
  baseDeckFields,
  baseExportFields,
  normalizeDeckRow,
  normalizeExportRow,
  normalizeSlideRow,
  normalizeStyleRow,
} from "../content/kelly-ppt-factory-app/app/js/ppt-model.js";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log(`Usage: node scripts/generate_pptx.mjs --deck=<deck_id> [--out=/path/to/dir]

Reads the deck and its slide cards from Busabase and writes <deck_id>.pptx
into --out (default: <skill>/exports, gitignored). Only generates a deck
whose decision_action is a genuine "approve" recorded by the review queue —
never bare status, which could be spoofed by direct import. After writing
the file, updates the deck's pptx_path/render_path/generated_slide_count
and creates/updates its export record in Busabase (status: "generated").`);
}

const normalizeFields = (fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([slug, value]) => [slug.replaceAll("-", "_"), value]));
const toBusabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.replaceAll("_", "-"), String(value ?? "")]));

async function readAll(client, declared) {
  /** @type {Array<Record<string, any>>} */
  const rows = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await client.records.list({
      baseId: declared.baseId,
      limit: declared.readLimit,
      ...(cursor ? { cursor } : {}),
    });
    const records = Array.isArray(result) ? result : result.records || [];
    for (const record of records) {
      rows.push({
        ...normalizeFields(record.headCommit?.payload || record.headCommit?.fields || record.fields),
        __recordId: record.id,
        __headCommitId: record.headCommitId || record.headCommit?.id,
      });
    }
    cursor = Array.isArray(result) ? null : result.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

async function findByField(client, declared, fieldSlug, value) {
  try {
    return await client.records.get({ baseId: declared.baseId, fieldSlug, valueText: value });
  } catch (error) {
    if (error?.code === "NOT_FOUND" || error?.status === 404) return null;
    throw error;
  }
}

// ---- Slide generation, ported faithfully from the retired
// scripts/generate_pptx.ts (same positions, same colors, same per-slide-type
// branching). Only the input plumbing (Busabase rows instead of a local
// snapshot.json) changed. ----

function addTextBox(slide, text, options) {
  slide.addText(text || " ", { margin: 0.06, fit: "shrink", breakLine: false, ...options });
}

function addFooter(pptx, slide, deck, card) {
  slide.addShape(pptx.ShapeType.line, { x: 0.55, y: 7.05, w: 12.2, h: 0, line: { color: "E5E0D8", width: 1 } });
  addTextBox(slide, `${deck.title} · Slide ${card.ref}`, {
    x: 0.6,
    y: 7.15,
    w: 7.5,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 8,
    color: "6F7772",
  });
}

function typeLabel(type) {
  return String(type || "").replace(/_/g, " ");
}

function buildPptx({ deck, cards, brandName, style }) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "kelly-ppt-factory";
  pptx.subject = deck.theme;
  pptx.title = deck.title;
  pptx.company = brandName || "Kelly";
  pptx.theme = {
    headFontFace: "Arial Rounded MT Bold",
    bodyFontFace: "Aptos",
  };

  const palette = style?.palette?.length ? style.palette : ["#F7A66A", "#FFF6E8", "#2F4F46", "#5A9D8C", "#C94F4F"];

  for (const card of cards) {
    const slide = pptx.addSlide();
    const content = card.content || {};
    slide.background = { color: card.slide_type === "cover" ? palette[1].replace("#", "") : "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 0.42,
      fill: { color: palette[0].replace("#", "") },
      line: { color: palette[0].replace("#", "") },
    });
    if (card.slide_type === "cover") {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.75,
        y: 1.0,
        w: 5.2,
        h: 4.8,
        rectRadius: 0.08,
        fill: { color: "FFFFFF" },
        line: { color: "F0D8C0" },
      });
      addTextBox(slide, content.image_prompt || card.asset_brief, {
        x: 1.05,
        y: 1.38,
        w: 4.6,
        h: 3.9,
        fontSize: 18,
        color: palette[2].replace("#", ""),
        valign: "middle",
        align: "center",
      });
      addTextBox(slide, content.title || card.title, {
        x: 6.35,
        y: 1.3,
        w: 5.8,
        h: 0.9,
        fontSize: 42,
        bold: true,
        color: palette[2].replace("#", ""),
        fit: "shrink",
      });
      addTextBox(slide, content.subtitle || card.objective, {
        x: 6.4,
        y: 2.28,
        w: 5.4,
        h: 0.55,
        fontSize: 20,
        color: palette[3].replace("#", ""),
      });
      addTextBox(slide, content.chinese || "", {
        x: 6.4,
        y: 3.25,
        w: 5.6,
        h: 0.72,
        fontSize: 26,
        bold: true,
        color: palette[4].replace("#", ""),
      });
      addTextBox(slide, content.pinyin || "", {
        x: 6.42,
        y: 4.05,
        w: 5.6,
        h: 0.44,
        fontSize: 15,
        color: palette[2].replace("#", ""),
      });
    } else {
      addTextBox(slide, card.title, {
        x: 0.62,
        y: 0.72,
        w: 7.0,
        h: 0.45,
        fontSize: 25,
        bold: true,
        color: palette[2].replace("#", ""),
      });
      addTextBox(slide, typeLabel(card.slide_type), {
        x: 10.55,
        y: 0.76,
        w: 2.1,
        h: 0.26,
        fontSize: 10,
        bold: true,
        color: "FFFFFF",
        align: "center",
        fill: { color: palette[3].replace("#", "") },
        margin: 0.03,
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.65,
        y: 1.42,
        w: 5.65,
        h: 4.85,
        rectRadius: 0.08,
        fill: { color: "FFF6E8" },
        line: { color: "F0D8C0" },
      });
      addTextBox(slide, content.image_prompt || card.asset_brief, {
        x: 1.0,
        y: 1.78,
        w: 4.95,
        h: 4.0,
        fontSize: 16,
        color: palette[2].replace("#", ""),
        valign: "middle",
        align: "center",
      });
      addTextBox(slide, content.chinese || content.title || card.title, {
        x: 6.75,
        y: 1.55,
        w: 5.8,
        h: 0.9,
        fontSize: 29,
        bold: true,
        color: palette[4].replace("#", ""),
      });
      addTextBox(slide, content.pinyin || "", {
        x: 6.78,
        y: 2.55,
        w: 5.6,
        h: 0.44,
        fontSize: 16,
        color: palette[2].replace("#", ""),
      });
      addTextBox(slide, content.english || "", { x: 6.78, y: 3.08, w: 5.6, h: 0.4, fontSize: 13, color: "6F7772" });
      if (content.interaction) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 6.76,
          y: 4.1,
          w: 5.35,
          h: 0.82,
          rectRadius: 0.08,
          fill: { color: "EEF6F3" },
          line: { color: "CFE4DD" },
        });
        addTextBox(slide, String(content.interaction), {
          x: 7.0,
          y: 4.3,
          w: 4.9,
          h: 0.42,
          fontSize: 13,
          color: palette[2].replace("#", ""),
        });
      }
      if (content.teacher_notes) {
        addTextBox(slide, String(content.teacher_notes), {
          x: 6.78,
          y: 5.36,
          w: 5.55,
          h: 0.48,
          fontSize: 10,
          italic: true,
          color: "6F7772",
        });
      }
    }
    addFooter(pptx, slide, deck, card);
  }

  return pptx;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return help();
  const deckArg = args.find((arg) => arg.startsWith("--deck="));
  const outArg = args.find((arg) => arg.startsWith("--out="));
  const deckId = deckArg ? deckArg.slice("--deck=".length) : "";
  const outDir = outArg ? path.resolve(outArg.slice("--out=".length)) : path.join(skillDir, "exports");
  if (!deckId) throw new Error("--deck=<deck_id> is required");

  const baseUrl = process.env.BUSABASE_BASE_URL;
  if (!baseUrl) throw new Error("BUSABASE_BASE_URL is required");
  const client = createBusabaseClient({
    baseUrl,
    ...(process.env.BUSABASE_API_KEY ? { apiKey: process.env.BUSABASE_API_KEY } : {}),
    ...(process.env.BUSABASE_SPACE_ID ? { spaceId: process.env.BUSABASE_SPACE_ID } : {}),
  });

  const resources = await inspectProvisionedResources(client, appConfig);
  if (!resources.folder || resources.missing.length) {
    throw new Error("Kelly PPT Factory Busabase resources are not provisioned yet; run the AirApp setup first.");
  }
  const decksBase = resources.bases.find((base) => base.key === "decks");
  const slideCardsBase = resources.bases.find((base) => base.key === "slide-cards");
  const styleSystemsBase = resources.bases.find((base) => base.key === "style-systems");
  const exportsBase = resources.bases.find((base) => base.key === "exports");
  const settingsBase = resources.bases.find((base) => base.key === "settings");

  const deckRecord = await findByField(client, decksBase, "deck-id", deckId);
  if (!deckRecord) throw new Error(`No deck found for deck_id=${deckId}`);
  /** @type {Record<string, any>} */
  const deckRow = {
    ...normalizeFields(deckRecord.headCommit?.payload || deckRecord.headCommit?.fields || deckRecord.fields),
    __recordId: deckRecord.id,
    __headCommitId: deckRecord.headCommitId || deckRecord.headCommit?.id,
  };
  const deck = normalizeDeckRow(deckRow);

  if (deck.decision_action !== "approve") {
    throw new Error(
      `Deck ${deckId} does not have a genuine "approve" decision recorded. Review and approve it in the app before generating.`,
    );
  }

  const [slideRows, styleRows, settingsRows] = await Promise.all([
    readAll(client, slideCardsBase),
    readAll(client, styleSystemsBase),
    readAll(client, settingsBase),
  ]);
  const cards = slideRows
    .map(normalizeSlideRow)
    .filter((item) => item.deck_id === deck.deck_id)
    .sort((a, b) => Number(a.ref) - Number(b.ref));
  if (!cards.length) throw new Error(`Deck has no slide cards: ${deck.deck_id}`);

  const settings = settingsRows.find((row) => row.record_id === "config") || {};
  const style = styleRows.length
    ? normalizeStyleRow(styleRows.find((row) => row.style_system_id === settings.brand_style_system_id) || styleRows[0])
    : null;
  const brandName = settings.brand_name || "Kelly";

  const pptx = buildPptx({ deck, cards, brandName, style });

  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${deck.deck_id}.pptx`);
  await pptx.writeFile({ fileName: outPath });
  console.log(outPath);

  const now = new Date().toISOString();
  const renderPath = deck.render_path || `exports/rendered/${deck.deck_id}`;

  await client.records.changeRequest({
    recordId: deckRow.__recordId,
    operation: "update",
    fields: toBusabaseFields({
      ...baseDeckFields({
        ...deck,
        pptx_path: `exports/${deck.deck_id}.pptx`,
        render_path: renderPath,
        generated_slide_count: cards.length,
        status: "generated",
        updated_at: now,
      }),
    }),
    message: `Generated PPTX for deck ${deck.deck_id}`,
    author: "kelly-ppt-factory-generate-pptx",
    baseCommitId: deckRow.__headCommitId,
    autoMerge: true,
  });

  const exportRows = await readAll(client, exportsBase);
  const existingExport = exportRows.find((row) => row.deck_id === deck.deck_id);
  const exportFields = toBusabaseFields(
    baseExportFields(
      normalizeExportRow({
        export_id: existingExport?.export_id || `exp-${deck.deck_id}`,
        deck_id: deck.deck_id,
        status: "generated",
        format: "pptx",
        path: `exports/${deck.deck_id}.pptx`,
        generated_at: now,
        qa_summary: `${cards.length} slides generated. Render QA still pending.`,
      }),
    ),
  );
  if (existingExport) {
    await client.records.changeRequest({
      recordId: existingExport.__recordId,
      operation: "update",
      fields: exportFields,
      message: `Update export record for deck ${deck.deck_id}`,
      author: "kelly-ppt-factory-generate-pptx",
      baseCommitId: existingExport.__headCommitId,
      autoMerge: true,
    });
  } else {
    await client.bases.createChangeRequest({
      baseId: exportsBase.baseId,
      fields: exportFields,
      message: `Create export record for deck ${deck.deck_id}`,
      submittedBy: "kelly-ppt-factory-generate-pptx",
      autoMerge: true,
    });
  }

  console.log(
    `Deck ${deck.deck_id} generated (${cards.length} slides). Render and inspect the PPTX for overflow, crop, contrast, and style drift, then record QA checks.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
