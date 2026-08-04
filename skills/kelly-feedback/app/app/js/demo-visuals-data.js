// Synthetic placeholder images for screenshot/demo tooling. Pure string
// generation, no network or storage — safe to run in the browser. Ported
// verbatim from the retired app/server/demo-visuals.ts's VISUAL_DEFS/motif
// definitions (same ids, captions, and SVG motifs) — only the Hono
// query/middleware plumbing (server-only) is dropped.
const SKILL_NAME = "kelly-feedback";
const ACCENTS = ["#f97316", "#2563eb"];
const VISUAL_DEFS = [
  {
    id: "kelly-feedback-visual-1",
    title: "User quote screenshot",
    caption: "Synthetic product feedback capture with source and sentiment.",
    kind: "document",
  },
  {
    id: "kelly-feedback-visual-2",
    title: "Roadmap board",
    caption: "Mock now-next-later board with review cards.",
    kind: "board",
  },
  {
    id: "kelly-feedback-visual-3",
    title: "Sentiment cluster",
    caption: "Simulated themes grouped by volume and customer tier.",
    kind: "chart",
  },
];

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  );
}

function motif(kind, accent, secondary) {
  if (kind === "chart") {
    return `<rect x="118" y="92" width="724" height="322" rx="24" fill="#f8fafc"/><path d="M170 352 C260 298 302 318 372 246 S520 188 594 226 712 280 794 156" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/><rect x="178" y="284" width="44" height="70" rx="10" fill="#cbd5e1"/><rect x="258" y="236" width="44" height="118" rx="10" fill="${secondary}"/><rect x="338" y="264" width="44" height="90" rx="10" fill="#94a3b8"/><rect x="418" y="196" width="44" height="158" rx="10" fill="${accent}"/><rect x="498" y="220" width="44" height="134" rx="10" fill="#cbd5e1"/><rect x="578" y="162" width="44" height="192" rx="10" fill="${secondary}"/>`;
  }
  if (kind === "board") {
    return `<rect x="92" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="122" y="116" width="170" height="46" rx="12" fill="${accent}"/><rect x="122" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="122" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="365" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="395" y="116" width="170" height="46" rx="12" fill="${secondary}"/><rect x="395" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="395" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="638" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="668" y="116" width="170" height="46" rx="12" fill="#64748b"/><rect x="668" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="668" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/>`;
  }
  return `<rect x="238" y="64" width="484" height="400" rx="22" fill="#f8fafc"/><rect x="292" y="126" width="256" height="30" rx="12" fill="${accent}"/><rect x="292" y="206" width="360" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="252" width="316" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="298" width="338" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="368" width="188" height="34" rx="12" fill="${secondary}"/>`;
}

function visualSvg(title, caption, kind, index) {
  const accent = ACCENTS[index % ACCENTS.length] || "#2563eb";
  const secondary = ACCENTS[(index + 1) % ACCENTS.length] || "#0f766e";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${escapeXml(title)}">
  <rect width="960" height="540" rx="0" fill="#eef2f7"/>
  <rect x="34" y="34" width="892" height="472" rx="34" fill="#ffffff"/>
  ${motif(kind, accent, secondary)}
  <text x="72" y="490" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
  <text x="72" y="522" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" fill="#475569">${escapeXml(caption)}</text>
</svg>`;
}

function imageDataUrl(title, caption, kind, index) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visualSvg(title, caption, kind, index))}`;
}

export function demoVisualsForApp(appName = SKILL_NAME) {
  return VISUAL_DEFS.map((item, index) => {
    const src = imageDataUrl(item.title, item.caption, item.kind, index);
    return {
      id: item.id,
      title: item.title,
      caption: item.caption,
      kind: item.kind,
      alt: `${appName || SKILL_NAME} demo visual: ${item.title}`,
      src,
      image: src,
      image_url: src,
      simulated: true,
    };
  });
}
