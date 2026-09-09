import { bindForm } from "./actions.js";
import { escapeHtml, formatBytes } from "./format.js";
import { seriesForm } from "./forms.js";
import { t } from "./i18n.js";
import { $, project, store } from "./store.js";

function overviewCard(title, body, target, tag) {
  return `
    <button class="item-card overview-row" data-go="${target}">
      <span class="row-key">${escapeHtml(tag)}</span>
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body)}</small>
      </span>
      <span class="row-arrow">${t("overview_card_open")}</span>
    </button>`;
}

function visualBiblePreview(bible) {
  const assets = bible.background_reference_assets || [];
  return `
    <section class="visual-bible-card">
      <div>
        <h3>${t("visual_bible_title")}</h3>
        <p>${escapeHtml(bible.format_note || "")}</p>
        <p class="muted">${escapeHtml(bible.realism_target || "")}</p>
      </div>
      <div class="reference-grid">
        ${assets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.title || t("visual_bible_title"))}" /><figcaption>${escapeHtml(asset.title || t("visual_bible_title"))}</figcaption></figure>`).join("") || `<div class="asset-placeholder">${t("visual_bible_placeholder")}</div>`}
      </div>
    </section>`;
}

function hyperframeStatusPanel(status) {
  if (!status.ok) return `<p class="form-note">${escapeHtml(status.error || t("hyperframe_read_failed"))}</p>`;
  const compositions = status.compositions || [];
  const renders = status.renders || [];
  const audio = status.audio || [];
  const changelogs = status.changelogs || [];
  return `
    <div class="hyperframe-metrics">
      <div><strong>${status.counts?.compositions || 0}</strong><span>${t("hyperframe_compositions")}</span></div>
      <div><strong>${status.counts?.scenes || 0}</strong><span>${t("hyperframe_scenes")}</span></div>
      <div><strong>${status.counts?.renders || 0}</strong><span>${t("hyperframe_renders")}</span></div>
      <div><strong>${status.counts?.audio || 0}</strong><span>${t("hyperframe_audio")}</span></div>
    </div>
    <div class="hyperframe-list">
      <h4>${t("hyperframe_compositions")}</h4>
      ${
        compositions
          .map(
            (item) => `
        <div class="hyperframe-row">
          <code>${escapeHtml(item.path)}</code>
          <span>${t("hyperframe_scene_count").replace("{n}", escapeHtml(item.scenes?.length || 0))}</span>
          <span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds}s` : ""}</span>
        </div>`,
          )
          .join("") || `<p class="muted">${t("hyperframe_no_compositions")}</p>`
      }
    </div>
    <div class="hyperframe-list compact">
      <h4>${t("hyperframe_renders")}</h4>
      ${
        renders
          .slice(0, 5)
          .map(
            (item) =>
              `<div class="hyperframe-row"><code>${escapeHtml(item.path)}</code><span>${Number.isFinite(item.duration_seconds) ? `${item.duration_seconds.toFixed(1)}s` : ""}</span><span>${formatBytes(item.size_bytes)}</span></div>`,
          )
          .join("") || `<p class="muted">${t("hyperframe_no_renders")}</p>`
      }
    </div>
    <div class="hyperframe-list compact">
      <h4>${t("hyperframe_audio")}</h4>
      ${
        audio
          .slice(0, 8)
          .map((item) => `<span class="hf-chip">${escapeHtml(item.path)}</span>`)
          .join("") || `<p class="muted">${t("hyperframe_no_audio")}</p>`
      }
    </div>
    ${changelogs.length ? `<div class="hyperframe-list compact"><h4>${t("hyperframe_latest_changelog")}</h4><div class="hyperframe-row"><code>${escapeHtml(changelogs[0].path)}</code><span>${escapeHtml((changelogs[0].updated_at || "").slice(0, 10))}</span></div></div>` : ""}
  `;
}

// The browser can never read an arbitrary local filesystem path (and neither
// could the retired app's UI, in spirit — the HyperFrame project always
// lives on the machine running the agent, not the AirApp). The status panel
// below only displays the CACHED snapshot a trusted operator/agent process
// last wrote via `scripts/read_hyperframe_status.mjs --apply`, which walks
// the HyperFrame project path on disk and stores the result on the project
// record's `hyperframe_status_json` field — see that script and
// references/drama-workflow.md's HyperFrame section.
function hyperframeOverview(p) {
  const series = p.series || {};
  const path = series.hyperframe_project_path || "";
  const status = series.hyperframe_status || {};
  const hasStatus = Boolean(status && Object.keys(status).length);
  return `
    <section class="hyperframe-card">
      <div class="section-head">
        <div>
          <h3>HyperFrame</h3>
          <p class="muted">${escapeHtml(path || t("hyperframe_no_path"))}</p>
        </div>
        ${series.hyperframe_status_updated_at ? `<span class="badge soft">${t("hyperframe_last_read").replace("{date}", escapeHtml(series.hyperframe_status_updated_at.slice(0, 10)))}</span>` : ""}
      </div>
      ${!path ? `<div class="asset-placeholder">${t("hyperframe_set_path")}</div>` : ""}
      ${path && !hasStatus ? `<p class="muted">${t("hyperframe_not_read")}</p>` : ""}
      ${path && hasStatus ? hyperframeStatusPanel(status) : ""}
    </section>`;
}

export function renderOverview() {
  const p = project();
  $("itemCount").textContent = t("overview_label");
  $("newItemButton").style.visibility = "hidden";
  const list = $("list");
  list.innerHTML = `
    <div class="metrics">
      <div class="metric"><strong>${store.state.totals?.characters ?? p.characters?.length ?? 0}</strong><span>${t("overview_metric_characters")}</span></div>
      <div class="metric"><strong>${store.state.totals?.relationships ?? p.relationships?.length ?? 0}</strong><span>${t("overview_metric_relationships")}</span></div>
      <div class="metric"><strong>${store.state.totals?.episodes ?? p.episodes?.length ?? 0}</strong><span>${t("overview_metric_episodes")}</span></div>
      <div class="metric"><strong>${store.state.totals?.shots ?? p.shots?.length ?? 0}</strong><span>${t("overview_metric_shots")}</span></div>
    </div>
    <div class="section-label">${t("overview_next_steps")}</div>
    ${overviewCard(t("overview_card_char_consistency"), t("overview_card_char_consistency_body").replace("{n}", store.state.completeness.characters_missing_views), "characters", t("view_characters"))}
    ${overviewCard(t("overview_card_plot"), t("overview_card_plot_body").replace("{n}", store.state.completeness.episodes_missing_cliffhanger), "episodes", t("view_episodes"))}
    ${overviewCard(t("overview_card_storyboard"), t("overview_card_storyboard_body").replace("{n}", store.state.completeness.shots_missing_prompt), "episodes", t("stat_shots"))}
    ${overviewCard(t("overview_card_relationship"), t("overview_card_relationship_body").replace("{n}", store.state.completeness.relationships_missing_evidence), "relationships", t("view_relationships"))}
    ${hyperframeOverview(p)}
    ${visualBiblePreview(p.series?.visual_bible || {})}
  `;
  $("detail").innerHTML = seriesForm(p.series || {});
  bindForm();
}
