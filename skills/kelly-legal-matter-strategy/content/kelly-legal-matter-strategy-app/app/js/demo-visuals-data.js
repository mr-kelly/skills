// Synthetic placeholder images for screenshot/demo tooling. Pure string
// generation, no network or storage — safe to run in the browser. Ported
// verbatim (same ids, same copy, same motif SVGs) from the retired
// app/server/demo-visuals.ts; only the Hono response-middleware plumbing
// (attachDemoVisuals/withDemoVisuals) was dropped, since the new
// architecture pushes visuals to demo-visuals.js via a CustomEvent instead
// of augmenting a JSON response. Only the "timeline", "board", and
// "document" (default) motifs are kept — the only kinds this skill's
// VISUAL_DEFS uses.
const SKILL_NAME = "kelly-legal-matter-strategy";
const ACCENTS = ["#7c2d12", "#1d4ed8"];
const VISUAL_DEFS = [
  {
    id: "kelly-legal-matter-strategy-visual-1",
    title: "Matter timeline",
    caption: "Synthetic litigation timeline with evidence and deadlines.",
    kind: "timeline",
  },
  {
    id: "kelly-legal-matter-strategy-visual-2",
    title: "Evidence board",
    caption: "Mock facts, documents, and weak-proof flags.",
    kind: "board",
  },
  {
    id: "kelly-legal-matter-strategy-visual-3",
    title: "Strategy memo",
    caption: "Visual issue tree and next-action memo preview.",
    kind: "document",
  },
];

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  );
}

function motif(kind, accent, secondary) {
  if (kind === "timeline") {
    return `<rect x="118" y="132" width="724" height="246" rx="24" fill="#f8fafc"/><line x1="174" y1="252" x2="790" y2="252" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round"/><circle cx="204" cy="252" r="26" fill="${accent}"/><circle cx="386" cy="252" r="26" fill="${secondary}"/><circle cx="568" cy="252" r="26" fill="#94a3b8"/><circle cx="750" cy="252" r="26" fill="${accent}"/><rect x="168" y="154" width="128" height="32" rx="10" fill="#e2e8f0"/><rect x="344" y="316" width="152" height="32" rx="10" fill="#e2e8f0"/><rect x="544" y="154" width="148" height="32" rx="10" fill="#e2e8f0"/>`;
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
