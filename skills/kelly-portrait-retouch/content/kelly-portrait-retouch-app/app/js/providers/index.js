export async function getProvider() {
  if (new URLSearchParams(window.location.search).has("demo")) {
    return (await import("./demo-provider.js?v=0.1.0")).demoProvider;
  }
  return (await import("./busabase-provider.js?v=0.1.0")).busabaseProvider;
}
