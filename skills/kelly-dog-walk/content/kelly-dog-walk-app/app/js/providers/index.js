// One switch: `?demo=1` (or any `demo` value) uses the bundled replay; everything else reads Busabase.
export const isDemo = () => new URLSearchParams(window.location.search).has("demo");

export const createProvider = async (options = {}) =>
  isDemo()
    ? (await import("./demo-provider.js")).createDemoProvider()
    : (await import("./busabase-provider.js")).createBusabaseProvider(options);
