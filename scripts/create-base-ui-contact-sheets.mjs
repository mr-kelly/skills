import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const beforeRoot = path.join(root, ".tmp", "base-ui-before");
const afterRoot = path.join(root, ".tmp", "base-ui-matrix");
const outputRoot = path.join(root, ".tmp", "base-ui-contact-sheets");
const skillNames = fs
  .readdirSync(beforeRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

fs.mkdirSync(outputRoot, { recursive: true });
const manifest = [];

for (const skill of skillNames) {
  const evidencePaths = {
    beforeDesktop: path.join(beforeRoot, skill, "light-desktop.png"),
    afterDesktop: path.join(afterRoot, skill, "light-desktop.png"),
    darkDesktop: path.join(afterRoot, skill, "dark-desktop.png"),
    beforePhone: path.join(beforeRoot, skill, "light-phone.png"),
    afterPhone: path.join(afterRoot, skill, "light-phone.png"),
    darkPhone: path.join(afterRoot, skill, "dark-phone.png"),
  };
  for (const evidencePath of Object.values(evidencePaths)) {
    if (!fs.existsSync(evidencePath)) throw new Error(`Missing visual evidence for ${skill}: ${evidencePath}`);
  }
  const [beforeDesktop, afterDesktop, darkDesktop, beforePhone, afterPhone, darkPhone] = await Promise.all([
    sharp(evidencePaths.beforeDesktop).resize(480, 300, { fit: "fill" }).png().toBuffer(),
    sharp(evidencePaths.afterDesktop).resize(480, 300, { fit: "fill" }).png().toBuffer(),
    sharp(evidencePaths.darkDesktop).resize(480, 300, { fit: "fill" }).png().toBuffer(),
    sharp(evidencePaths.beforePhone).resize({ height: 360 }).png().toBuffer({ resolveWithObject: true }),
    sharp(evidencePaths.afterPhone).resize({ height: 360 }).png().toBuffer({ resolveWithObject: true }),
    sharp(evidencePaths.darkPhone).resize({ height: 360 }).png().toBuffer({ resolveWithObject: true }),
  ]);
  const outputPath = path.join(outputRoot, `${skill}.png`);
  const phoneLeft = (column, image) => column * 480 + Math.floor((480 - image.info.width) / 2);
  await sharp({ create: { width: 1440, height: 660, channels: 4, background: "#e5e7eb" } })
    .composite([
      { input: beforeDesktop, left: 0, top: 0 },
      { input: afterDesktop, left: 480, top: 0 },
      { input: darkDesktop, left: 960, top: 0 },
      { input: beforePhone.data, left: phoneLeft(0, beforePhone), top: 300 },
      { input: afterPhone.data, left: phoneLeft(1, afterPhone), top: 300 },
      { input: darkPhone.data, left: phoneLeft(2, darkPhone), top: 300 },
    ])
    .png()
    .toFile(outputPath);
  manifest.push({ skill, evidence: evidencePaths, contactSheet: outputPath });
}

fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${manifest.length} before/after contact sheets in ${outputRoot}.`);
