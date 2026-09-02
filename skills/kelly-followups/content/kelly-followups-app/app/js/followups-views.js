import { els, escapeHtml, followups, loadState, lockBanner, noticeBanner, render, state, t } from "../app.js";
import { getProvider } from "./providers/index.js?v=0.1.0";

function row(item) {
  return `
    <div class="row followup-row">
      <div class="row-main">
        <div class="row-title">${escapeHtml(item.person)}</div>
        <div class="row-sub">${escapeHtml(item.action)}</div>
        ${item.meeting ? `<div class="row-meta-line">${t("fromMeeting")}: ${escapeHtml(item.meeting)}</div>` : ""}
      </div>
      <div class="row-meta">
        ${item.due ? `<span class="due-badge">${escapeHtml(item.due)}</span>` : ""}
        ${
          item.status === "pending"
            ? `<button type="button" class="btn primary" data-done="${escapeHtml(item.record_id)}">${t("markDone")}</button>`
            : `<span class="attention-badge attention-settled">${t("done")}</span>`
        }
      </div>
    </div>
  `;
}

export function renderToday() {
  const snapshot = state.snapshot;
  els.title.textContent = t("todayTitle");
  els.subtitle.textContent = t("todaySubtitle");
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    <div class="list-pane">
      ${
        snapshot?.today?.length
          ? snapshot.today.map(row).join("")
          : `<div class="empty">${t("nothingToday")}</div>`
      }
    </div>
  `;
  bindRowEvents();
}

export function renderAll() {
  els.title.textContent = t("allTitle");
  els.subtitle.textContent = "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    <div class="list-pane">
      ${followups().length ? followups().map(row).join("") : `<div class="empty">${t("noFollowups")}</div>`}
    </div>
  `;
  bindRowEvents();
}

function bindRowEvents() {
  els.content.querySelectorAll("[data-done]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const provider = await getProvider();
        await provider.applyDecision({ action: "done", record_id: button.dataset.done });
        await loadState();
      } catch (error) {
        state.notice = String(error?.message || error);
        render();
      }
    });
  });
}
