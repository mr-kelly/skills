// Local image packaging for the export step. Ported verbatim from the
// retired lib/data-provider/local-file-provider.ts's packageMarkdownAssets()
// (TS types stripped). A draft's `body` Markdown may reference images next
// to the original source file on disk (see `source_draft_path` on the
// Busabase `drafts` record); this rewrites those references to a flat
// `images/` folder inside the export ZIP and reports any that could not be
// resolved, without ever reading outside the source's own project directory.
import fs from "node:fs/promises";
import path from "node:path";

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const EXPORTABLE_IMAGE_TYPES = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function packageMarkdownAssets(
  markdown,
  sourceDraftPath,
  contentRoot = process.env.KELLY_WRITER_CONTENT_ROOT || "/space/content-writer",
) {
  if (!sourceDraftPath) return { markdown, assets: [], missing: [] };

  const resolvedContentRoot = path.resolve(contentRoot);
  const source = path.resolve(sourceDraftPath);
  if (!isInside(resolvedContentRoot, source)) return { markdown, assets: [], missing: [] };
  const [projectDirectory] = path.relative(resolvedContentRoot, source).split(path.sep);
  const projectRoot = path.join(resolvedContentRoot, projectDirectory);
  const references = [...String(markdown).matchAll(MARKDOWN_IMAGE)];
  const assets = [];
  const missing = [];
  const replacements = new Map();
  const usedNames = new Set();
  const packagedTargets = new Map();

  for (const reference of references) {
    const rawTarget = reference[2];
    const imagePath = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
    if (/^(?:data:|https?:\/\/)/i.test(imagePath)) continue;

    const cleanPath = imagePath.split(/[?#]/, 1)[0];
    const target = path.resolve(path.dirname(source), cleanPath);
    const extension = path.extname(target).toLowerCase();
    if (!EXPORTABLE_IMAGE_TYPES.has(extension) || !isInside(projectRoot, target)) {
      missing.push(imagePath);
      continue;
    }

    let archivePath = packagedTargets.get(target);
    if (!archivePath) {
      const base = uniqueAssetName(path.basename(target), usedNames);
      archivePath = `images/${base}`;
      try {
        assets.push({ archivePath, data: await fs.readFile(target) });
        packagedTargets.set(target, archivePath);
      } catch {
        missing.push(imagePath);
        continue;
      }
    }
    replacements.set(rawTarget, archivePath);
  }

  const rewritten = String(markdown).replace(MARKDOWN_IMAGE, (match, alt, rawTarget) => {
    const archivePath = replacements.get(rawTarget);
    return archivePath ? `![${alt}](${archivePath})` : match;
  });
  return { markdown: rewritten, assets, missing: [...new Set(missing)] };
}

function uniqueAssetName(filename, usedNames) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = filename;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}
