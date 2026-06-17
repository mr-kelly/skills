const stages = [
  { id: "topics", label: "选题", caption: "题材与标题描述方向" },
  { id: "main", label: "主稿", caption: "主 Blog 与配图" },
  { id: "distribution", label: "分发", caption: "公众号、小红书、NewsNet" },
  { id: "outputs", label: "产物", caption: "已发布与归档" }
];

let state = { batch: null, decisions: {}, lock: null };
let activeStage = "topics";
let selectedTopicId = null;
let selectedDirectionId = null;
let selectedDistributionId = null;
let outputFilter = "all";
let outputSort = "newest";
let editing = false;

const els = {
  stageNav: document.querySelector("#stageNav"),
  stagePanel: document.querySelector("#stagePanel"),
  batchMeta: document.querySelector("#batchMeta"),
  lockText: document.querySelector("#lockText"),
  settingsText: document.querySelector("#settingsText"),
  pageTitle: document.querySelector("#pageTitle"),
  refreshBtn: document.querySelector("#refreshBtn")
};

els.refreshBtn.addEventListener("click", () => loadState());

loadState();
setInterval(() => {
  if (!editing) loadState();
}, 3000);

async function loadState() {
  const response = await fetch("/api/state");
  state = await response.json();
  const repo = buildRepository();
  selectedTopicId ||= repo.topics[0]?.id || null;
  selectedDistributionId ||= repo.distribution[0]?.id || null;
  render(repo);
}

function buildRepository() {
  const batch = state.batch || {};
  const items = Array.isArray(batch.items) ? batch.items : [];
  const topics = normalizeTopics(batch, items);
  const main = normalizeMainContent(batch, topics, items);
  const distribution = normalizeDistribution(batch, items);
  const outputs = normalizeOutputs(batch, distribution);
  return { batch, topics, main, distribution, outputs };
}

function normalizeTopics(batch, items) {
  if (Array.isArray(batch.topics) && batch.topics.length) return batch.topics.map(normalizeTopic);
  const idea = batch.canonical_idea || batch.source_summary || "Turn one source idea into a durable content system.";
  const source = batch.source === "kelly-content" ? "system" : "preset";
  return [
    {
      id: "topic-main",
      title: smartTitle(idea),
      source,
      status: "confirmed",
      score: 92,
      audience: "solo founders and creators",
      subject: "Long-form content repurposing system",
      evidence: batch.source_summary || items[0]?.summary || "",
      directions: [
        {
          id: "dir-main-system",
          title: "A calmer way to repurpose one blog into many posts",
          description: "Position the piece as an operating system for turning one canonical article into platform-specific drafts without diluting the original claim.",
          angle: "Systematic, practical, calm",
          status: "selected"
        },
        {
          id: "dir-proof-first",
          title: "Stop copying posts across platforms. Preserve proof instead.",
          description: "Lead with the common mistake, then show why proof and promise stay stable while hook, pacing, and media change by channel.",
          angle: "Contrarian lesson",
          status: "ready"
        },
        {
          id: "dir-creator-workflow",
          title: "The solo creator's content repurposing checklist",
          description: "Frame the same topic as a checklist for founders and creators who want a repeatable publishing flow from one main blog.",
          angle: "Checklist and workflow",
          status: "ready"
        }
      ]
    },
    {
      id: "topic-xhs",
      title: "主稿拆成小红书收藏型内容",
      source: "preset",
      status: "ready",
      score: 84,
      audience: "中文创作者",
      subject: "小红书内容再包装",
      evidence: "Derived from the Xiaohongshu distribution draft.",
      directions: [
        {
          id: "dir-xhs-save",
          title: "别急着发长文，先拆成这 7 页小红书",
          description: "强调收藏价值和 carousel 结构，适合把主稿拆成方法型图文。",
          angle: "收藏型教程",
          status: "ready"
        },
        {
          id: "dir-xhs-mistake",
          title: "很多人做内容分发，第一步就错了",
          description: "用反常识开头，指出复制粘贴不是分发，真正要改的是包装。",
          angle: "反常识提醒",
          status: "ready"
        }
      ]
    },
    {
      id: "topic-system",
      title: "内容系统不是复制粘贴",
      source: "system",
      status: "ready",
      score: 81,
      audience: "content operators",
      subject: "跨平台内容系统",
      evidence: batch.canonical_idea || "",
      directions: [
        {
          id: "dir-system-principle",
          title: "内容系统的核心：保留主张，改变包装",
          description: "解释为什么每个平台需要不同 wrapper，但主张、证据和例子不能变形。",
          angle: "Principle essay",
          status: "ready"
        },
        {
          id: "dir-system-operator",
          title: "给内容运营的一张分发判断表",
          description: "把题材做成一张判断表，帮助运营决定哪些内容适合公众号、小红书或 NewsNet。",
          angle: "Operator tool",
          status: "ready"
        }
      ]
    }
  ].map(normalizeTopic);
}

