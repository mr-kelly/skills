import { bindForm } from "./actions.js";
import { escapeHtml, statusBadge } from "./format.js";
import { detailForm } from "./forms.js";
import { t } from "./i18n.js";
import { syncRoute } from "./router.js";
import { $, project, store } from "./store.js";

export function collectionFor(currentView = store.view) {
  const p = project();
  if (currentView === "characters") return p.characters || [];
  if (currentView === "relationships") return p.relationships || [];
  if (currentView === "episodes") return p.episodes || [];
  if (currentView === "shots") return p.shots || [];
  if (currentView === "tasks") return p.tasks || [];
  return [];
}

export function matches(item) {
  if (!store.query) return true;
  return JSON.stringify(item).toLowerCase().includes(store.query.toLowerCase());
}

export function selectedItem() {
  return collectionFor().find((item) => String(item.id) === String(store.selectedId)) || collectionFor()[0] || null;
}

function itemCard(item) {
  const title = item.name || item.title || item.type || item.id;
  const body =
    item.logline ||
    item.promise ||
    item.conflict ||
    item.note ||
    item.prompt ||
    item.character_card?.identity ||
    item.hidden_truth ||
    "";
  const key = item.number
    ? `EP-${String(item.number).padStart(3, "0")}`
    : String(item.id || "")
        .split("-")
        .slice(-2)
        .join("-")
        .toUpperCase();
  const thumb = item.reference_card?.image_asset || item.image_asset || "";
  const hasThumb = typeof thumb === "string" && thumb.startsWith("/generated/");
  const meta = [
    item.role,
    item.type,
    item.status ? statusBadge(item.status) : "",
    item.number ? `<span class="badge">Ep ${item.number}</span>` : "",
  ]
    .filter(Boolean)
    .map((part) => (String(part).startsWith("<") ? part : `<span class="badge">${escapeHtml(part)}</span>`))
    .join("");
  return `
    <button class="item-card ${hasThumb ? "has-thumb" : ""} ${item.id === store.selectedId ? "active" : ""}" data-select="${escapeHtml(item.id)}">
      ${hasThumb ? `<span class="item-card-thumb"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" /></span>` : `<span class="row-key">${escapeHtml(key)}</span>`}
      <span class="row-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(body).slice(0, 140)}</small>
      </span>
      <span class="card-meta">${meta}</span>
    </button>`;
}

export function renderListAndDetail() {
  $("newItemButton").style.visibility = "visible";
  const items = collectionFor().filter(matches);
  $("itemCount").textContent = String(items.length);
  if (!store.selectedId || !collectionFor().some((item) => item.id === store.selectedId)) {
    store.selectedId = items[0]?.id || null;
    syncRoute({ replace: true });
  }
  $("list").innerHTML =
    items.map(itemCard).join("") ||
    `<div class="item-card"><h3>${t("empty_list")}</h3><p>${t("empty_list_hint")}</p></div>`;
  $("detail").innerHTML = detailForm(selectedItem());
  bindForm();
}
