import {
  STATUS_ROUTES,
  activeLang,
  checks,
  currentProfile,
  els,
  entities,
  escapeAttr,
  escapeHtml,
  filteredItems,
  items,
  itemsForRoute,
  lockBanner,
  state,
  t,
  viewLabel,
} from "../app.js";
export function renderReview() {
  els.title.textContent = viewLabel(state.route.view);
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const list = itemsForRoute();
  const selected = itemById(state.route.id) || list[0] || items()[0];
  els.content.innerHTML = splitLayout(list, selected);
}

export function renderItems() {
  els.title.textContent = t("items");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const list = filteredItems();
  const selected = itemById(state.route.id) || list[0];
  els.content.innerHTML = splitLayout(list, selected);
}

function splitLayout(list, selected) {
  return `
    ${lockBanner()}
    <div class="split">
      <section class="list-panel">
        <div class="list-head"><strong>${list.length} ${escapeHtml(t("allItems"))}</strong></div>
        <div class="list">${list.map(rowHtml).join("") || emptyText()}</div>
      </section>
      <aside class="detail-panel">${selected ? detailHtml(selected) : `<div class="empty">${escapeHtml(t("noSelection"))}</div>`}</aside>
    </div>`;
}

export function rowHtml(item) {
  const base = state.route.view === "review" || STATUS_ROUTES.has(state.route.view) ? state.route.view : "items";
  const href = `#/${base}/${encodeURIComponent(item.id)}`;
  return `<a class="row ${state.route.id === item.id ? "active" : ""}" href="${href}">
    <div class="row-top"><strong>${escapeHtml(item.ref || item.title)}</strong><span class="status ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span></div>
    <div class="row-title">${escapeHtml(item.title)}</div>
    <p>${escapeHtml(item.summary || "")}</p>
    <div class="badges">${badge(item.category)}${(item.risk || []).map(badge).join("")}</div>
  </a>`;
}

