import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const skillsDir = path.join(root, "skills");
const cssTemplate = fs.readFileSync(path.join(root, "scripts", "accent-theme.css"), "utf8");
const jsTemplate = fs.readFileSync(path.join(root, "scripts", "accent-theme.js"), "utf8");

function kellySkillDirs() {
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("kelly-"))
    .map((entry) => path.join(skillsDir, entry.name))
    .sort();
}

function ensureLinked(html) {
  let next = html;
  if (!next.includes("accent-theme.css")) {
    next = next.replace(
      /(<link\s+rel=["']stylesheet["'][^>]*styles\.css[^>]*>\s*)/i,
      '$1    <link rel="stylesheet" href="./accent-theme.css">\n',
    );
  }
  if (!next.includes("accent-theme.js")) {
    next = next.replace(
      /(<script\s+type=["']module["']\s+src=["'][^"']*app\.js["']><\/script>\s*)/i,
      '$1    <script type="module" src="./accent-theme.js"></script>\n',
    );
  }
  return next;
}

const changed = [];

for (const dir of kellySkillDirs()) {
  const name = path.basename(dir);
  if (name === "kelly-email") continue;
  const appDir = path.join(dir, "app");
  const indexPath = path.join(appDir, "index.html");
  if (!fs.existsSync(indexPath)) continue;

  fs.writeFileSync(path.join(appDir, "accent-theme.css"), cssTemplate);
  fs.writeFileSync(path.join(appDir, "accent-theme.js"), jsTemplate);

  const original = fs.readFileSync(indexPath, "utf8");
  const updated = ensureLinked(original);
  if (updated !== original) fs.writeFileSync(indexPath, updated);
  changed.push(name);
}

console.log(`Updated accent theme assets for ${changed.length} skills.`);
console.log(changed.join("\n"));
