import { escapeHtml } from "./format.js";
import { applyI18n, t } from "./i18n.js";
import { $, project, store } from "./store.js";

export function viewMeta() {
  return {
    overview: [t("view_overview"), t("view_overview_sub")],
    characters: [t("view_characters"), t("view_characters_sub")],
    relationships: [t("view_relationships"), t("view_relationships_sub")],
    episodes: [t("view_episodes"), t("view_episodes_sub")],
    tasks: [t("view_tasks"), t("view_tasks_sub")],
  };
}

export function renderProjectSwitcher() {
  const select = $("projectSelect");
  const projects = store.state.projects?.length
    ? store.state.projects
    : [
        {
          id: store.state.project?.project_id,
          title: store.state.project?.series?.title,
          genre: store.state.project?.series?.genre,
          format: store.state.project?.series?.format,
        },
      ];
  const currentId = store.state.active_project_id || store.state.project?.project_id || projects[0]?.id || "";
  select.innerHTML = projects
    .map((item) => {
      const selected = item.id === currentId ? "selected" : "";
      return `<option value="${escapeHtml(item.id || item.title)}" ${selected}>${escapeHtml(item.title || t("project_unnamed"))}</option>`;
    })
    .join("");
  const current = projects.find((item) => item.id === currentId) || projects[0] || {};
  $("projectSwitchMeta").innerHTML = `
    <span>${escapeHtml(current.genre || store.state.project?.series?.genre || "")}</span>
    <span>${escapeHtml(current.format || store.state.project?.series?.format || "")}</span>
  `;
}

export function updateChrome() {
  const p = project();
  document.body.classList.toggle("episodes-list-mode", store.view === "episodes" && store.episodeMode === "list");
  document.body.classList.toggle("episode-focus-mode", store.view === "episodes" && store.episodeMode === "detail");
  renderProjectSwitcher();
  $("projectTitle").textContent = p.series?.title || t("project_unnamed");
  $("projectMeta").textContent =
    `${p.series?.genre || t("project_meta_genre_placeholder")} · ${p.series?.format || t("project_meta_format_placeholder")}`;
  $("projectPath").textContent = store.state.paths?.project_path || "";
  $("attentionNeeds").textContent = store.state.attention?.needs_review || 0;
  $("attentionShots").textContent = store.state.completeness?.shots_missing_prompt || 0;
  $("attentionViews").textContent = store.state.completeness?.characters_missing_views || 0;
  $("lockBanner").classList.toggle("hidden", !store.state.lock?.locked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === store.view);
  });
  const meta = viewMeta();
  const [title, subtitle] = meta[store.view] || ["", ""];
  $("viewTitle").textContent = title;
  $("viewSubtitle").textContent = subtitle;
  applyI18n();
}
