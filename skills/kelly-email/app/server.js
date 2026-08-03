import { serve } from "@hono/node-server";
import { app } from "./server/hono.ts";

const hostname = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`Kelly Email AirApp ready on http://${hostname}:${info.port}`);
});
