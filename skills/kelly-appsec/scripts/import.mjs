#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseOpenApi, validateInventory } from "../lib/domain.mjs";
import { importInventory } from "../lib/inventory.mjs";
import { connectStore } from "../lib/store.mjs";
try {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      file: { type: "string" },
      revision: { type: "string" },
      apply: { type: "boolean" },
    },
  });
  if (!values.project || !values.file)
    throw new Error("Required: --project ID --file inventory.json [--revision REV for OpenAPI] [--apply]");
  const raw = await readFile(values.file, "utf8");
  if (raw.length > 1048576) throw new Error("IMPORT_TOO_LARGE");
  const document = JSON.parse(raw);
  if (!values.apply) {
    const parsed =
      document.openapi || document.swagger
        ? parseOpenApi(document, { sourceRevision: values.revision, sourceLocation: values.file })
        : validateInventory(document);
    console.log(
      JSON.stringify({
        mode: "validated-preview",
        endpoints: parsed.endpoints.length,
        rules: parsed.rules.length,
        sourceRevision: parsed.sourceRevision,
      }),
    );
  } else {
    const result = await importInventory(await connectStore(), {
      projectId: values.project,
      document,
      sourceRevision: values.revision,
      sourceLocation: values.file,
    });
    console.log(
      JSON.stringify({
        importedEndpoints: result.endpoints.length,
        importedRules: result.rules.length,
        sourceRevision: result.sourceRevision,
      }),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "IMPORT_FAILED");
  process.exitCode = 1;
}
