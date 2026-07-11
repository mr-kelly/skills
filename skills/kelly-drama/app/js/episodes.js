import { bindForm } from "./actions.js";
import { escapeHtml, formActions, input, statusBadge, statusSelect, textarea } from "./format.js";
import { t } from "./i18n.js";
import { collectionFor, matches } from "./list-detail.js";
import { syncRoute } from "./router.js";
import { shotPreview, shotReadiness, shotsForEpisode } from "./shots.js";
import { $, store } from "./store.js";

export { shotsForEpisode };

function episodeRow(episode) {
  const shots = shotsForEpisode(episode.id);
  const summary = episode.summary || episode.promise || "";
  return `
    <tr class="${episode.id === store.selectedId ? "active" : ""}" data-row-episode="${escapeHtml(episode.id)}">
      <td class="episode-no">${escapeHtml(String(episode.number || "").padStart(3, "0"))}</td>
      <td>
        <button class="episode-link" data-episode-detail="${escapeHtml(episode.id)}">${escapeHtml(episode.title || episode.id)}</button>
        <div class="table-sub">${escapeHtml(episode.source_chapter?.chapter_title || "")}</div>
      </td>
      <td>${escapeHtml(summary).slice(0, 86)}</td>
      <td>${statusBadge(episode.status)}</td>
      <td><span class="badge">${shots.length}</span></td>
      <td><button class="mini-button table-action" data-episode-detail="${escapeHtml(episode.id)}">${t("episode_view_detail")}</button></td>
    </tr>`;
}

function episodeTable(items) {
  if (!items.length) {
    return `<div class="item-card"><h3>${t("episode_empty")}</h3><p>${t("episode_empty_hint")}</p></div>`;
  }
  return `
    <div class="episode-table-wrap">
      <table class="episode-table">
        <thead>
          <tr>
            <th>${t("episode_table_ep")}</th>
            <th>${t("episode_table_title")}</th>
            <th>${t("episode_table_summary")}</th>
            <th>${t("episode_table_status")}</th>
            <th>${t("episode_table_shots")}</th>
            <th>${t("episode_table_actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((episode) => episodeRow(episode)).join("")}
        </tbody>
      </table>
    </div>`;
}

function scriptPreview(item) {
  const beats = item.beats || [];
  return `
    <section class="script-section">
      <h3>${t("script_section_title")}</h3>
      <div class="beat-stack">
        ${
          beats
            .map(
              (beat, index) => `
          <article class="beat-row">
            <div class="beat-index">${String(index + 1).padStart(2, "0")}</div>
            <div>
              <strong>${escapeHtml(beat.label || beat.id)}</strong>
              <p>${escapeHtml(beat.hook || "")}</p>
              <p class="muted">${escapeHtml(beat.conflict || "")}</p>
            </div>
          </article>
        `,
            )
            .join("") || `<p class="muted">${t("script_beats_empty")}</p>`
        }
      </div>
    </section>`;
}

function episodeSummaryTab(item) {
  return `
    <section class="script-section">
      <h3>${t("script_section_episode_summary")}</h3>
      <div class="form-grid">
        ${input("id", "ID", item.id)}
        ${input("number", "Ep #", item.number || "", "number")}
        ${input("title", "Title", item.title)}
        ${statusSelect(item.status)}
        ${textarea("summary", "Summary", item.summary || item.promise)}
        ${textarea("promise", "Source anchor / episode promise", item.promise)}
        ${textarea("a_plot", "A-plot", item.a_plot, false)}
        ${textarea("b_plot", "B-plot", item.b_plot, false)}
        ${textarea("cliffhanger", "Cliffhanger", item.cliffhanger)}
        ${textarea("beats_json", "Beats JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
    </section>
    ${scriptPreview(item)}`;
}

function shotListRow(shot, index) {
  const expanded = store.expandedShots.has(shot.id);
  const r = shotReadiness(shot);
  const asset = shot.image_asset || "";
  const isImg = asset.startsWith("/generated/");
  const dur = shot.duration_preset || (shot.duration_seconds ? `${shot.duration_seconds}s` : "—");
  const pendingCount = r.missing.length + (r.pacingWarn ? 1 : 0);
  const readyDot = r.ready
    ? `<span class="row-ready ok" title="${t("shot_video_ready")}">●</span>`
    : `<span class="row-ready warn" title="${t("shot_pending").replace("{n}", pendingCount)}">●</span>`;
  const specs = [shot.shot_size, shot.camera_movement].filter(Boolean).join(" · ");
  return `
    <div class="shot-row-wrap ${expanded ? "open" : ""}">
      <button type="button" class="shot-row" data-shot-toggle="${escapeHtml(shot.id)}" aria-expanded="${expanded}">
        <span class="shot-row-no">${String(index + 1).padStart(2, "0")}</span>
        <span class="shot-row-thumb">${isImg ? `<img src="${escapeHtml(asset)}" alt="" loading="lazy" />` : `<span class="thumb-empty">${t("shot_no_image")}</span>`}</span>
        <span class="shot-row-main">
          <strong>${readyDot}${escapeHtml(shot.title || shot.id)}</strong>
          <small>${escapeHtml(shot.composition || "")}</small>
        </span>
        <span class="shot-row-meta">
          <span class="badge">${escapeHtml(dur)}</span>
          ${specs ? `<span class="badge soft">${escapeHtml(specs)}</span>` : ""}
          ${statusBadge(shot.status)}
        </span>
        <span class="shot-row-caret">${expanded ? "▾" : "▸"}</span>
      </button>
      ${expanded ? `<div class="shot-row-detail">${shotPreview(shot)}</div>` : ""}
    </div>`;
}