function detailHtml(item) {
  const noteValue = state.edits.note[item.id] ?? item.review_note ?? "";
  const draftValue = state.edits.draft[item.id] ?? item.draft ?? "";
  const disabled = state.settings?.lock ? "disabled" : "";
  const profile = currentProfile();
  return `
    <div class="detail-actions">
      <a class="back-link" href="#/${state.route.view || "items"}">← ${escapeHtml(viewLabel(state.route.view))}</a>
      <button type="button" data-action="approve" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("approve"))}" ${disabled}>${escapeHtml(t("approve"))}</button>
      <button type="button" data-action="request_changes" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("requestChanges"))}" ${disabled}>${escapeHtml(t("requestChanges"))}</button>
      <button type="button" data-action="block" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("block"))}" ${disabled}>${escapeHtml(t("block"))}</button>
    </div>
    <article class="detail">
      <div class="detail-kicker">${escapeHtml(item.ref || "")} · ${escapeHtml(statusLabel(item.status))}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="summary">${escapeHtml(item.summary || "")}</p>
      <dl class="meta">
        <div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(item.owner || "")}</dd></div>
        <div><dt>${escapeHtml(t("category"))}</dt><dd>${escapeHtml(item.category || "")}</dd></div>
        <div><dt>${escapeHtml(t("risk"))}</dt><dd>${escapeHtml((item.risk || []).join(", "))}</dd></div>
      </dl>
      ${item.body ? `<section><h3>Context</h3><p>${escapeHtml(item.body)}</p></section>` : ""}
      ${item.recommendation ? `<section><h3>${escapeHtml(t("recommendation"))}</h3><p>${escapeHtml(item.recommendation)}</p></section>` : ""}
      ${businessDetailHtml(profile, item)}
      ${(item.evidence || []).length ? `<section><h3>${escapeHtml(t("evidence"))}</h3><ul>${item.evidence.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>` : ""}
      <label class="field"><span>${escapeHtml(t("editableDraft"))}</span><textarea data-draft="${escapeAttr(item.id)}">${escapeHtml(draftValue)}</textarea></label>
      <label class="field"><span>${escapeHtml(t("reviewNote"))}</span><textarea data-note="${escapeAttr(item.id)}">${escapeHtml(noteValue)}</textarea></label>
      <button class="secondary" type="button" data-action="revise" data-id="${escapeAttr(item.id)}" title="${escapeAttr(t("saveRevision"))}" ${disabled}>${escapeHtml(t("saveRevision"))}</button>
    </article>`;
}

function businessDetailHtml(profile, item) {
  if (profile.id === "precedent") {
    return `<section class="business-detail precedent-detail">
      <h3>${activeLang() === "zh" ? "类案匹配" : "Precedent matches"}</h3>
      <div class="match-stack detail-stack">${matchMeterHtml(item)}</div>
      <div class="citation-grid">${(item.evidence || []).map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div>
      ${fieldTile(activeLang() === "zh" ? "裁判尺度" : "Court pattern", field(item, "court_pattern", item.body))}
    </section>`;
  }
  if (profile.id === "matter") {
    return `<section class="business-detail matter-detail">
      <h3>${activeLang() === "zh" ? "争议策略结构" : "Strategy structure"}</h3>
      <div class="issue-board detail-board">
        ${issueTree(activeLang() === "zh" ? "争点树" : "Issue tree", field(item, "issue_tree", [item.category]))}
        ${issueColumn(activeLang() === "zh" ? "证据缺口" : "Evidence gaps", listValue(field(item, "evidence_gaps_list", field(item, "evidence_gaps"))))}
        ${issueColumn(activeLang() === "zh" ? "谈判选项" : "Negotiation options", listValue(field(item, "negotiation_options", [])))}
      </div>
      ${fieldTile(activeLang() === "zh" ? "文书大纲" : "Pleading outline", field(item, "pleading_outline", item.draft))}
    </section>`;
  }
  if (profile.id === "firm") {
    return `<section class="business-detail firm-detail">
      <h3>${activeLang() === "zh" ? "经营分析字段" : "Management analytics"}</h3>
      <div class="field-grid">
        ${fieldTile(activeLang() === "zh" ? "样本量" : "Sample size", field(item, "sample_size", ""))}
        ${fieldTile(activeLang() === "zh" ? "可公开案例" : "Public-citable", field(item, "public_citable", ""))}
        ${fieldTile(activeLang() === "zh" ? "律师数" : "Lawyers", field(item, "lawyer_count", ""))}
        ${fieldTile(activeLang() === "zh" ? "可见范围" : "Visibility", field(item, "visibility", ""))}
      </div>
      ${issueColumn(activeLang() === "zh" ? "质量指标" : "Quality indicators", listValue(field(item, "quality_indicators", item.evidence || [])))}
    </section>`;
  }
  return `<section class="business-detail casebase-detail">
    <h3>${activeLang() === "zh" ? "入库抽取与脱敏" : "Ingest extraction and redaction"}</h3>
    <div class="field-grid">
      ${fieldTile(activeLang() === "zh" ? "法院" : "Court", field(item, "court", ""))}
      ${fieldTile(activeLang() === "zh" ? "案由" : "Cause", field(item, "cause", item.category))}
      ${fieldTile(activeLang() === "zh" ? "程序" : "Procedure", field(item, "procedure", ""))}
      ${fieldTile(activeLang() === "zh" ? "裁判结果" : "Outcome", field(item, "outcome", ""))}
      ${fieldTile(activeLang() === "zh" ? "抽取置信度" : "Extraction confidence", percentText(field(item, "extraction_confidence", "")))}
      ${fieldTile(activeLang() === "zh" ? "重复分" : "Duplicate score", field(item, "duplicate_score", ""))}
    </div>
    <div class="redaction-rail">
      ${redactionStep(activeLang() === "zh" ? "当事人" : "Parties", field(item, "parties_redacted", true))}
      ${redactionStep(activeLang() === "zh" ? "账号电话" : "Accounts/contact", field(item, "contacts_redacted", true))}
      ${redactionStep(activeLang() === "zh" ? "商业秘密" : "Business secrets", !listValue(item.risk).includes("business_secret"))}
    </div>
  </section>`;
}

export function renderChecks() {
  els.title.textContent = t("checks");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  els.content.innerHTML = `<section class="panel checks">${
    checks()
      .map(
        (check) =>
          `<div class="check ${escapeHtml(check.status)}"><strong>${escapeHtml(check.label)}</strong><span>${escapeHtml(t(check.status))}</span><p>${escapeHtml(check.detail || "")}</p></div>`,
      )
      .join("") || emptyText()
  }</section>`;
}

function entityCard(entity) {
  return `<article class="entity business-entity">
    <div class="entity-meta">${escapeHtml(entity.meta || "")}</div>
    <h2>${escapeHtml(entity.title)}</h2>
    <p>${escapeHtml(entity.summary || "")}</p>
    <dl class="entity-facts">
      ${entity.owner ? `<div><dt>${escapeHtml(t("owner"))}</dt><dd>${escapeHtml(entity.owner)}</dd></div>` : ""}
      <div><dt>${escapeHtml(t("status"))}</dt><dd><span class="status ${escapeHtml(entity.status || "")}">${escapeHtml(statusLabel(entity.status))}</span></dd></div>
    </dl>
    ${
      entity.metrics
        ? `<div class="mini-metrics">${Object.entries(entity.metrics)
            .slice(0, 3)
            .map(([key, value]) => `<span><b>${escapeHtml(value)}</b>${escapeHtml(key.replaceAll("_", " "))}</span>`)
            .join("")}</div>`
        : ""
    }
    <div class="badges">${(entity.tags || []).map(badge).join("")}</div>
  </article>`;
}

export function renderEntities() {
  const profile = currentProfile();
  els.title.textContent = t("entities");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const list = entities();
  if (!list.length) {
    els.content.innerHTML = emptyText();
    return;
  }
  // Firm radar presents lawyer/practice-area profile cards; the other desks group their library.
  if (profile.id === "firm") {
    els.content.innerHTML = `<section class="entity-grid ${escapeAttr(profile.id)}-entities">${list.map(entityCard).join("")}</section>`;
    return;
  }
  const order = ["needs_review", "changes_requested", "approved", "done", "blocked"];
  const groups = new Map();
  for (const entity of list) {
    const key = entity.status || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entity);
  }
  const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  els.content.innerHTML = keys
    .map(
      (key) => `<section class="entity-group">
      <div class="panel-head"><h2>${escapeHtml(statusLabel(key))}</h2><span>${groups.get(key).length}</span></div>
      <div class="entity-grid ${escapeAttr(profile.id)}-entities">${groups.get(key).map(entityCard).join("")}</div>
    </section>`,
    )
    .join("");
}

