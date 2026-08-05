// Synthetic placeholder images for screenshot/demo tooling. Pure string
// generation, no network or storage — safe to run in the browser. Ported
// verbatim (same ids, same copy, same motif SVGs) from the retired
// app/server/demo-visuals.ts's per-app VISUAL_DEFS/motif; only the Hono
// response-middleware plumbing (attachDemoVisuals/withDemoVisuals) was
// dropped, since the new architecture pushes visuals to demo-visuals.js via
// a CustomEvent instead of augmenting a JSON response.
const SKILL_NAME = "kelly-seo";
const ACCENTS = ["#0891b2", "#2563eb"];
const VISUAL_DEFS = [
  {
    id: "kelly-seo-visual-1",
    title: "SERP preview",
    caption: "Synthetic search result card with title and snippet QA.",
    kind: "document",
  },
  {
    id: "kelly-seo-visual-2",
    title: "Page screenshot",
    caption: "Mock landing page crop with optimization annotations.",
    kind: "gallery",
  },
  {
    id: "kelly-seo-visual-3",
    title: "Entity panel",
    caption: "Visual entity-readiness graph and citation coverage.",
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
  if (kind === "gallery") {
    return `<rect x="90" y="96" width="220" height="148" rx="18" fill="#f8fafc"/><rect x="122" y="126" width="156" height="76" rx="14" fill="${accent}"/><circle cx="154" cy="154" r="18" fill="#ffffff" opacity=".82"/><rect x="340" y="80" width="250" height="182" rx="20" fill="#f8fafc"/><rect x="370" y="112" width="190" height="102" rx="16" fill="${secondary}"/><rect x="620" y="102" width="220" height="142" rx="18" fill="#f8fafc"/><rect x="650" y="132" width="160" height="72" rx="14" fill="#cbd5e1"/>`;
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
