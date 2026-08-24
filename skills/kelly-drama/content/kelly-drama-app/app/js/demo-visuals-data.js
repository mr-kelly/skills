// Synthetic placeholder images for screenshot/demo tooling. Pure string
// generation, no network or storage — safe to run in the browser. Ported
// verbatim from the retired app/server/demo-visuals.ts's VISUAL_DEFS/motif
// definitions (same ids, captions, and SVG motifs) — only the Hono
// query/middleware plumbing (server-only, no longer needed since demo mode
// never hits a server for /api/state at all — see js/providers/demo-provider.js)
// is dropped, same as every other converted skill.
const SKILL_NAME = "kelly-drama";
const ACCENTS = ["#be123c", "#7c2d12"];
const VISUAL_DEFS = [
  {
    id: "kelly-drama-visual-1",
    title: "Character reference",
    caption: "Synthetic cast reference card for visual consistency review.",
    kind: "profile",
  },
  {
    id: "kelly-drama-visual-2",
    title: "Storyboard frame",
    caption: "Mock vertical-drama frame with camera and action notes.",
    kind: "video",
  },
  {
    id: "kelly-drama-visual-3",
    title: "Relationship map",
    caption: "Visual power map for family, rival, and secret arcs.",
    kind: "board",
  },
];

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  );
}

function motif(kind, accent, secondary) {
  if (kind === "board") {
    return `<rect x="92" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="122" y="116" width="170" height="46" rx="12" fill="${accent}"/><rect x="122" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="122" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="365" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="395" y="116" width="170" height="46" rx="12" fill="${secondary}"/><rect x="395" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="395" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="638" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="668" y="116" width="170" height="46" rx="12" fill="#64748b"/><rect x="668" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="668" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/>`;
  }
  if (kind === "video") {
    return `<rect x="96" y="74" width="768" height="432" rx="28" fill="#0f172a"/><rect x="134" y="112" width="692" height="310" rx="20" fill="#1e293b"/><polygon points="450,216 450,318 546,267" fill="#f8fafc"/><rect x="154" y="446" width="420" height="18" rx="9" fill="#334155"/><rect x="154" y="446" width="168" height="18" rx="9" fill="${accent}"/><rect x="604" y="442" width="86" height="26" rx="13" fill="${secondary}"/>`;
  }
  if (kind === "profile") {
    return `<rect x="142" y="82" width="300" height="348" rx="26" fill="#f8fafc"/><circle cx="292" cy="188" r="72" fill="${accent}"/><rect x="204" y="292" width="176" height="24" rx="12" fill="#cbd5e1"/><rect x="224" y="332" width="136" height="18" rx="9" fill="#e2e8f0"/><rect x="500" y="108" width="314" height="52" rx="16" fill="${secondary}"/><rect x="500" y="194" width="314" height="34" rx="12" fill="#e2e8f0"/><rect x="500" y="252" width="250" height="34" rx="12" fill="#e2e8f0"/><rect x="500" y="310" width="286" height="34" rx="12" fill="#e2e8f0"/>`;
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
