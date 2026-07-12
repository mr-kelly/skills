import {
  byteLength,
  charLength,
  checks,
  claimRefLinks,
  claimStatusBadge,
  claimsRegistry,
  date,
  decisionFor,
  draftById,
  draftLabel,
  drafts,
  effectiveDraftStatus,
  effectiveReviewStatus,
  els,
  enumLabel,
  escapeHtml,
  filteredDrafts,
  loadState,
  localeBadge,
  lockBanner,
  metricCards,
  noticeBanner,
  platformBadge,
  platformRulesFor,
  productById,
  products,
  render,
  resultBadge,
  reviewForDraft,
  reviewItems,
  ruleById,
  rules,
  scoreCell,
  severityBadge,
  state,
  statusBadge,
  t,
  warnings,
} from "../app.js";
export function renderDrafts() {
  els.title.textContent = t("drafts");
  const items = filteredDrafts();
  els.subtitle.textContent = `${items.length} ${t("draftsLower")}`;
  els.content.innerHTML = `
    ${metricCards()}
    ${warnings()}
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("draft")}</th><th>${t("product")}</th><th>${t("platform")}</th><th>${t("locale")}</th><th>${t("title")}</th><th>${t("score")}</th><th>${t("status")}</th><th>${t("lastUpdated")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const product = productById(item.product_id);
                const title = item.fields?.title || "";
                return `
                <tr>
                  <td><a href="#/drafts/${encodeURIComponent(item.draft_id)}"><span class="strong">${t("draftRef")} #${item.ref}</span></a></td>
                  <td><a href="#/products/${encodeURIComponent(item.product_id)}">${escapeHtml(product?.name || item.product_id)}</a></td>
                  <td>${platformBadge(item.platform)}</td>
                  <td>${localeBadge(item.locale)}</td>
                  <td class="title-cell">${escapeHtml(title.length > 90 ? `${title.slice(0, 90)}…` : title)}</td>
                  <td>${scoreCell(item.compliance_score)}</td>
                  <td>${statusBadge(effectiveDraftStatus(item))}</td>
                  <td>${date(item.updated_at)}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noDrafts")}</div>`
    }
  `;
}

function editedFields(draft) {
  return { ...draft.fields, ...(state.fieldEdits[draft.draft_id] || {}) };
}

function counterMarkup(id, current, max, unit) {
  const over = max && current > max;
  return `<span class="counter ${over ? "over" : ""}" id="${id}">${current}${max ? ` / ${max}` : ""} ${unit}</span>`;
}

function textField({ draft, key, label, value, rows = 2, max = 0, unit = "chars", mono = false }) {
  const current = unit === "bytes" ? byteLength(value) : charLength(value);
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label>${counterMarkup(`count-${key}`, current, max, t(unit))}</div>
      <textarea id="f-${key}" class="field-input ${mono ? "mono" : ""}" data-field="${escapeHtml(key)}" data-max="${max}" data-unit="${unit}" rows="${rows}">${escapeHtml(value || "")}</textarea>
    </div>
  `;
}

function listField({ key, label, values, rows = 6, hint = "" }) {
  return `
    <div class="field-block">
      <div class="field-head"><label for="f-${key}">${label}</label><span class="counter" id="count-${key}">${(values || []).length}</span></div>
      <textarea id="f-${key}" class="field-input" data-field="${escapeHtml(key)}" data-kind="list" rows="${rows}">${escapeHtml((values || []).join("\n"))}</textarea>
      ${hint ? `<div class="muted field-hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
}

