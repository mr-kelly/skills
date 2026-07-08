type DemoVisual = {
  id: string;
  title: string;
  caption: string;
  kind: string;
  alt: string;
  src: string;
  image: string;
  image_url: string;
  simulated: true;
};

const SKILL_NAME = "kelly-family-office";
const ACCENTS = ["#0f766e", "#7c3aed"];
const VISUAL_DEFS = [
  {
    id: "kelly-family-office-visual-1",
    title: "Asset allocation",
    caption: "Synthetic multi-entity allocation and liquidity view.",
    kind: "chart",
  },
  {
    id: "kelly-family-office-visual-2",
    title: "Institution statement",
    caption: "Mock bank/custody statement excerpt for reconciliation.",
    kind: "document",
  },
  {
    id: "kelly-family-office-visual-3",
    title: "Entity chart",
    caption: "Visual ownership map across family entities and accounts.",
    kind: "board",
  },
];

function queryValue(query: unknown, key: string): string {
  if (query instanceof URLSearchParams) return query.get(key) || "";
  const value = (query as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch,
  );
}

function motif(kind: string, accent: string, secondary: string): string {
  if (kind === "mobile") {
    return `<rect x="368" y="74" width="264" height="392" rx="36" fill="#111827"/><rect x="388" y="112" width="224" height="310" rx="18" fill="#f8fafc"/><rect x="410" y="138" width="94" height="16" rx="8" fill="${accent}"/><rect x="410" y="174" width="168" height="46" rx="14" fill="#e2e8f0"/><rect x="456" y="240" width="122" height="46" rx="14" fill="${secondary}"/><rect x="410" y="306" width="178" height="72" rx="18" fill="#dbeafe"/><circle cx="500" cy="444" r="10" fill="#f8fafc"/>`;
  }
  if (kind === "gallery") {
    return `<rect x="90" y="96" width="220" height="148" rx="18" fill="#f8fafc"/><rect x="122" y="126" width="156" height="76" rx="14" fill="${accent}"/><circle cx="154" cy="154" r="18" fill="#ffffff" opacity=".82"/><rect x="340" y="80" width="250" height="182" rx="20" fill="#f8fafc"/><rect x="370" y="112" width="190" height="102" rx="16" fill="${secondary}"/><rect x="620" y="102" width="220" height="142" rx="18" fill="#f8fafc"/><rect x="650" y="132" width="160" height="72" rx="14" fill="#cbd5e1"/>`;
  }
  if (kind === "chart") {
    return `<rect x="118" y="92" width="724" height="322" rx="24" fill="#f8fafc"/><path d="M170 352 C260 298 302 318 372 246 S520 188 594 226 712 280 794 156" fill="none" stroke="${accent}" stroke-width="16" stroke-linecap="round"/><rect x="178" y="284" width="44" height="70" rx="10" fill="#cbd5e1"/><rect x="258" y="236" width="44" height="118" rx="10" fill="${secondary}"/><rect x="338" y="264" width="44" height="90" rx="10" fill="#94a3b8"/><rect x="418" y="196" width="44" height="158" rx="10" fill="${accent}"/><rect x="498" y="220" width="44" height="134" rx="10" fill="#cbd5e1"/><rect x="578" y="162" width="44" height="192" rx="10" fill="${secondary}"/>`;
  }
  if (kind === "timeline") {
    return `<rect x="118" y="132" width="724" height="246" rx="24" fill="#f8fafc"/><line x1="174" y1="252" x2="790" y2="252" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round"/><circle cx="204" cy="252" r="26" fill="${accent}"/><circle cx="386" cy="252" r="26" fill="${secondary}"/><circle cx="568" cy="252" r="26" fill="#94a3b8"/><circle cx="750" cy="252" r="26" fill="${accent}"/><rect x="168" y="154" width="128" height="32" rx="10" fill="#e2e8f0"/><rect x="344" y="316" width="152" height="32" rx="10" fill="#e2e8f0"/><rect x="544" y="154" width="148" height="32" rx="10" fill="#e2e8f0"/>`;
  }
  if (kind === "board") {
    return `<rect x="92" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="122" y="116" width="170" height="46" rx="12" fill="${accent}"/><rect x="122" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="122" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="365" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="395" y="116" width="170" height="46" rx="12" fill="${secondary}"/><rect x="395" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="395" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="638" y="76" width="230" height="360" rx="22" fill="#f8fafc"/><rect x="668" y="116" width="170" height="46" rx="12" fill="#64748b"/><rect x="668" y="186" width="170" height="72" rx="14" fill="#e2e8f0"/><rect x="668" y="282" width="170" height="72" rx="14" fill="#e2e8f0"/>`;
  }
  if (kind === "video") {
    return `<rect x="96" y="74" width="768" height="432" rx="28" fill="#0f172a"/><rect x="134" y="112" width="692" height="310" rx="20" fill="#1e293b"/><polygon points="450,216 450,318 546,267" fill="#f8fafc"/><rect x="154" y="446" width="420" height="18" rx="9" fill="#334155"/><rect x="154" y="446" width="168" height="18" rx="9" fill="${accent}"/><rect x="604" y="442" width="86" height="26" rx="13" fill="${secondary}"/>`;
  }
  if (kind === "profile") {
    return `<rect x="142" y="82" width="300" height="348" rx="26" fill="#f8fafc"/><circle cx="292" cy="188" r="72" fill="${accent}"/><rect x="204" y="292" width="176" height="24" rx="12" fill="#cbd5e1"/><rect x="224" y="332" width="136" height="18" rx="9" fill="#e2e8f0"/><rect x="500" y="108" width="314" height="52" rx="16" fill="${secondary}"/><rect x="500" y="194" width="314" height="34" rx="12" fill="#e2e8f0"/><rect x="500" y="252" width="250" height="34" rx="12" fill="#e2e8f0"/><rect x="500" y="310" width="286" height="34" rx="12" fill="#e2e8f0"/>`;
  }
  if (kind === "receipt") {
    return `<rect x="258" y="56" width="444" height="420" rx="18" fill="#f8fafc"/><path d="M258 56 h444 v420 l-34 -18 -34 18 -34 -18 -34 18 -34 -18 -34 18 -34 -18 -34 18 -34 -18 -34 18 -34 -18 -34 18 -34 -18 -34 18z" fill="#f8fafc"/><rect x="314" y="116" width="220" height="28" rx="10" fill="${accent}"/><rect x="314" y="184" width="330" height="18" rx="9" fill="#cbd5e1"/><rect x="314" y="228" width="298" height="18" rx="9" fill="#cbd5e1"/><rect x="314" y="272" width="330" height="18" rx="9" fill="#cbd5e1"/><rect x="314" y="348" width="170" height="34" rx="12" fill="${secondary}"/>`;
  }
  if (kind === "sheet") {
    return `<rect x="84" y="84" width="792" height="352" rx="22" fill="#f8fafc"/><rect x="84" y="84" width="792" height="54" rx="22" fill="${accent}"/><g stroke="#cbd5e1" stroke-width="3"><line x1="84" y1="190" x2="876" y2="190"/><line x1="84" y1="242" x2="876" y2="242"/><line x1="84" y1="294" x2="876" y2="294"/><line x1="84" y1="346" x2="876" y2="346"/><line x1="260" y1="138" x2="260" y2="436"/><line x1="444" y1="138" x2="444" y2="436"/><line x1="628" y1="138" x2="628" y2="436"/></g><rect x="294" y="210" width="104" height="18" rx="9" fill="${secondary}"/><rect x="662" y="314" width="128" height="18" rx="9" fill="${accent}"/>`;
  }
  if (kind === "dashboard") {
    return `<rect x="82" y="80" width="796" height="358" rx="24" fill="#f8fafc"/><rect x="122" y="120" width="210" height="112" rx="18" fill="#e2e8f0"/><rect x="374" y="120" width="210" height="112" rx="18" fill="${accent}"/><rect x="626" y="120" width="210" height="112" rx="18" fill="#e2e8f0"/><rect x="122" y="278" width="330" height="108" rx="18" fill="#e2e8f0"/><rect x="494" y="278" width="342" height="108" rx="18" fill="${secondary}"/><circle cx="226" cy="176" r="30" fill="#f8fafc"/><rect x="530" y="312" width="220" height="18" rx="9" fill="#f8fafc"/>`;
  }
  return `<rect x="238" y="64" width="484" height="400" rx="22" fill="#f8fafc"/><rect x="292" y="126" width="256" height="30" rx="12" fill="${accent}"/><rect x="292" y="206" width="360" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="252" width="316" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="298" width="338" height="18" rx="9" fill="#cbd5e1"/><rect x="292" y="368" width="188" height="34" rx="12" fill="${secondary}"/>`;
}

