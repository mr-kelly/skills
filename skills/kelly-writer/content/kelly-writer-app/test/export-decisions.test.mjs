// Ported from the retired tests/distribution-export.test.ts: same worked
// example (a Markdown file referencing a local cover image, a missing
// image, an image outside the project root, and a remote image), asserting
// the exact same zip-export contract now implemented by
// scripts/lib/content-assets.mjs and scripts/lib/zip.mjs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { packageMarkdownAssets } from "../../../scripts/lib/content-assets.mjs";
import { createZip } from "../../../scripts/lib/zip.mjs";

test("distribution export packages local images and rewrites Markdown paths", async () => {
  const contentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kelly-writer-content-"));
  const projectRoot = path.join(contentRoot, "article-project");
  const draftDir = path.join(projectRoot, "wechat");
  const imageDir = path.join(projectRoot, "assets", "images");
  const sourcePath = path.join(draftDir, "article.md");
  await fs.mkdir(draftDir, { recursive: true });
  await fs.mkdir(imageDir, { recursive: true });
  await fs.writeFile(sourcePath, "# Source\n");
  await fs.writeFile(path.join(imageDir, "cover.png"), Buffer.from("local-image"));
  await fs.writeFile(path.join(contentRoot, "outside.png"), Buffer.from("private-image"));

  const markdown = [
    "# Article",
    "",
    "![Cover](../assets/images/cover.png)",
    "![Missing](../assets/images/missing.png)",
    "![Outside](../../outside.png)",
    "![Remote](https://example.com/remote.png)",
    "",
  ].join("\n");
  const packaged = await packageMarkdownAssets(markdown, sourcePath, contentRoot);

  assert.match(packaged.markdown, /!\[Cover\]\(images\/cover\.png\)/);
  assert.match(packaged.markdown, /https:\/\/example\.com\/remote\.png/);
  assert.deepEqual(
    packaged.assets.map((asset) => asset.archivePath),
    ["images/cover.png"],
  );
  assert.deepEqual(packaged.missing.sort(), ["../../outside.png", "../assets/images/missing.png"].sort());

  const archive = createZip([
    { name: "article.md", data: packaged.markdown },
    ...packaged.assets.map((asset) => ({ name: asset.archivePath, data: asset.data })),
  ]);
  const entries = readZipEntries(archive);
  assert.equal(entries.get("article.md")?.toString("utf8"), packaged.markdown);
  assert.equal(entries.get("images/cover.png")?.toString("utf8"), "local-image");
  assert.equal(entries.has("outside.png"), false);
});

test("packageMarkdownAssets is a no-op without a source draft path", async () => {
  const markdown = "# Article\n\n![Cover](./cover.png)\n";
  const packaged = await packageMarkdownAssets(markdown, "");
  assert.equal(packaged.markdown, markdown);
  assert.deepEqual(packaged.assets, []);
  assert.deepEqual(packaged.missing, []);
});

function readZipEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    assert.equal(method, 8);
    entries.set(name, inflateRawSync(compressed));
    offset = dataStart + compressedSize;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  return entries;
}