function draftFieldsEditor(draft) {
  const fields = editedFields(draft);
  const rules = platformRulesFor(draft.platform);
  const titleMax = Number(rules.title_max_chars) || 0;
  if (draft.platform === "amazon" || draft.platform === "nda") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 200 })}
      ${listField({ key: "bullets", label: t("bullets"), values: fields.bullets, rows: 8 })}
      ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ draft, key: "search_terms", label: t("searchTerms"), value: fields.search_terms, rows: 3, max: Number(rules.search_terms_max_bytes) || 249, unit: "bytes", mono: true })}
      ${listField({ key: "aplus_outline", label: t("aplusOutline"), values: fields.aplus_outline, rows: 5 })}
    `;
  }
  if (draft.platform === "shopify" || draft.platform === "msa") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 70 })}
      ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
      ${textField({ draft, key: "seo_title", label: t("seoTitle"), value: fields.seo_title, rows: 2, max: Number(rules.seo_title_max_chars) || 60 })}
      ${textField({ draft, key: "seo_description", label: t("seoDescription"), value: fields.seo_description, rows: 3, max: Number(rules.seo_description_max_chars) || 160 })}
    `;
  }
  if (draft.platform === "tiktok_shop" || draft.platform === "dpa") {
    return `
      ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 3, max: titleMax || 255 })}
      ${listField({ key: "selling_points", label: t("sellingPoints"), values: fields.selling_points, rows: 5 })}
    `;
  }
  return `
    ${textField({ draft, key: "title", label: t("title"), value: fields.title, rows: 2, max: titleMax || 80 })}
    ${textField({ draft, key: "subtitle", label: t("subtitle"), value: fields.subtitle, rows: 2 })}
    ${textField({ draft, key: "description", label: t("description"), value: fields.description, rows: 5 })}
    ${listField({ key: "item_specifics", label: t("itemSpecifics"), values: (fields.item_specifics || []).map((item) => `${item.name}: ${item.value}`), rows: 6 })}
  `;
}

function localeTabs(draft) {
  if (!draft.variant_group) return "";
  const variants = drafts().filter((item) => item.variant_group === draft.variant_group);
  if (variants.length < 2) return "";
  return `
    <div class="locale-tabs" role="tablist" aria-label="${t("variantTabs")}">
      <span class="muted">${t("variantTabs")}:</span>
      ${variants
        .map(
          (variant) => `
        <a role="tab" aria-selected="${variant.draft_id === draft.draft_id}" class="locale-tab ${variant.draft_id === draft.draft_id ? "active" : ""}" href="#/drafts/${encodeURIComponent(variant.draft_id)}">${escapeHtml(variant.locale || variant.draft_id)}</a>
      `,
        )
        .join("")}
    </div>
  `;
}

