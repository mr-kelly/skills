import { appConfig } from "./config.js";

export function createBusabaseClient() {
  return {
    slug: appConfig.slug,
    connect: () => Promise.resolve({ ok: true }),
  };
}
