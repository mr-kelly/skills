#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets", "product-images");

const products = [
  {
    file: "aurora-lamp.png",
    title: "Aurora Lamp",
    subtitle: "USB-C gradient desk light",
    bg: ["#f4fbf8", "#d7eee7"],
    colors: ["#d7fff7", "#b7c8ff", "#ffb9c5"],
    shape: "lamp",
  },
  {
    file: "aurora-lamp-lifestyle.png",
    title: "Desk Scene",
    subtitle: "warm-to-cool dimming",
    bg: ["#f6f1ea", "#ddebe4"],
    colors: ["#f4d39c", "#b7d8ff", "#fcf8f0"],
    shape: "desk",
  },
  {
    file: "aurora-lamp-packaging.png",
    title: "Retail Box",
    subtitle: "launch pack",
    bg: ["#edf7f5", "#f8f3e8"],
    colors: ["#ffffff", "#0f766e", "#9ec7bd"],
    shape: "box",
  },
  {
    file: "lunchbox.png",
    title: "Lunch Box",
    subtitle: "collapsible silicone",
    bg: ["#f7faf4", "#e2eadc"],
    colors: ["#8fb7a2", "#e27557", "#fff4dc"],
    shape: "lunchbox",
  },
  {
    file: "lunchbox-lifestyle.png",
    title: "Lunch Kit",
    subtitle: "commuter set",
    bg: ["#faf6ee", "#eaf1e2"],
    colors: ["#8fb7a2", "#f4c97e", "#ffffff"],
    shape: "meal",
  },
  {
    file: "spice-rack.png",
    title: "Spice Rack",
    subtitle: "magnetic organizer",
    bg: ["#f8f7f2", "#e5e2d8"],
    colors: ["#b8c0b5", "#4f5b54", "#d9a441"],
    shape: "rack",
  },
  {
    file: "spice-rack-detail.png",
    title: "Magnet Detail",
    subtitle: "test evidence needed",
    bg: ["#f2f5f3", "#e3e7e2"],
    colors: ["#a7afa8", "#2f3c36", "#f1d18a"],
    shape: "detail",
  },
  {
    file: "laundry-basket.png",
    title: "Laundry Basket",
    subtitle: "fold-flat bamboo handle",
    bg: ["#f7f8f5", "#e3eadf"],
    colors: ["#d8ded3", "#caa86c", "#ffffff"],
    shape: "basket",
  },
  {
    file: "laundry-basket-room.png",
    title: "Small Apartment",
    subtitle: "slim storage",
    bg: ["#f4f1ea", "#dce7df"],
    colors: ["#d8ded3", "#caa86c", "#96a591"],
    shape: "room",
  },
  {
    file: "kitchen-scale.png",
    title: "Kitchen Scale",
    subtitle: "clearance SKU",
    bg: ["#f5f7f7", "#e2e7e8"],
    colors: ["#ffffff", "#6b7280", "#0f766e"],
    shape: "scale",
  },
];

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function base({ bg, title, subtitle, colors, shape }) {
  const [a, b] = bg;
  const [c1, c2, c3] = colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#1f2924" flood-opacity=".18"/></filter>
  </defs>
  <rect width="1200" height="900" fill="url(#bg)"/>
  <rect x="0" y="650" width="1200" height="250" fill="#ffffff" opacity=".32"/>
  <rect x="140" y="690" width="920" height="64" rx="18" fill="#1f2924" opacity=".08"/>
  <rect x="160" y="712" width="880" height="8" rx="4" fill="#ffffff" opacity=".45"/>
  ${shapeSvg(shape, c1, c2, c3)}
  <g font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
    <rect x="78" y="72" width="330" height="112" rx="22" fill="#ffffff" opacity=".78"/>
    <text x="108" y="126" font-size="36" font-weight="800" fill="#1d2521">${esc(title)}</text>
    <text x="108" y="160" font-size="22" font-weight="560" fill="#68736d">${esc(subtitle)}</text>
  </g>
</svg>`;
}

function shapeSvg(shape, c1, c2, c3) {
  if (shape === "lamp") {
    return `<g filter="url(#shadow)">
      <path d="M575 285c120-20 218 52 243 160H432c18-83 70-143 143-160z" fill="url(#g1)"/>
      <rect x="585" y="438" width="80" height="210" rx="36" fill="#26332e"/>
      <rect x="500" y="626" width="250" height="52" rx="26" fill="#1f2924"/>
      <path d="M468 438h310v34c0 38-31 68-68 68H536c-38 0-68-31-68-68z" fill="#f8fffb"/>
    </g>`;
  }
  if (shape === "desk") {
    return `<g filter="url(#shadow)">
      <rect x="370" y="610" width="480" height="46" rx="23" fill="#8a6f4d"/>
      <rect x="540" y="350" width="62" height="260" rx="30" fill="#26332e"/>
      <ellipse cx="572" cy="338" rx="166" ry="86" fill="url(#g1)"/>
      <rect x="680" y="520" width="134" height="82" rx="18" fill="#ffffff"/>
      <rect x="410" y="540" width="90" height="66" rx="12" fill="${c3}"/>
    </g>`;
  }
  if (shape === "box") {
    return `<g filter="url(#shadow)">
      <path d="M424 274h314l116 94v292H424z" fill="#ffffff"/>
      <path d="M424 274l116 94h314l-116-94z" fill="${c3}"/>
      <path d="M540 368v292h314V368z" fill="#eef6f2"/>
      <rect x="586" y="454" width="224" height="82" rx="16" fill="${c2}"/>
      <text x="617" y="506" font-family="Arial" font-size="34" font-weight="800" fill="#fff">AURORA</text>
    </g>`;
  }
  if (shape === "lunchbox") {
    return `<g filter="url(#shadow)">
      <rect x="360" y="368" width="480" height="250" rx="62" fill="url(#g1)"/>
      <rect x="332" y="330" width="536" height="80" rx="40" fill="#fff6e6"/>
      <rect x="420" y="446" width="360" height="42" rx="21" fill="#ffffff" opacity=".65"/>
      <circle cx="455" cy="370" r="20" fill="${c2}"/>
      <circle cx="744" cy="370" r="20" fill="${c2}"/>
    </g>`;
  }
  if (shape === "meal") {
    return `<g filter="url(#shadow)">
      <rect x="330" y="382" width="440" height="220" rx="54" fill="${c1}"/>
      <rect x="350" y="350" width="400" height="76" rx="38" fill="#fff"/>
      <circle cx="835" cy="492" r="78" fill="${c2}"/>
      <rect x="730" y="606" width="160" height="22" rx="11" fill="#c4a26a"/>
      <circle cx="468" cy="490" r="42" fill="#f4c97e"/>
      <circle cx="560" cy="488" r="34" fill="#ffffff"/>
      <circle cx="630" cy="490" r="42" fill="#e27557"/>
    </g>`;
  }
  if (shape === "rack") {
    return `<g filter="url(#shadow)">
      <rect x="390" y="270" width="420" height="420" rx="32" fill="${c2}"/>
      ${[330, 420, 510, 600].map((y) => `<rect x="420" y="${y}" width="360" height="46" rx="12" fill="${c1}"/>`).join("")}
      ${[450, 540, 630].map((x) => `<circle cx="${x}" cy="352" r="28" fill="${c3}"/><circle cx="${x + 88}" cy="442" r="28" fill="${c3}"/><circle cx="${x + 38}" cy="532" r="28" fill="${c3}"/>`).join("")}
    </g>`;
  }
  if (shape === "detail") {
    return `<g filter="url(#shadow)">
      <rect x="330" y="360" width="540" height="150" rx="28" fill="${c1}"/>
      <rect x="380" y="396" width="440" height="78" rx="18" fill="#ffffff"/>
      <circle cx="475" cy="435" r="36" fill="${c2}"/>
      <circle cx="600" cy="435" r="36" fill="${c2}"/>
      <circle cx="725" cy="435" r="36" fill="${c2}"/>
      <path d="M470 575h260" stroke="${c3}" stroke-width="18" stroke-linecap="round"/>
      <path d="M470 575l48-40m-48 40l48 40M730 575l-48-40m48 40l-48 40" stroke="${c3}" stroke-width="18" stroke-linecap="round"/>
    </g>`;
  }
  if (shape === "basket") {
    return `<g filter="url(#shadow)">
      <path d="M380 350h440l-44 280H424z" fill="${c1}"/>
      <path d="M426 318c38-78 310-78 348 0" fill="none" stroke="${c2}" stroke-width="34" stroke-linecap="round"/>
      ${[440, 500, 560, 620, 680, 740].map((x) => `<path d="M${x} 382l-20 214" stroke="#fff" stroke-width="14" opacity=".62"/>`).join("")}
      <rect x="356" y="342" width="488" height="54" rx="27" fill="#ffffff"/>
    </g>`;
  }
  if (shape === "room") {
    return `<g filter="url(#shadow)">
      <rect x="310" y="610" width="560" height="36" rx="18" fill="#cbb89a"/>
      <path d="M438 362h338l-34 240H472z" fill="${c1}"/>
      <path d="M470 340c35-70 270-70 306 0" fill="none" stroke="${c2}" stroke-width="28" stroke-linecap="round"/>
      <rect x="785" y="390" width="82" height="190" rx="20" fill="${c3}"/>
      <rect x="340" y="428" width="74" height="150" rx="18" fill="#ffffff"/>
    </g>`;
  }
  return `<g filter="url(#shadow)">
    <rect x="350" y="396" width="500" height="156" rx="34" fill="${c1}"/>
    <rect x="430" y="340" width="340" height="120" rx="28" fill="#ffffff"/>
    <rect x="495" y="380" width="210" height="54" rx="12" fill="${c2}"/>
    <text x="556" y="418" font-family="Arial" font-size="34" font-weight="800" fill="#fff">0.0</text>
    <circle cx="426" cy="476" r="24" fill="${c3}"/>
    <circle cx="774" cy="476" r="24" fill="${c3}"/>
  </g>`;
}

await fs.mkdir(OUT, { recursive: true });
for (const product of products) {
  const svg = base(product);
  const out = path.join(OUT, product.file);
  await sharp(Buffer.from(svg)).png({ quality: 95 }).toFile(out);
  console.log(out);
}
