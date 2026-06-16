#!/usr/bin/env node
import http from "node:http";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.mjs";
import { ensureDirs } from "./batch-store.mjs";
import { handleRequest } from "./routes.mjs";
import { loadDotenvFiles } from "./config.mjs";

const host = process.env.KELLY_EMAIL_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_EMAIL_UI_PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles();

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(port, host, () => {
  console.log(`Kelly Email UI: http://${host}:${port}`);
});
