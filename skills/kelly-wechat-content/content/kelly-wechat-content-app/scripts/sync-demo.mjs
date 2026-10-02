import { readFile, writeFile } from "node:fs/promises";
const data = {};
for (const key of ["sources", "articles"])
  data[key] = (await readFile(`../${key}/records.ndjson`, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
await writeFile("app/demo-data.json", `${JSON.stringify(data, null, 2)}\n`);
