import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { packageMarkdownAssets, readableMainBody } from "../lib/data-provider/local-file-provider.ts";
import { createZip } from "../lib/zip.ts";

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

test("distribution source prefers Markdown and strips HTML as a fallback", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kelly-writer-draft-"));
  const draftPath = path.join(root, "draft.md");
  await fs.writeFile(draftPath, "# Readable draft\n\nBody text.\n");

  assert.equal(
    await readableMainBody({
      body: '<article><img src="data:image/png;base64,abc"><p>HTML body</p></article>',
      draft_path: draftPath,
    }),
    "# Readable draft\n\nBody text.",
  );
  assert.equal(
    await readableMainBody({
      html: '<article><img src="data:image/png;base64,abc"><p>HTML body</p><ul><li>One</li></ul></article>',
    }),
    "HTML body\n- One",
  );
});

function readZipEntries(archive: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
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