function normalizeMainContent(batch, topics, items) {
  if (batch.main_content) return batch.main_content;
  const confirmed = topics.find((topic) => topic.status === "confirmed") || topics[0];
  const selectedDirection = getSelectedDirection(confirmed);
  const title = selectedDirection?.title || confirmed?.title || "Building a calmer content system";
  const body = stripMarkdown(batch.source_summary || items[0]?.summary || "A strong blog post should be the source of many smaller pieces.");
  return {
    id: "main-blog",
    title,
    status: "draft",
    hero_alt: "Editorial cover preview",
    cover_brief: "A clean workspace image: one canonical article connected to several publishing channels.",
    dek: selectedDirection?.description || "A canonical post that keeps the core claim, proof, and examples intact before channel adaptation.",
    html: `
      <p>${escapeHtml(body)}</p>
      <h3>Core structure</h3>
      <p>Start with the reader problem, preserve the proof from the source, then reshape the content for each channel's reading habit.</p>
      <figure>
        <div class="inlineImage">Main visual brief</div>
        <figcaption>${escapeHtml("Use a simple diagram or screenshot sequence to show source -> channel variants.")}</figcaption>
      </figure>
      <h3>Distribution principle</h3>
      <p>The main claim should remain stable. The hook, pacing, CTA, and media treatment can change per platform.</p>
    `
  };
}

function normalizeDistribution(batch, items) {
  const source = Array.isArray(batch.distribution) && batch.distribution.length ? batch.distribution : items;
  return source.map((item, index) => ({
    ...item,
    id: item.id || `dist-${index + 1}`,
    channel: normalizeChannel(item.channel),
    status: itemStatus(item),
    owner: item.owner || "Kelly Content",
    readiness: readinessFor(itemStatus(item)),
    title: item.title || `${item.channel || "Channel"} draft`,
    body: item.body || "",
    summary: item.summary || "",
    cta: item.cta || "",
    media_brief: item.media_brief || ""
  }));
}

function normalizeOutputs(batch, distribution) {
  if (Array.isArray(batch.outputs) && batch.outputs.length) return batch.outputs;
  return distribution.map((item, index) => ({
    id: `output-${item.id}`,
    title: item.title,
    channel: item.channel,
    status: item.status === "approved" || item.status === "done" ? "published" : "draft",
    published_at: item.status === "done" ? "2026-06-16" : "",
    updated_at: item.decision?.decided_at || state.decisions[item.id]?.decided_at || "2026-06-16",
    owner: item.owner || "Kelly Content",
    url: "",
    performance: index === 0 ? { views: 1280, saves: 74, clicks: 18 } : { views: 0, saves: 0, clicks: 0 }
  }));
}

function render(repo) {
  renderShell(repo);
  renderStage(repo);
}

function renderShell(repo) {
  const batch = repo.batch;
  els.batchMeta.textContent = batch?.batch_id ? `${batch.batch_id} · ${repo.distribution.length} drafts` : "No batch loaded";
  els.lockText.textContent = state.lock ? `Locked: ${state.lock.message}` : "Local workspace · publishing disabled";
  els.settingsText.textContent = `${state.config_summary?.provider || "local"} data · ${repo.topics.length} topics · ${repo.outputs.length} outputs`;
  els.pageTitle.textContent = stages.find((stage) => stage.id === activeStage)?.label || "Content Repository";

  const counts = {
    topics: repo.topics.length,
    main: repo.main ? 1 : 0,
    distribution: repo.distribution.length,
    outputs: repo.outputs.length
  };

  els.stageNav.innerHTML = stages.map((stage) => `
    <button class="stageButton ${stage.id === activeStage ? "active" : ""}" data-stage="${stage.id}" title="${escapeAttr(stage.caption)}">
      <span>${stage.label}</span>
      <small>${stage.caption}</small>
      <em>${counts[stage.id] || 0}</em>
    </button>
  `).join("");

  for (const button of els.stageNav.querySelectorAll("[data-stage]")) {
    button.addEventListener("click", () => {
      activeStage = button.dataset.stage;
      render(buildRepository());
    });
  }
}