function executionTimeline(item, shots) {
  const execution = item.execution || {};
  const allExpanded = shots.every((s) => store.expandedShots.has(s.id));
  return `
    <section class="script-section">
      <div class="section-head">
        <div>
          <h3>Storyboard</h3>
          <p class="muted">${t("exec_card_01_body")}</p>
        </div>
      </div>
      <div class="execution-grid">
        <div class="execution-card">
          <span>01</span>
          <strong>${t("exec_card_01_title")}</strong>
          <p>${escapeHtml(execution.shot_description || t("exec_card_01_body"))}</p>
        </div>
        <div class="execution-card">
          <span>02</span>
          <strong>${t("exec_card_02_title")}</strong>
          <p>${escapeHtml(execution.srt_status || t("exec_card_02_body"))}</p>
        </div>
        <div class="execution-card">
          <span>03</span>
          <strong>${t("exec_card_03_title")}</strong>
          <p>${escapeHtml(execution.image_status || t("exec_card_03_body"))}</p>
        </div>
        <div class="execution-card">
          <span>04</span>
          <strong>${t("exec_card_04_title")}</strong>
          <p>${escapeHtml(execution.video_status || t("exec_card_04_body"))}</p>
        </div>
      </div>
      <div class="shot-list-head">
        <span>${t("shot_count").replace("{n}", shots.length)}</span>
        ${shots.length ? `<button type="button" class="mini-button ghost" data-shots-expand-all>${allExpanded ? t("shot_collapse_all") : t("shot_expand_all")}</button>` : ""}
      </div>
      <div class="shot-list">
        ${shots.map((shot, index) => shotListRow(shot, index)).join("") || `<div class="empty-shot">${t("shot_empty")}</div>`}
      </div>
    </section>`;
}

function episodeShotsTab(item, shots) {
  return executionTimeline(item, shots);
}

function episodeDetail(item) {
  if (!item)
    return `<div class="detail-card"><h2>${t("episode_select_hint")}</h2><p class="muted">${t("episode_select_hint_sub")}</p></div>`;
  const shots = shotsForEpisode(item.id);
  return `
    <form class="detail-card episode-detail" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <button type="button" class="back-button" data-episode-list>${t("episode_back")}</button>
      <div class="detail-head">
        <div>
          <div class="eyebrow">${t("episode_detail_eyebrow")}</div>
          <h2>${escapeHtml(item.title || "New episode")}</h2>
          <p>${escapeHtml(item.source_chapter?.work || "")}${item.source_chapter?.work ? " · " : ""}${escapeHtml(item.source_chapter?.chapter_number || item.number || "")}${item.source_chapter?.chapter_number || item.number ? " · " : ""}${escapeHtml(item.runtime || "")}</p>
        </div>
        ${statusBadge(item.status)}
      </div>

      <div class="episode-tabs" role="tablist" aria-label="Episode detail">
        <button type="button" class="${store.episodeTab === "summary" ? "active" : ""}" data-episode-tab="summary">${t("episode_tab_summary")}</button>
        <button type="button" class="${store.episodeTab === "shots" ? "active" : ""}" data-episode-tab="shots">${t("episode_tab_shots")}</button>
      </div>

      ${store.episodeTab === "shots" ? episodeShotsTab(item, shots) : episodeSummaryTab(item)}
      ${store.episodeTab === "shots" ? `<div class="form-actions"><span class="muted">${t("episode_shots_note")}</span></div>` : formActions()}
    </form>`;
}

export function renderEpisodesWorkspace() {
  $("newItemButton").style.visibility = "visible";
  const allEpisodes = collectionFor("episodes");
  const items = allEpisodes.filter(matches).sort((a, b) => (a.number || 0) - (b.number || 0));
  $("itemCount").textContent = String(items.length);
  if (store.episodeMode === "detail" && (!store.selectedId || !allEpisodes.some((item) => item.id === store.selectedId))) {
    store.selectedId = items[0]?.id || null;
    syncRoute({ replace: true });
  }
  const workspace = document.querySelector(".workspace");
  workspace?.classList.toggle("episode-detail-mode", store.episodeMode === "detail");
  workspace?.classList.toggle("episodes-list-layout", store.episodeMode === "list");
  const selected = allEpisodes.find((item) => item.id === store.selectedId) || null;
  if (store.episodeMode === "detail") {
    $("list").innerHTML = episodeDetail(selected);
    $("detail").innerHTML = "";
  } else {
    $("list").innerHTML = episodeTable(items);
    $("detail").innerHTML = "";
  }
  bindForm();
}
