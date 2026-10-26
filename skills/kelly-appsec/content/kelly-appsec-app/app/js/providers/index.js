export const isDemo = () => new URLSearchParams(window.location.search).has("demo");
export const getProvider = async () =>
  isDemo()
    ? (await import("./demo-provider.js")).demoProvider
    : (await import("./busabase-provider.js")).busabaseProvider;
