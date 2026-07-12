#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pptxgen from "pptxgenjs";
import { createProvider } from "../lib/data-provider/index.ts";
import { EXPORTS_DIR } from "../lib/paths.ts";
import type { SlideCard, SlideContent } from "../lib/types.ts";

const deckArg = process.argv.find((arg) => arg.startsWith("--deck="));
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const deckId = deckArg ? deckArg.slice("--deck=".length) : "";
const outDir = outArg ? outArg.slice("--out=".length) : EXPORTS_DIR;

const provider = await createProvider();
const snapshot = await provider.readSnapshot();
const deck = deckId ? snapshot.decks.find((item) => item.deck_id === deckId) : snapshot.decks[0];
if (!deck) throw new Error("No deck found. Run scripts/generate_demo_snapshot.ts or ingest content first.");

const slides = snapshot.slide_cards.filter((item) => item.deck_id === deck.deck_id).sort((a, b) => a.ref - b.ref);
if (!slides.length) throw new Error(`Deck has no slide cards: ${deck.deck_id}`);

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "kelly-ppt-factory";
pptx.subject = deck.theme;
pptx.title = deck.title;
pptx.company = snapshot.brand_profiles[0]?.name || "Kelly";
pptx.theme = {
  headFontFace: "Arial Rounded MT Bold",
  bodyFontFace: "Aptos",
};

const style = snapshot.style_systems[0];
const palette = style?.palette || ["#F7A66A", "#FFF6E8", "#2F4F46", "#5A9D8C", "#C94F4F"];

function addTextBox(slide: pptxgen.Slide, text: string, options: pptxgen.TextPropsOptions): void {
  slide.addText(text || " ", { margin: 0.06, fit: "shrink", breakLine: false, ...options });
}

function addFooter(slide: pptxgen.Slide, card: SlideCard): void {
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

for (const card of slides) {
  const slide = pptx.addSlide();
  const content: SlideContent = card.content || {};
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
  addFooter(slide, card);
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${deck.deck_id}.pptx`);
await pptx.writeFile({ fileName: outPath });
console.log(outPath);