export function renderDraftDetail() {
  const draft = draftById(state.route.id);
  if (!draft) {
    renderDrafts();
    return;
  }
  const product = productById(draft.product_id);
  const draftChecks = checks().filter((item) => item.draft_id === draft.draft_id);
  const review = reviewForDraft(draft.draft_id);
  const locked = Boolean(state.settings?.lock);
  els.title.textContent = `${t("draftRef")} #${draft.ref} · ${product?.name || draft.product_id}`;
  els.subtitle.textContent = `${enumLabel(draft.platform, "platform")} · ${draft.locale || ""} · ${enumLabel(effectiveDraftStatus(draft))}`;
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings(draft.draft_id)}
    <section class="detail">
      <div class="detail-main">
        ${localeTabs(draft)}
        <div class="section-block workbench" data-draft="${escapeHtml(draft.draft_id)}">
          <h2>${t("editFields")}</h2>
          ${draftFieldsEditor(draft)}
          <div class="notes-actions">
            <button id="saveFields" type="button" ${locked || !review ? "disabled" : ""}>${t("saveEdits")}</button>
            <span class="muted">${t("fieldsSavedHint")}</span>
          </div>
        </div>
      </div>
      <aside class="detail-side">
        <div>
          <h2>${t("draftDetail")}</h2>
          <dl>
            <dt>${t("status")}</dt><dd>${statusBadge(effectiveDraftStatus(draft))}</dd>
            <dt>${t("score")}</dt><dd>${scoreCell(draft.compliance_score)}</dd>
            <dt>${t("platform")}</dt><dd>${platformBadge(draft.platform)}</dd>
            <dt>${t("locale")}</dt><dd>${localeBadge(draft.locale)}</dd>
            <dt>${t("product")}</dt><dd><a href="#/products/${encodeURIComponent(draft.product_id)}">${escapeHtml(product?.name || draft.product_id)}</a></dd>
            <dt>${t("sku")}</dt><dd>${escapeHtml(product?.sku || "")}</dd>
            <dt>${t("lastUpdated")}</dt><dd>${date(draft.updated_at)}</dd>
          </dl>
        </div>
        ${
          draft.keyword_strategy
            ? `
          <div class="agent-panel">
            <h2>${t("keywordStrategy")}</h2>
            <p>${escapeHtml(draft.keyword_strategy)}</p>
          </div>
        `
            : ""
        }
        <div>
          <h2>${t("complianceChecks")}</h2>
          ${
            draftChecks
              .map(
                (item) => `
            <div class="check-row">
              ${resultBadge(item.result)}
              <span>
                <strong>${escapeHtml(ruleById(item.rule_id)?.name || item.rule_id)}</strong>
                <small>${escapeHtml(item.evidence || "")}</small>
                ${claimRefLinks(item.refs)}
              </span>
            </div>
          `,
              )
              .join("") || `<div class="empty-inline">${t("noChecks")}</div>`
          }
        </div>
      </aside>
    </section>
  `;
  bindWorkbenchEvents(draft, review);
}

function bindWorkbenchEvents(draft, review) {
  const workbench = els.content.querySelector(".workbench");
  if (!workbench) return;
  workbench.querySelectorAll("textarea.field-input").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.field;
      const edits = state.fieldEdits[draft.draft_id] || (state.fieldEdits[draft.draft_id] = {});
      if (input.dataset.kind === "list") {
        const values = input.value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        edits[key] =
          key === "item_specifics"
            ? values.map((line) => {
                const idx = line.indexOf(":");
                return idx === -1
                  ? { name: line, value: "" }
                  : { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
              })
            : values;
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) counter.textContent = String(values.length);
      } else {
        edits[key] = input.value;
        const counter = workbench.querySelector(`#count-${CSS.escape(key)}`);
        if (counter) {
          const max = Number(input.dataset.max) || 0;
          const unit = input.dataset.unit || "chars";
          const current = unit === "bytes" ? byteLength(input.value) : charLength(input.value);
          counter.textContent = `${current}${max ? ` / ${max}` : ""} ${t(unit)}`;
          counter.classList.toggle("over", Boolean(max) && current > max);
        }
      }
    });
  });
  workbench.querySelector("#saveFields")?.addEventListener("click", () => {
    if (!review) return;
    submitDecision(review.review_id, "revise", { fields: editedFields(draft) });
  });
}

