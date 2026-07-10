// Loads the per-locale message catalogs (en.json, zh-CN.json) at runtime via
// fetch, keyed by the short lang code used throughout app.js ("en" | "zh").
// Avoids relying on JSON module import-attribute support across browsers.
export const messages = { en: {}, zh: {} };

export async function loadMessages() {
  const [en, zh] = await Promise.all([
    fetch("./i18n/en.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("./i18n/zh-CN.json", { cache: "no-store" }).then((r) => r.json()),
  ]);
  Object.assign(messages.en, en);
  Object.assign(messages.zh, zh);
  return messages;
}