export function renderSettings() {
  els.title.textContent = t("settings");
  els.subtitle.textContent = state.snapshot.workspace?.subtitle || "";
  const config = state.settings?.config_summary || {};
  els.content.innerHTML = `
    <section class="panel settings">
      <h2>${escapeHtml(t("config"))}</h2>
      ${jsonBlock(config)}
    </section>
    <section class="panel settings">
      <h2>${escapeHtml(t("onboarding"))}</h2>
      ${jsonBlock(state.settings?.onboarding || {})}
    </section>
    <section class="panel settings">
      <h2>${escapeHtml(t("executionReport"))}</h2>
      ${jsonBlock(state.settings?.execution_report || {})}
    </section>`;
}

function itemById(id) {
  return items().find((item) => item.id === id);
}

function statusLabel(status) {
  const labels = {
    needs_review: t("needsReview"),
    changes_requested: t("changesRequested"),
    approved: t("approved"),
    done: t("done"),
    blocked: t("blocked"),
  };
  return labels[status] || status;
}

function badge(value) {
  return value ? `<span class="badge">${escapeHtml(value)}</span>` : "";
}

export function field(item, key, fallback = "") {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : item?.metrics;
  return fields?.[key] ?? item?.[key] ?? fallback;
}

export function listValue(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(String);
  if (typeof value === "string" && value.trim()) return value.split(/\s*[;；]\s*/).filter(Boolean);
  return [];
}

export function sumField(key) {
  return items().reduce((sum, item) => sum + (Number(field(item, key, 0)) || 0), 0);
}

export function percentText(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${Math.round((number > 1 ? number : number * 100) * 10) / 10}%`;
}

export function fieldTile(label, value) {
  const display = Array.isArray(value) ? value.join(", ") : value;
  return `<div class="field-tile"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display || "—")}</strong></div>`;
}

export function redactionStep(label, passed) {
  return `<div class="redaction-step ${passed ? "pass" : "warn"}"><span></span><strong>${escapeHtml(label)}</strong></div>`;
}

export function matchMeterHtml(item) {
  const score = Number(field(item, "top_similarity", field(item, "avg_similarity", 0.78))) || 0.78;
  const pct = Math.max(8, Math.min(100, Math.round((score > 1 ? score / 100 : score) * 100)));
  return `<a class="match-meter" href="#/items/${encodeURIComponent(item.id)}">
    <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(field(item, "jurisdiction", item.category || ""))}</span></div>
    <div class="meter"><span style="width:${pct}%"></span></div>
    <b>${pct}%</b>
  </a>`;
}

export function issueColumn(title, values) {
  const list = listValue(values);
  return `<div class="issue-column"><h3>${escapeHtml(title)}</h3>${(list.length ? list : ["—"])
    .slice(0, 5)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("")}</div>`;
}

// Renders an issue tree: nested {label, children} nodes become an indented hierarchy;
// a flat string array falls back to a simple list.
export function issueTree(title, values) {
  const raw = Array.isArray(values) ? values : listValue(values);
  const nodes = raw.length ? raw : ["—"];
  return `<div class="issue-column issue-tree"><h3>${escapeHtml(title)}</h3><ul class="tree">${nodes
    .slice(0, 6)
    .map((node) => {
      if (node && typeof node === "object") {
        const label = node.label || node.issue || node.title || "";
        const children = listValue(node.children || node.subs || node.sub_issues);
        return `<li><span class="tree-node">${escapeHtml(label)}</span>${
          children.length ? `<ul>${children.map((child) => `<li>${escapeHtml(child)}</li>`).join("")}</ul>` : ""
        }</li>`;
      }
      return `<li><span class="tree-node">${escapeHtml(node)}</span></li>`;
    })
    .join("")}</ul></div>`;
}

export function practiceBarHtml(entity) {
  const size = Number(field(entity, "case_count", field(entity, "sample_size", 24))) || 24;
  const width = Math.max(18, Math.min(100, size * 2));
  return `<div class="practice-bar">
    <div><strong>${escapeHtml(entity.title)}</strong><span>${escapeHtml(entity.meta || "")}</span></div>
    <div class="bar"><span style="width:${width}%"></span></div>
    <b>${escapeHtml(size)}</b>
  </div>`;
}

export function activeHtml(zh, en) {
  return escapeHtml(activeLang() === "zh" ? zh : en);
}

export function emptyText() {
  return `<div class="empty">${escapeHtml(t("empty"))}</div>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

export function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(activeLang() === "zh" ? "zh-Hans" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
