// Synthetic placeholder images for screenshot/demo tooling. Pure string
// generation, no network or storage — safe to run in the browser. Ported
// from the retired app/server/demo-visuals.ts's VISUAL_DEFS/motif
// definitions (TS types stripped; the Hono response-augmenting middleware is
// dropped since the browser now calls demoVisualsForApp() directly from
// js/providers/demo-provider.js instead of an /api/state response hook).
const SKILL_NAME = "kelly-social";
const ACCENTS = ["#db2777", "#f97316"];
const VISUAL_DEFS = [
  {
    id: "kelly-social-visual-1",
    title: "Post image",
    caption: "Synthetic social creative with caption and platform crop.",
    kind: "mobile",
  },
  {
    id: "kelly-social-visual-2",
    title: "Calendar grid",
    caption: "Mock publishing calendar with media slots and status.",
    kind: "sheet",
  },
  {
    id: "kelly-social-visual-3",
    title: "Short video storyboard",
    caption: "Visual vertical-video beats and on-screen text.",
    kind: "video",
  },
];

function escapeXml(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  );
}

function motif(kind, accent, secondary) {
  if (kind === "mobile") {
    return `<rect x="368" y="74" width="264" height="392" rx="36" fill="#111827"/><rect x="388" y="112" width="224" height="310" rx="18" fill="#f8fafc"/><rect x="410" y="138" width="94" height="16" rx="8" fill="${accent}"/><rect x="410" y="174" width="168" height="46" rx="14" fill="#e2e8f0"/><rect x="456" y="240" width="122" height="46" rx="14" fill="${secondary}"/><rect x="410" y="306" width="178" height="72" rx="18" fill="#dbeafe"/><circle cx="500" cy="444" r="10" fill="#f8fafc"/>`;
  }
  if (kind === "video") {
    return `<rect x="96" y="74" width="768" height="432" rx="28" fill="#0f172a"/><rect x="134" y="112" width="692" height="310" rx="20" fill="#1e293b"/><polygon points="450,216 450,318 546,267" fill="#f8fafc"/><rect x="154" y="446" width="420" height="18" rx="9" fill="#334155"/><rect x="154" y="446" width="168" height="18" rx="9" fill="${accent}"/><rect x="604" y="442" width="86" height="26" rx="13" fill="${secondary}"/>`;
  }
  if (kind === "sheet") {
    return `<rect x="84" y="84" width="792" height="352" rx="22" fill="#f8fafc"/><rect x="84" y="84" width="792" height="54" rx="22" fill="${accent}"/><g stroke="#cbd5e1" stroke-width="3"><line x1="84" y1="190" x2="876" y2="190"/><line x1="84" y1="242" x2="876" y2="242"/><line x1="84" y1="294" x2="876" y2="294"/><line x1="84" y1="346" x2="876" y2="346"/><line x1="260" y1="138" x2="260" y2="436"/><line x1="444" y1="138" x2="444" y2="436"/><line x1="628" y1="138" x2="628" y2="436"/></g><rect x="294" y="210" width="104" height="18" rx="9" fill="${secondary}"/><rect x="662" y="314" width="128" height="18" rx="9" fill="${accent}"/>`;
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
