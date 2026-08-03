import { AsyncLocalStorage } from "node:async_hooks";

interface RuntimeRequestContext {
  origin: string;
  headers: Record<string, string>;
}

const requests = new AsyncLocalStorage<RuntimeRequestContext>();

export function withRuntimeRequest<T>(context: RuntimeRequestContext, operation: () => T): T {
  return requests.run(context, operation);
}

export function runtimeOrigin() {
  return requests.getStore()?.origin || process.env.BUSABASE_BASE_URL || "https://busabase.com";
}

export function runtimeHeaders() {
  return requests.getStore()?.headers || {};
}

export function isAirAppRequest() {
  return Boolean(requests.getStore());
}
