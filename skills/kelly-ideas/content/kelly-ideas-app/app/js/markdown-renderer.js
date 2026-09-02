import { DOMPurify, Marked } from "../vendor/rich-docs.js";

const HTML_SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: [
    "script",
    "style",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "link",
    "meta",
    "template",
  ],
  FORBID_ATTR: ["style", "srcdoc"],
};

const SVG_SANITIZE_OPTIONS = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["script", "style", "foreignObject", "a", "image", "use", "animate", "set"],
  FORBID_ATTR: ["style", "href", "xlink:href"],
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const codeLanguage = (lang) =>
  String(lang || "")
    .trim()
    .split(/\s+/, 1)[0]
    .toLowerCase();

const markdown = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    code({ text, lang }) {
      const language = codeLanguage(lang);
      if (language === "mermaid") {
        return `<figure class="doc-visual doc-mermaid"><div class="mermaid">${escapeHtml(text)}</div></figure>`;
      }
      if (language === "svg") {
        const svg = DOMPurify.sanitize(text, SVG_SANITIZE_OPTIONS);
        if (/<svg\b/i.test(svg)) {
          return `<figure class="doc-visual doc-svg">${svg}</figure>`;
        }
      }
      const label = language ? `<span class="doc-code-language">${escapeHtml(language)}</span>` : "";
      return `<div class="doc-code-block">${label}<pre><code>${escapeHtml(text)}</code></pre></div>`;
    },
    image({ href, title, text }) {
      const caption = text ? `<figcaption>${escapeHtml(text)}</figcaption>` : "";
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `<figure class="doc-visual doc-image"><img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy" referrerpolicy="no-referrer"${titleAttribute}>${caption}</figure>`;
    },
  },
});

let mermaidInitialized = false;
let mermaidPromise;

function loadMermaid() {
  mermaidPromise ||= import("../vendor/mermaid.js").then((module) => module.mermaid);
  return mermaidPromise;
}

function initializeMermaid(mermaid) {
  if (mermaidInitialized) return;
  const styles = getComputedStyle(document.documentElement);
  const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    logLevel: "fatal",
    maxTextSize: 20_000,
    maxEdges: 200,
    suppressErrorRendering: true,
    fontFamily: styles.fontFamily,
    flowchart: { htmlLabels: false, useMaxWidth: true, curve: "basis" },
    themeVariables: {
      background: token("--surface", "#ffffff"),
      primaryColor: token("--accent-soft", "#eaf3ff"),
      primaryTextColor: token("--ink", "#14181f"),
      primaryBorderColor: token("--accent-line", "#b8d7ff"),
      secondaryColor: token("--surface-soft", "#f4f5f7"),
      secondaryTextColor: token("--ink", "#14181f"),
      secondaryBorderColor: token("--line-strong", "#dcdfe4"),
      tertiaryColor: token("--surface", "#ffffff"),
      tertiaryTextColor: token("--ink", "#14181f"),
      tertiaryBorderColor: token("--line", "#ebedf0"),
      lineColor: token("--muted", "#79828f"),
      textColor: token("--ink", "#14181f"),
      noteBkgColor: token("--surface-soft", "#f4f5f7"),
      noteTextColor: token("--ink", "#14181f"),
      noteBorderColor: token("--line-strong", "#dcdfe4"),
    },
  });
  mermaidInitialized = true;
}

export function renderMarkdownDocument(source) {
  try {
    const rendered = markdown.parse(String(source || ""));
    return DOMPurify.sanitize(rendered, HTML_SANITIZE_OPTIONS);
  } catch (error) {
    return `<div class="doc-render-error" role="status"><strong>Markdown could not be rendered.</strong><pre>${escapeHtml(source)}</pre></div>`;
  }
}

export async function hydrateDocumentVisuals(container) {
  const diagrams = [...container.querySelectorAll(".mermaid")];
  if (!diagrams.length) return;
  const mermaid = await loadMermaid();
  initializeMermaid(mermaid);
  for (const diagram of diagrams) {
    const source = diagram.textContent.trim();
    try {
      const valid = await mermaid.parse(source, { suppressErrors: true });
      if (!valid) throw new Error("Invalid Mermaid syntax");
      await mermaid.run({ nodes: [diagram], suppressErrors: true });
      diagram.closest(".doc-visual")?.classList.add("rendered");
    } catch {
      const fallback = document.createElement("pre");
      fallback.className = "doc-diagram-source";
      fallback.textContent = source;
      diagram.replaceChildren(fallback);
      diagram.closest(".doc-visual")?.classList.add("render-failed");
    }
  }
}
