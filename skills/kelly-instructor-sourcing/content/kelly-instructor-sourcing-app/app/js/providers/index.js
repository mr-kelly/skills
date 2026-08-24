export const getProvider = async () => {
  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  if (demo) return (await import("./demo-provider.js")).demoProvider;
  return (await import("./busabase-provider.js")).busabaseProvider;
};
