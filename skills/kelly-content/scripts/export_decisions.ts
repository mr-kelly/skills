#!/usr/bin/env node
import { createProvider } from "../lib/data-provider/index.ts";

const provider = await createProvider();
const report = await provider.exportApproved();

console.log(`Exported ${report.exported.length} item(s) via "${provider.kind}" provider to ${report.output_dir}`);
if (report.skipped.length) {
  console.log(`Skipped ${report.skipped.length}: ${report.skipped.map((s) => s.id).join(", ")}`);
}
