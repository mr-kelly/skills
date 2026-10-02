export function createPagination({ getProvider, pageSizes, applyPage, render, label, onError }) {
  const state = { cursors: {}, current: {}, loading: {}, totals: {}, error: "" };
  const fallbackLabels = {
    en: { pagination: "Pagination", prevPage: "Prev", nextPage: "Next", pageOf: "Page {current} of {total}" },
    zh: { pagination: "分页", prevPage: "上一页", nextPage: "下一页", pageOf: "第 {current} / {total} 页" },
  };
  const text = (key) => {
    const translated = label(key);
    if (translated && translated !== key) return translated;
    const lang = document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en";
    return fallbackLabels[lang][key] || key;
  };

  function reset(pagination = {}, totals = {}) {
    state.cursors = {};
    state.current = {};
    state.loading = {};
    state.totals = totals;
    state.error = "";
    for (const [key, nextCursor] of Object.entries(pagination)) {
      state.cursors[key] = [undefined, nextCursor];
      state.current[key] = 1;
    }
  }

  function pageCount(key) {
    const total = state.totals[key];
    return total == null ? null : Math.max(1, Math.ceil(total / (pageSizes[key] || 100)));
  }

  function total(key, fallback = 0) {
    if (state.totals[key] != null) return state.totals[key];
    return `${fallback}${state.cursors[key]?.[1] ? "+" : ""}`;
  }

  async function goToPage(key, targetPage) {
    if (state.loading[key] || !state.cursors[key]) return;
    const totalPages = pageCount(key);
    const page = totalPages == null ? Math.max(1, targetPage) : Math.min(Math.max(1, targetPage), totalPages);
    if (page === state.current[key]) return;
    state.loading[key] = true;
    state.error = "";
    render();
    try {
      const provider = await getProvider();
      let result;
      for (let next = state.cursors[key].length; next <= page; next += 1) {
        const cursor = state.cursors[key][next - 1];
        if (next > 1 && !cursor) return;
        result = await provider.fetchPage(key, cursor);
        state.cursors[key][next] = result.nextCursor;
      }
      if (!result || state.cursors[key].length > page + 1) {
        result = await provider.fetchPage(key, state.cursors[key][page - 1]);
        state.cursors[key][page] = result.nextCursor;
      }
      applyPage(key, result.rows);
      state.current[key] = page;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      onError?.(error);
    } finally {
      state.loading[key] = false;
      render();
    }
  }

  function control(key) {
    if (!state.cursors[key]) return "";
    const total = pageCount(key);
    const current = state.current[key] || 1;
    const loading = Boolean(state.loading[key]);
    const hasNext = total == null ? Boolean(state.cursors[key][current]) : current < total;
    if ((total === 1 || total == null) && current === 1 && !hasNext) return "";
    const pages =
      total == null
        ? []
        : total <= 7
          ? Array.from({ length: total }, (_, index) => index + 1)
          : [
              ...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total)),
            ].sort((a, b) => a - b);
    const items = [];
    let previous = 0;
    for (const page of pages) {
      if (previous && page - previous > 1) items.push('<span class="pager-ellipsis">…</span>');
      items.push(
        `<button type="button" class="pager-page ${page === current ? "active" : ""}" data-goto-page="${key}:${page}" ${loading || page === current ? "disabled" : ""}>${page}</button>`,
      );
      previous = page;
    }
    return `<nav class="pager" aria-label="${text("pagination")}">
      <button type="button" class="pager-nav" data-goto-page="${key}:${current - 1}" ${loading || current <= 1 ? "disabled" : ""}>${text("prevPage")}</button>
      ${items.join("")}
      <button type="button" class="pager-nav" data-goto-page="${key}:${current + 1}" ${loading || !hasNext ? "disabled" : ""}>${text("nextPage")}</button>
      ${total == null ? "" : `<span class="pager-summary">${text("pageOf").replace("{current}", current).replace("{total}", total)}</span>`}
      ${state.error ? `<span class="pager-error" role="alert">${state.error.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])}</span>` : ""}
    </nav>`;
  }

  function bind(root) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-goto-page]");
      if (!button) return;
      const [key, page] = button.dataset.gotoPage.split(":");
      void goToPage(key, Number(page));
    });
  }

  return { reset, goToPage, control, bind, total };
}