function visualSvg(title: string, caption: string, kind: string, index: number): string {
  const accent = ACCENTS[index % ACCENTS.length] || "#2563eb";
  const secondary = ACCENTS[(index + 1) % ACCENTS.length] || "#0f766e";
  const safeTitle = escapeXml(title);
  const safeCaption = escapeXml(caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${safeTitle}">
  <rect width="960" height="540" rx="0" fill="#eef2f7"/>
  <rect x="34" y="34" width="892" height="472" rx="34" fill="#ffffff"/>
  ${motif(kind, accent, secondary)}
  <text x="72" y="490" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="700" fill="#0f172a">${safeTitle}</text>
  <text x="72" y="522" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" fill="#475569">${safeCaption}</text>
</svg>`;
}

function imageDataUrl(title: string, caption: string, kind: string, index: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visualSvg(title, caption, kind, index))}`;
}

export function demoVisualsForApp(appName = SKILL_NAME, query: unknown = {}): DemoVisual[] {
  const lang = queryValue(query, "lang").toLowerCase();
  const displayApp = appName || SKILL_NAME;
  return VISUAL_DEFS.map((item, index) => {
    const src = imageDataUrl(item.title, item.caption, item.kind, index);
    return {
      id: item.id,
      title: item.title,
      caption: item.caption,
      kind: item.kind,
      alt: `${displayApp} demo visual: ${item.title}`,
      src,
      image: src,
      image_url: src,
      simulated: true,
    };
  });
}

function appNameFrom(payload: Record<string, unknown>): string {
  const snapshot = isRecord(payload.snapshot) ? payload.snapshot : {};
  return String(payload.app || snapshot.app || SKILL_NAME);
}

function looksLikeDemoPayload(payload: Record<string, unknown>): boolean {
  const snapshot = isRecord(payload.snapshot) ? payload.snapshot : {};
  const batch = isRecord(payload.batch) ? payload.batch : {};
  return (
    payload.demo === true ||
    payload.data_provider === "demo" ||
    String(payload.demo_scenario || "") !== "" ||
    String(snapshot.source || "").includes("demo") ||
    String(batch.batch_id || "").includes("demo") ||
    String(batch.extractor && isRecord(batch.extractor) ? batch.extractor.name : "").includes("demo")
  );
}

function wantsDemoVisuals(query: unknown, payload: Record<string, unknown>): boolean {
  return Boolean(queryValue(query, "demo") || queryValue(query, "demo_visuals") || looksLikeDemoPayload(payload));
}

function attachToNested(payload: Record<string, unknown>, visuals: DemoVisual[]): void {
  payload.demo_visuals = visuals;
  for (const key of ["snapshot", "project", "batch"]) {
    const target = payload[key];
    if (isRecord(target)) target.demo_visuals = visuals;
  }
}

export function withDemoVisuals(payload: unknown, query: unknown = {}): unknown {
  if (!isRecord(payload) || !wantsDemoVisuals(query, payload)) return payload;
  const visuals = demoVisualsForApp(appNameFrom(payload), query);
  attachToNested(payload, visuals);
  return payload;
}

function requestQuery(c: any): Record<string, string | string[]> {
  try {
    if (typeof c.req?.query === "function") return c.req.query();
  } catch {}
  try {
    return Object.fromEntries(new URL(c.req.url).searchParams.entries());
  } catch {
    return {};
  }
}

export async function attachDemoVisuals(c: any, next: () => Promise<void>): Promise<void> {
  await next();
  const response = c.res;
  const contentType = response?.headers?.get("content-type") || "";
  if (!contentType.includes("application/json")) return;
  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }
  const query = requestQuery(c);
  const augmented = withDemoVisuals(payload, query);
  if (augmented === payload && (!isRecord(payload) || !wantsDemoVisuals(query, payload))) return;
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  c.res = new Response(JSON.stringify(augmented), { status: response.status, headers });
}
