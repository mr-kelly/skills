import { createHash } from "node:crypto";

export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export * from "../content/kelly-appsec-app/app/js/validation.js";
