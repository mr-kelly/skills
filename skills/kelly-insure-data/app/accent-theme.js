const THEMES = ["blue", "green", "graphite"];
const STORAGE_KEY = "kelly-insure-data.accentTheme";

function resolveTheme(value) {
  return THEMES.includes(value) ? value : "blue";
}

document.documentElement.dataset.accentTheme = resolveTheme(localStorage.getItem(STORAGE_KEY) || "blue");

window.setKellyInsureAccentTheme = (value) => {
  const theme = resolveTheme(value);
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.accentTheme = theme;
};