function filteredChecks() {
  const query = state.query.trim().toLowerCase();
  return checks().filter((item) => {
    if (state.checkRuleFilter !== "all" && item.rule_id !== state.checkRuleFilter) return false;
    const draft = draftById(item.draft_id);
    if (state.checkPlatformFilter !== "all" && draft?.platform !== state.checkPlatformFilter) return false;
    if (state.checkProductFilter !== "all" && draft?.product_id !== state.checkProductFilter) return false;
    if (state.checkResultFilter !== "all" && item.result !== state.checkResultFilter) return false;
    if (!query) return true;
    return [ruleById(item.rule_id)?.name, item.evidence, item.result, draft ? draftLabel(draft) : ""]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

export function renderChecks() {
  els.title.textContent = t("checks");
  const items = filteredChecks();
  const all = checks();
  const passCount = all.filter((item) => item.result === "pass").length;
  const warnCount = all.filter((item) => item.result === "warn").length;
  const failCount = all.filter((item) => item.result === "fail").length;
  els.subtitle.textContent = `${all.length} ${t("checksTotal")} · ${failCount} ${t("failedChecks")}`;
  const platforms = [...new Set(drafts().map((draft) => draft.platform))];
  els.content.innerHTML = `
    ${warnings()}
    <div class="metrics">
      <div class="metric"><span>${t("checks")}</span><strong>${all.length}</strong></div>
      <div class="metric"><span>${enumLabel("pass", "result")}</span><strong>${passCount}</strong></div>
      <div class="metric"><span>${enumLabel("warn", "result")}</span><strong>${warnCount}</strong></div>
      <div class="metric"><span>${enumLabel("fail", "result")}</span><strong>${failCount}</strong></div>
    </div>
    <div class="check-filters">
      <select id="ruleFilter" aria-label="${t("rule")}">
        <option value="all">${t("all")} · ${t("rule")}</option>
        ${rules()
          .map(
            (rule) =>
              `<option value="${escapeHtml(rule.rule_id)}" ${state.checkRuleFilter === rule.rule_id ? "selected" : ""}>${escapeHtml(rule.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="platformFilter" aria-label="${t("platform")}">
        <option value="all">${t("all")} · ${t("platform")}</option>
        ${platforms.map((platform) => `<option value="${escapeHtml(platform)}" ${state.checkPlatformFilter === platform ? "selected" : ""}>${escapeHtml(enumLabel(platform, "platform"))}</option>`).join("")}
      </select>
      <select id="productFilter" aria-label="${t("product")}">
        <option value="all">${t("all")} · ${t("product")}</option>
        ${products()
          .map(
            (product) =>
              `<option value="${escapeHtml(product.product_id)}" ${state.checkProductFilter === product.product_id ? "selected" : ""}>${escapeHtml(product.name)}</option>`,
          )
          .join("")}
      </select>
      <select id="resultFilter" aria-label="${t("result")}">
        <option value="all">${t("all")} · ${t("result")}</option>
        ${["pass", "warn", "fail"].map((result) => `<option value="${result}" ${state.checkResultFilter === result ? "selected" : ""}>${escapeHtml(enumLabel(result, "result"))}</option>`).join("")}
      </select>
    </div>
    ${
      items.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("draft")}</th><th>${t("platform")}</th><th>${t("rule")}</th><th>${t("severity")}</th><th>${t("result")}</th><th>${t("evidence")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item) => {
                const draft = draftById(item.draft_id);
                const rule = ruleById(item.rule_id);
                return `
                <tr>
                  <td><a href="#/drafts/${encodeURIComponent(item.draft_id)}"><span class="strong">${t("draftRef")} #${draft?.ref || ""} · ${escapeHtml(draft ? productById(draft.product_id)?.name || "" : item.draft_id)}</span></a><div class="muted">${escapeHtml(draft?.locale || "")}</div></td>
                  <td>${draft ? platformBadge(draft.platform) : ""}</td>
                  <td>${escapeHtml(rule?.name || item.rule_id)}</td>
                  <td>${severityBadge(item.severity)}</td>
                  <td>${resultBadge(item.result)}</td>
                  <td class="evidence-cell">${escapeHtml(item.evidence || "")}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : `<div class="empty">${t("noChecks")}</div>`
    }
  `;
  const bind = (id, prop) => {
    els.content.querySelector(id)?.addEventListener("change", (event) => {
      state[prop] = event.target.value;
      render();
    });
  };
  bind("#ruleFilter", "checkRuleFilter");
  bind("#platformFilter", "checkPlatformFilter");
  bind("#productFilter", "checkProductFilter");
  bind("#resultFilter", "checkResultFilter");
}

function filteredReviewItems() {
  const query = state.query.trim().toLowerCase();
  return reviewItems().filter((item) => {
    const status = effectiveReviewStatus(item);
    if (state.reviewFilter !== "all" && status !== state.reviewFilter) return false;
    if (!query) return true;
    const draft = draftById(item.draft_id);
    return [draft ? draftLabel(draft) : item.draft_id, item.compliance_summary, status, draft?.fields?.title]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function reviewFilters() {
  const states = ["all", "needs_review", "changes_requested", "approved", "done", "blocked"];
  return `
    <div class="queue-filters">
      ${states
        .map((value) => {
          const count =
            value === "all"
              ? reviewItems().length
              : reviewItems().filter((item) => effectiveReviewStatus(item) === value).length;
          const label = value === "all" ? t("all") : enumLabel(value);
          return `<button type="button" class="queue-filter ${state.reviewFilter === value ? "active" : ""}" data-filter="${value}">${escapeHtml(label)} <small>${count}</small></button>`;
        })
        .join("")}
    </div>
  `;
}

export function renderReview() {
  els.title.textContent = t("review");
  const items = filteredReviewItems();
  const reviewCount = reviewItems().filter((item) => effectiveReviewStatus(item) === "needs_review").length;
  els.subtitle.textContent = `${reviewCount} ${t("awaitingReview")}`;
  const locked = Boolean(state.settings?.lock);
  const disabled = locked ? "disabled" : "";
  els.content.innerHTML = `
    ${lockBanner()}
    ${noticeBanner()}
    ${warnings()}
    ${reviewFilters()}
    <div class="queue">
      ${
        items
          .map((item) => {
            const status = effectiveReviewStatus(item);
            const draft = draftById(item.draft_id);
            const decision = decisionFor(item.review_id);
            const edits = state.edits[item.review_id] || {};
            const note = edits.note ?? decision?.comment ?? "";
            return `
          <article class="queue-card status-${escapeHtml(status)}" data-review="${escapeHtml(item.review_id)}">
            <header class="queue-head">
              <span class="queue-ref">${t("draftRef")} #${item.ref}</span>
              ${statusBadge(status)}
              ${draft ? platformBadge(draft.platform) : ""}
              ${draft ? localeBadge(draft.locale) : ""}
              <span class="queue-score muted">${t("score")} ${draft ? scoreCell(draft.compliance_score) : ""}</span>
            </header>
            <div class="queue-meta">
              ${draft ? `<a href="#/drafts/${encodeURIComponent(draft.draft_id)}">${escapeHtml(productById(draft.product_id)?.name || draft.draft_id)}</a> · ${escapeHtml(draft.fields?.title?.slice(0, 110) || "")}` : escapeHtml(item.draft_id)}
            </div>
            <p class="queue-summary"><span class="muted">${t("complianceSummary")}:</span> ${escapeHtml(item.compliance_summary || "")}</p>
            ${draft?.keyword_strategy ? `<p class="queue-summary"><span class="muted">${t("keywordStrategy")}:</span> ${escapeHtml(draft.keyword_strategy)}</p>` : ""}
            ${
              item.suggestions?.length
                ? `
              <span class="queue-label">${t("suggestions")}</span>
              <ul class="queue-suggestions">${item.suggestions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
            `
                : ""
            }
            <label class="queue-label">${t("reviewNote")}</label>
            <textarea class="queue-note" data-field="note" rows="2" placeholder="${escapeHtml(t("reviewNotePlaceholder"))}" ${disabled}>${escapeHtml(note)}</textarea>
            <div class="queue-actions">
              <button type="button" class="approve" data-action="approve" title="${t("approve")}" ${disabled}>${t("approve")}</button>
              <button type="button" data-action="request_changes" title="${t("requestChanges")}" ${disabled}>${t("requestChanges")}</button>
              <button type="button" class="danger" data-action="block" title="${t("block")}" ${disabled}>${t("block")}</button>
              ${decision ? `<span class="queue-decision muted">${t("decision")}: ${escapeHtml(enumLabel(decision.action, "action"))} · ${escapeHtml(decision.decided_at ? new Date(decision.decided_at).toLocaleString() : "")}</span>` : ""}
            </div>
          </article>
        `;
          })
          .join("") || `<div class="empty">${t("noReviewItems")}</div>`
      }
    </div>
  `;
  bindReviewEvents();
}

function bindReviewEvents() {
  els.content.querySelectorAll(".queue-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.reviewFilter = button.dataset.filter;
      render();
    });
  });
  els.content.querySelectorAll(".queue-card textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const id = textarea.closest(".queue-card").dataset.review;
      const field = textarea.dataset.field;
      state.edits[id] = { ...state.edits[id], [field]: textarea.value };
    });
  });
  els.content.querySelectorAll(".queue-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".queue-card");
      const note = card.querySelector('[data-field="note"]')?.value ?? "";
      submitDecision(card.dataset.review, button.dataset.action, { comment: note });
    });
  });
}

