#!/usr/bin/env node
import http from "node:http";
import { DEFAULT_HOST, DEFAULT_PORT } from "./paths.mjs";
import { ensureDirs, envSearchPaths, loadDotenvFiles } from "./store.mjs";
import { handleRequest } from "./routes.mjs";

const host = process.env.KELLY_INQUIRY_UI_HOST || DEFAULT_HOST;
const port = Number.parseInt(process.env.KELLY_INQUIRY_UI_PORT || String(DEFAULT_PORT), 10);

await ensureDirs();
await loadDotenvFiles(envSearchPaths());

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(port, host, () => {
  console.log(`Kelly Inquiry UI: http://${host}:${port}`);
});