function renderStage(repo) {
  if (!state.batch) {
    els.stagePanel.className = "stagePanel empty";
    els.stagePanel.innerHTML = "<p>Generate a content batch, then the repository will appear here.</p>";
    return;
  }

  els.stagePanel.className = "stagePanel";
  if (activeStage === "topics") renderTopics(repo);
  if (activeStage === "main") renderMainContent(repo);
  if (activeStage === "distribution") renderDistribution(repo);
  if (activeStage === "outputs") renderOutputs(repo);
}

function renderTopics(repo) {
  const selected = repo.topics.find((topic) => topic.id === selectedTopicId) || repo.topics[0];
  selectedTopicId = selected?.id || null;
  selectedDirectionId = selected?.directions?.some((direction) => direction.id === selectedDirectionId)
    ? selectedDirectionId
    : getSelectedDirection(selected)?.id || selected?.directions?.[0]?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Subject Discovery</p>
        <h2>题材池</h2>
      </div>
      <button class="quietButton" title="Refresh subjects">Refresh</button>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.topics.map((topic) => topicRow(topic, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? topicDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("topic", (id) => {
    selectedTopicId = id;
    selectedDirectionId = null;
    renderTopics(repo);
  });
  bindRecordSelection("direction", (id) => {
    selectedDirectionId = id;
    renderTopics(repo);
  });
}

function topicRow(topic, selectedId) {
  return `
    <button class="recordRow ${topic.id === selectedId ? "selected" : ""}" data-topic="${escapeAttr(topic.id)}">
      <span class="statusDot ${topic.status}"></span>
      <strong>${escapeHtml(topic.title)}</strong>
      <small>${escapeHtml(topic.source)} · ${topic.directions?.length || 0} directions · score ${topic.score || "-"}</small>
    </button>
  `;
}

function topicDetail(topic) {
  const directions = topic.directions || [];
  const selectedDirection = directions.find((direction) => direction.id === selectedDirectionId) || directions[0];
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(topic.source)}</span>
        <span class="pill">${escapeHtml(topic.status)}</span>
      </div>
      <button class="primaryButton" title="Confirm selected title and description direction">Confirm title + description</button>
    </div>
    <h2>${escapeHtml(topic.title)}</h2>
    <dl class="metaGrid">
      <div><dt>Audience</dt><dd>${escapeHtml(topic.audience || "Not set")}</dd></div>
      <div><dt>Score</dt><dd>${escapeHtml(topic.score || "-")}</dd></div>
    </dl>
    <section class="sectionBlock">
      <h3>题材</h3>
      <p>${escapeHtml(topic.subject || topic.title || "")}</p>
    </section>
    <div class="directionLayout">
      <div class="directionList">
        ${directions.map((direction) => directionCard(direction, selectedDirection?.id)).join("")}
      </div>
      <section class="directionPreview">
        <p class="eyebrow">Selected Direction</p>
        <h3>${escapeHtml(selectedDirection?.title || "No direction selected")}</h3>
        <p>${escapeHtml(selectedDirection?.description || "Choose a title and description direction for this subject.")}</p>
        <dl class="miniMeta">
          <div><dt>Angle</dt><dd>${escapeHtml(selectedDirection?.angle || "-")}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(selectedDirection?.status || "-")}</dd></div>
        </dl>
      </section>
    </div>
    <section class="sectionBlock">
      <h3>Evidence</h3>
      <p>${escapeHtml(topic.evidence || "No source evidence attached yet.")}</p>
    </section>
  `;
}

function directionCard(direction, selectedId) {
  return `
    <button class="directionCard ${direction.id === selectedId ? "selected" : ""}" data-direction="${escapeAttr(direction.id)}">
      <span>${escapeHtml(direction.status || "ready")}</span>
      <strong>${escapeHtml(direction.title)}</strong>
      <small>${escapeHtml(direction.description)}</small>
    </button>
  `;
}

function renderMainContent(repo) {
  const main = repo.main;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Canonical Draft</p>
        <h2>主稿与配图</h2>
      </div>
      <div class="toolbar">
        <button class="quietButton" title="Preview HTML">Preview</button>
        <button class="primaryButton" title="Approve main draft">Approve main</button>
      </div>
    </div>
    <article class="mainPreview">
      <div class="coverFrame">
        <span>Cover</span>
        <strong>${escapeHtml(main.cover_brief || main.hero_alt || "Visual brief")}</strong>
      </div>
      <div class="articleShell">
        <span class="pill">${escapeHtml(main.status || "draft")}</span>
        <h1>${escapeHtml(main.title)}</h1>
        <p class="dek">${escapeHtml(main.dek || "")}</p>
        <div class="articleBody">${main.html || `<p>${escapeHtml(main.body || "")}</p>`}</div>
      </div>
    </article>
  `;
}