async function submitDecision(reviewId, action, { comment = "", fields } = {}) {
  if (state.settings?.demo) {
    state.notice = t("demoNotice");
    render();
    return;
  }
  const body = { review_id: reviewId, action, comment };
  if (fields !== undefined) body.fields = fields;
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.notice = payload.error || `Decision failed: ${res.status}`;
    render();
    return;
  }
  delete state.edits[reviewId];
  state.notice = t("saved");
  await loadState();
}

export function renderClaims() {
  els.title.textContent = t("claimsRegistry");
  const registry = claimsRegistry();
  const query = state.query.trim().toLowerCase();
  const matches = (haystack) =>
    !query ||
    String(haystack || "")
      .toLowerCase()
      .includes(query);
  const claims = (registry.claims || []).filter(
    (claim) => matches(claim.text) || matches(claim.substantiation) || matches(claim.category),
  );
  const claimRules = (registry.rules || []).filter(
    (rule) => matches(rule.phrase) || matches(rule.reason) || matches(rule.alternative),
  );
  const approvedCount = (registry.claims || []).filter((claim) => claim.status === "approved").length;
  els.subtitle.textContent = `${approvedCount} ${t("approved")} · ${(registry.rules || []).length} ${t("bannedPhrases")}`;
  els.content.innerHTML = `
    ${warnings()}
    <div class="warnings"><div class="info"><strong>${t("claimsIntro")}</strong></div></div>
    <div class="section-block">
      <h2>${t("approvedClaims")}</h2>
      ${
        claims.length
          ? `<div class="table-wrap"><table>
        <thead><tr>
          <th>${t("claimText")}</th><th>${t("claimStatus")}</th><th>${t("category")}</th><th>${t("substantiation")}</th><th>${t("claimEvidence")}</th>
        </tr></thead>
        <tbody>
          ${claims
            .map(
              (claim) => `
            <tr id="claim-${escapeHtml(claim.claim_id)}">
              <td class="strong">${escapeHtml(claim.text)}</td>
              <td>${claimStatusBadge(claim.status)}</td>
              <td>${escapeHtml(claim.category || "")}</td>
              <td>${escapeHtml(claim.substantiation || "")}</td>
              <td>${(claim.evidence || []).map((entry) => `<span class="tag">${escapeHtml(entry)}</span>`).join(" ")}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody></table></div>`
          : `<div class="empty-inline">${t("noClaims")}</div>`
      }
    </div>
    <div class="section-block">
      <h2>${t("bannedPhrases")}</h2>
      ${
        claimRules.length
          ? `<div class="table-wrap"><table>
        <thead><tr>
          <th>${t("phrase")}</th><th>${t("severity")}</th><th>${t("reason")}</th><th>${t("alternative")}</th>
        </tr></thead>
        <tbody>
          ${claimRules
            .map(
              (rule) => `
            <tr id="claimrule-${escapeHtml(rule.rule_id)}">
              <td class="strong">${escapeHtml(rule.phrase)}</td>
              <td>${severityBadge(rule.severity || "error")} <span class="tag">${escapeHtml(enumLabel(rule.type, "claim"))}</span></td>
              <td>${escapeHtml(rule.reason || "")}</td>
              <td>${rule.alternative ? `<span class="tag">${escapeHtml(rule.alternative)}</span>` : ""}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody></table></div>`
          : `<div class="empty-inline">${t("noClaimRules")}</div>`
      }
    </div>
  `;
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = t("localFilesOnly");
  const summary = state.settings?.config_summary || {};
  const seller = summary.seller || {};
  const exportPrefs = summary.export || {};
  const publish = summary.publish || {};
  els.content.innerHTML = `
    <div class="settings">
      <section>
        <h2>${t("configuration")}</h2>
        <dl>
          <dt>${t("dataProvider")}</dt><dd>${escapeHtml(state.settings?.data_provider || "local")}</dd>
          <dt>${t("configPath")}</dt><dd>${escapeHtml(summary.config_path || "")}</dd>
          <dt>${t("onboarding")}</dt><dd>${state.settings?.onboarding?.completed ? t("completed") : t("incomplete")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("seller")}</h2>
        <dl>
          <dt>${t("brand")}</dt><dd>${escapeHtml(seller.brand || "")}</dd>
          <dt>${t("entity")}</dt><dd>${escapeHtml(seller.entity || "")}</dd>
          <dt>${t("tone")}</dt><dd>${escapeHtml(seller.tone || "")}</dd>
          <dt>${t("locales")}</dt><dd>${(summary.locales || []).map(localeBadge).join(" ")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("platforms")} · ${t("rules")}</h2>
        ${
          (summary.platforms || [])
            .map((entry) => {
              const rulesList = Object.entries(entry.rules || {})
                .map(
                  ([key, value]) =>
                    `<span class="tag">${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? value.join(", ") : String(value))}</span>`,
                )
                .join(" ");
              return `
            <div class="settings-row">
              <strong>${escapeHtml(enumLabel(entry.platform, "platform"))}</strong>
              <span>${(entry.locales || []).map(localeBadge).join(" ")}</span>
              <span class="${entry.enabled ? "ok" : "warn"}">${entry.enabled ? t("yes") : t("no")}</span>
              <div class="chip-list rule-chips">${rulesList}</div>
            </div>
          `;
            })
            .join("") || `<div class="empty-inline">${t("setupNeeded")}</div>`
        }
      </section>
      <section>
        <h2>${t("bannedWords")} · ${t("competitorBrands")}</h2>
        <dl>
          <dt>${t("bannedWords")}</dt><dd>${summary.banned_words_count || 0}</dd>
          <dt>${t("competitorBrands")}</dt><dd>${summary.competitor_brands_count || 0}</dd>
          <dt>${t("maxRepeats")}</dt><dd>${summary.keyword_stuffing?.max_repeats || 3}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("exportPrefs")}</h2>
        <dl>
          <dt>${t("format")}</dt><dd>${escapeHtml(exportPrefs.format || "markdown+csv")}</dd>
          <dt>${t("outDir")}</dt><dd>${escapeHtml(exportPrefs.out_dir || "exports")}</dd>
        </dl>
      </section>
      <section>
        <h2>${t("publishHandoff")}</h2>
        <dl>
          <dt>${t("handoffToAgent")}</dt><dd>${publish.handoff_to_agent ? t("byAgentAfterApproval") : t("no")}</dd>
          <dt>${t("requiresApproval")}</dt><dd>${publish.requires_approval ? t("yes") : t("no")}</dd>
        </dl>
        ${
          (publish.secret_envs || []).length
            ? `
          <div class="settings-row">
            <strong>${(publish.secret_envs || []).join(", ")}</strong>
            <span></span>
            <span class="${publish.secrets_ready ? "ok" : "warn"}">${publish.secrets_ready ? t("secretsReady") : t("missingSecrets")}</span>
          </div>
        `
            : ""
        }
      </section>
    </div>
  `;
}
