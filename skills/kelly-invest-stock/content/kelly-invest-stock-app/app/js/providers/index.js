export const getProvider = async () => {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  if (demo) return (await import("./demo-provider.js?v=0.9.2")).demoProvider;
  return (await import("./busabase-provider.js?v=0.9.2")).busabaseProvider;
};