function renderDistribution(repo) {
  const selected = repo.distribution.find((item) => item.id === selectedDistributionId) || repo.distribution[0];
  selectedDistributionId = selected?.id || null;
  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Channel Adaptation</p>
        <h2>分发版本</h2>
      </div>
      <div class="toolbar">
        <button class="quietButton" title="Validate all drafts">Validate</button>
        <button class="primaryButton" title="Export approved drafts">Export</button>
      </div>
    </div>
    <div class="split">
      <div class="recordList">
        ${repo.distribution.map((item) => distributionRow(item, selected?.id)).join("")}
      </div>
      <article class="canvas">
        ${selected ? distributionDetail(selected) : ""}
      </article>
    </div>
  `;
  bindRecordSelection("distribution", (id) => {
    selectedDistributionId = id;
    renderDistribution(repo);
  });
  bindEditorActions(selected?.id);
}

function distributionRow(item, selectedId) {
  return `
    <button class="recordRow ${item.id === selectedId ? "selected" : ""}" data-distribution="${escapeAttr(item.id)}">
      <span class="channelMark">${escapeHtml(channelInitial(item.channel))}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.channel)} · ${escapeHtml(item.readiness)}</small>
    </button>
  `;
}

function distributionDetail(item) {
  const decision = state.decisions[item.id] || {};
  const title = decision.title || item.title || "";
  const body = decision.body || item.body || "";
  const comment = decision.comment || "";
  return `
    <div class="canvasHead">
      <div>
        <span class="pill">${escapeHtml(item.channel)}</span>
        <span class="pill">${escapeHtml(item.status)}</span>
      </div>
      <div class="actions">
        <button data-action="approve" title="Approve this version">Approve</button>
        <button data-action="revise" title="Save edits">Save</button>
        <button data-action="block" title="Block this version">Block</button>
      </div>
    </div>
    <label>Title
      <input id="titleInput" value="${escapeAttr(title)}">
    </label>
    <label>Draft
      <textarea id="bodyInput">${escapeHtml(body)}</textarea>
    </label>
    <label>Review note
      <textarea id="commentInput" class="note">${escapeHtml(comment)}</textarea>
    </label>
    <div class="supportGrid">
      ${item.title_options?.length ? `<section class="sectionBlock"><h3>Title Options</h3><p>${item.title_options.map(escapeHtml).join("<br>")}</p></section>` : ""}
      ${item.media_brief ? `<section class="sectionBlock"><h3>Media Brief</h3><p>${escapeHtml(item.media_brief)}</p></section>` : ""}
      ${item.hashtags?.length ? `<section class="sectionBlock"><h3>Hashtags</h3><p>${item.hashtags.map(escapeHtml).join(" ")}</p></section>` : ""}
    </div>
  `;
}

function renderOutputs(repo) {
  const outputs = repo.outputs
    .filter((item) => outputFilter === "all" || item.status === outputFilter)
    .sort((a, b) => outputSort === "channel"
      ? a.channel.localeCompare(b.channel)
      : String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  els.stagePanel.innerHTML = `
    <div class="stageHeader">
      <div>
        <p class="eyebrow">Published Assets</p>
        <h2>产物库</h2>
      </div>
      <div class="toolbar">
        <select id="outputFilter" title="Filter outputs">
          <option value="all">All</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select id="outputSort" title="Sort outputs">
          <option value="newest">Newest</option>
          <option value="channel">Channel</option>
        </select>
      </div>
    </div>
    <div class="tableShell">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Views</th>
            <th>Saves</th>
            <th>Clicks</th>
          </tr>
        </thead>
        <tbody>
          ${outputs.map(outputRow).join("")}
        </tbody>
      </table>
    </div>
  `;

  const filterSelect = document.querySelector("#outputFilter");
  const sortSelect = document.querySelector("#outputSort");
  filterSelect.value = outputFilter;
  sortSelect.value = outputSort;
  filterSelect.addEventListener("change", () => {
    outputFilter = filterSelect.value;
    renderOutputs(repo);
  });
  sortSelect.addEventListener("change", () => {
    outputSort = sortSelect.value;
    renderOutputs(repo);
  });
}

function outputRow(item) {
  return `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong></td>
      <td>${escapeHtml(item.channel)}</td>
      <td><span class="pill">${escapeHtml(item.status)}</span></td>
      <td>${escapeHtml(item.updated_at || item.published_at || "-")}</td>
      <td>${escapeHtml(item.performance?.views ?? 0)}</td>
      <td>${escapeHtml(item.performance?.saves ?? 0)}</td>
      <td>${escapeHtml(item.performance?.clicks ?? 0)}</td>
    </tr>
  `;
}

function bindRecordSelection(kind, onSelect) {
  for (const row of els.stagePanel.querySelectorAll(`[data-${kind}]`)) {
    row.addEventListener("click", () => onSelect(row.dataset[kind]));
  }
}

function normalizeTopic(topic) {
  const directions = Array.isArray(topic.directions) && topic.directions.length
    ? topic.directions
    : [{
      id: `${topic.id || "topic"}-direction-1`,
      title: topic.title || "Untitled direction",
      description: topic.description || topic.angle || "No description yet.",
      angle: topic.angle || "General",
      status: topic.status === "confirmed" ? "selected" : "ready"
    }];
  return {
    ...topic,
    subject: topic.subject || topic.topic || topic.title,
    directions
  };
}

function getSelectedDirection(topic) {
  if (!topic?.directions?.length) return null;
  return topic.directions.find((direction) => direction.status === "selected" || direction.status === "confirmed") || topic.directions[0];
}

function bindEditorActions(id) {
  if (!id) return;
  for (const input of els.stagePanel.querySelectorAll("input, textarea")) {
    input.addEventListener("focus", () => { editing = true; });
    input.addEventListener("blur", () => { editing = false; });
  }
  for (const button of els.stagePanel.querySelectorAll("[data-action]")) {
    button.disabled = Boolean(state.lock);
    button.addEventListener("click", () => saveDecision(id, button.dataset.action));
  }
}

async function saveDecision(id, action) {
  const payload = {
    id,
    action,
    title: document.querySelector("#titleInput")?.value || "",
    body: document.querySelector("#bodyInput")?.value || "",
    comment: document.querySelector("#commentInput")?.value || ""
  };
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    alert(`Could not save: ${await response.text()}`);
    return;
  }
  editing = false;
  await loadState();
}

function itemStatus(item) {
  const decision = state.decisions[item.id];
  if (decision?.action === "approve") return "approved";
  if (decision?.action === "block") return "blocked";
  if (decision?.action === "revise") return "needs_review";
  return item.status || "needs_review";
}

function readinessFor(status) {
  if (status === "approved" || status === "done") return "ready";
  if (status === "blocked") return "blocked";
  if (status === "needs_review") return "needs edit";
  return "to approve";
}

function normalizeChannel(channel = "") {
  const value = String(channel).toLowerCase();
  if (value === "x") return "X";
  if (value === "xiaohongshu") return "小红书";
  if (value === "wechat") return "公众号";
  if (value === "newsletter") return "NewsNet";
  if (value === "linkedin") return "LinkedIn";
  return channel || "Channel";
}

function channelInitial(channel) {
  return String(channel || "C").slice(0, 1).toUpperCase();
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]/g, "")
    .trim();
}

function smartTitle(value) {
  const clean = stripMarkdown(value);
  const firstSentence = clean.split(/(?<=[.!?。！？])\s+/)[0] || clean;
  const firstClause = firstSentence.split(/\s-\s|:|：/)[0] || firstSentence;
  return firstClause.length > 72 ? `${firstClause.slice(0, 69).trim()}...` : firstClause;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}
