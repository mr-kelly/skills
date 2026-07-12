import { serve } from "@hono/node-server";
import { app } from "./hono.ts";

const hostname = process.env.HOMEWORK_COACH_HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.KELLY_HOMEWORK_COACH_UI_PORT || 3000);

serve({ fetch: app.fetch, hostname, port });
console.log(`Kelly Homework Coach running at http://${hostname}:${port}`);
