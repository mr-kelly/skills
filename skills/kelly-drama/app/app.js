let state = null;
let view = "overview";
let selectedId = null;
let query = "";
let episodeMode = "list";
let episodeTab = "summary";
let imageConfig = null;

const $ = (id) => document.getElementById(id);

const viewMeta = {
  overview: ["背景", "短剧大背景、世界规则和创作入口"],
  characters: ["人物库", "角色卡、演员设定、三视图和一致性锚点"],
  relationships: ["人物关系图", "公开关系、隐藏真相、权力方向和证据集"],
  episodes: ["剧集", "先扫剧集表，再进入单集剧本和分镜执行层"],
  shots: ["分镜生图", "画面、镜头、生图提示词和负面提示词"],
  tasks: ["审批", "人工判断、AI 改稿请求和导出准备"],
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function arr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function lines(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function statusBadge(status) {
  const label = {
    draft: "草稿",
    needs_review: "待审",
    changes_requested: "需改稿",
    approved: "已定稿",
    done: "完成",
    blocked: "卡住",
  }[status] || status || "草稿";
  return `<span class="badge status-${escapeHtml(status || "draft")}">${escapeHtml(label)}</span>`;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

async function api(path, body = null) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function load() {
  state = await api("/api/state");
  imageConfig = await api("/api/image-config").catch(() => null);
  render();
}

function project() {
  return state?.project || {};
}

function collectionFor(currentView = view) {
  const p = project();
  if (currentView === "characters") return p.characters || [];
  if (currentView === "relationships") return p.relationships || [];
  if (currentView === "episodes") return p.episodes || [];
  if (currentView === "shots") return p.shots || [];
  if (currentView === "tasks") return p.tasks || [];
  return [];
}

function matches(item) {
  if (!query) return true;
  return JSON.stringify(item).toLowerCase().includes(query.toLowerCase());
}

function selectedItem() {
  return collectionFor().find((item) => String(item.id) === String(selectedId)) || collectionFor()[0] || null;
}

function characterName(id) {
  return (project().characters || []).find((character) => character.id === id)?.name || id || "";
}

function episodeTitle(id) {
  return (project().episodes || []).find((episode) => episode.id === id)?.title || id || "";
}

function updateChrome() {
  const p = project();
  document.body.classList.toggle("episodes-list-mode", view === "episodes" && episodeMode === "list");
  document.body.classList.toggle("episode-focus-mode", view === "episodes" && episodeMode === "detail");
  renderProjectSwitcher();
  $("projectTitle").textContent = p.series?.title || "未命名短剧";
  $("projectMeta").textContent = `${p.series?.genre || "类型未定"} · ${p.series?.format || "格式未定"}`;
  $("projectPath").textContent = state.paths?.project_path || "";
  $("attentionNeeds").textContent = state.attention?.needs_review || 0;
  $("attentionShots").textContent = state.completeness?.shots_missing_prompt || 0;
  $("attentionViews").textContent = state.completeness?.characters_missing_views || 0;
  $("lockBanner").classList.toggle("hidden", !state.lock?.locked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const [title, subtitle] = viewMeta[view];
  $("viewTitle").textContent = title;
  $("viewSubtitle").textContent = subtitle;
}

function renderProjectSwitcher() {
  const select = $("projectSelect");
  const projects = state.projects?.length ? state.projects : [{
    id: state.project?.project_id,
    title: state.project?.series?.title,
    genre: state.project?.series?.genre,
    format: state.project?.series?.format,
  }];
  const currentId = state.active_project_id || state.project?.project_id || projects[0]?.id || "";
  select.innerHTML = projects.map((item) => {
    const selected = item.id === currentId ? "selected" : "";
    return `<option value="${escapeHtml(item.id || item.title)}" ${selected}>${escapeHtml(item.title || "未命名短剧")}</option>`;
  }).join("");
  const current = projects.find((item) => item.id === currentId) || projects[0] || {};
  $("projectSwitchMeta").innerHTML = `
    <span>${escapeHtml(current.genre || state.project?.series?.genre || "")}</span>
    <span>${escapeHtml(current.format || state.project?.series?.format || "")}</span>
  `;
}

function render() {
  if (!state) return;
  updateChrome();
  if (view === "overview") renderOverview();
  else if (view === "episodes") renderEpisodesWorkspace();
  else renderListAndDetail();
}

function renderOverview() {
  const p = project();
  $("itemCount").textContent = "总览";
  $("newItemButton").style.visibility = "hidden";
  const list = $("list");
  list.innerHTML = `
    <div class="metrics">
      <div class="metric"><strong>${p.characters?.length || 0}</strong><span>人物</span></div>
      <div class="metric"><strong>${p.relationships?.length || 0}</strong><span>关系</span></div>
      <div class="metric"><strong>${p.episodes?.length || 0}</strong><span>剧集</span></div>
      <div class="metric"><strong>${p.shots?.length || 0}</strong><span>分镜</span></div>
    </div>
    ${overviewCard("人物一致性", `${state.completeness.characters_missing_views} 个角色缺三视图`, "characters")}
    ${overviewCard("剧情推进", `${state.completeness.episodes_missing_cliffhanger} 集缺少明确悬念`, "episodes")}
    ${overviewCard("分镜生图", `${state.completeness.shots_missing_prompt} 个分镜缺提示词`, "shots")}
    ${overviewCard("关系证据", `${state.completeness.relationships_missing_evidence} 条关系缺证据集`, "relationships")}
    ${visualBiblePreview(p.series?.visual_bible || {})}
  `;
  $("detail").innerHTML = seriesForm(p.series || {});
  bindForm();
}

function overviewCard(title, body, target) {
  return `<button class="item-card" data-go="${target}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></button>`;
}

function visualBiblePreview(bible) {
  const assets = bible.background_reference_assets || [];
  return `
    <section class="visual-bible-card">
      <div>
        <h3>画面基准</h3>
        <p>${escapeHtml(bible.format_note || "")}</p>
        <p class="muted">${escapeHtml(bible.realism_target || "")}</p>
      </div>
      <div class="reference-grid">
        ${assets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.title || "背景参考")}" /><figcaption>${escapeHtml(asset.title || "背景参考")}</figcaption></figure>`).join("") || `<div class="asset-placeholder">背景参考图待生成</div>`}
      </div>
    </section>`;
}

function renderListAndDetail() {
  $("newItemButton").style.visibility = "visible";
  const items = collectionFor().filter(matches);
  $("itemCount").textContent = String(items.length);
  if (!selectedId || !collectionFor().some((item) => item.id === selectedId)) selectedId = items[0]?.id || null;
  $("list").innerHTML = items.map(itemCard).join("") || `<div class="item-card"><h3>还没有内容</h3><p>点击右上角新建，先搭一个骨架。</p></div>`;
  $("detail").innerHTML = detailForm(selectedItem());
  bindForm();
}

function renderEpisodesWorkspace() {
  $("newItemButton").style.visibility = "visible";
  const allEpisodes = collectionFor("episodes");
  const items = allEpisodes.filter(matches).sort((a, b) => (a.number || 0) - (b.number || 0));
  $("itemCount").textContent = String(items.length);
  if (episodeMode === "detail" && (!selectedId || !allEpisodes.some((item) => item.id === selectedId))) {
    selectedId = items[0]?.id || null;
  }
  const workspace = document.querySelector(".workspace");
  workspace?.classList.toggle("episode-detail-mode", episodeMode === "detail");
  workspace?.classList.toggle("episodes-list-layout", episodeMode === "list");
  if (episodeMode === "detail") {
    $("list").innerHTML = episodeDetail(selectedItem());
    $("detail").innerHTML = "";
  } else {
    $("list").innerHTML = episodeTable(items);
    $("detail").innerHTML = "";
  }
  bindForm();
}

function episodeTable(items) {
  if (!items.length) {
    return `<div class="item-card"><h3>还没有剧集</h3><p>点击右上角新建，先搭一个单集骨架。</p></div>`;
  }
  return `
    <div class="episode-table-wrap">
      <table class="episode-table">
        <thead>
          <tr>
            <th>回</th>
            <th>剧集</th>
            <th>总结</th>
            <th>状态</th>
            <th>分镜</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((episode) => episodeRow(episode)).join("")}
        </tbody>
      </table>
    </div>`;
}

function episodeRow(episode) {
  const shots = shotsForEpisode(episode.id);
  const summary = episode.summary || episode.promise || "";
  return `
    <tr class="${episode.id === selectedId ? "active" : ""}">
      <td class="episode-no">${escapeHtml(String(episode.number || "").padStart(3, "0"))}</td>
      <td>
        <button class="episode-link" data-episode-detail="${escapeHtml(episode.id)}">${escapeHtml(episode.title || episode.id)}</button>
        <div class="table-sub">${escapeHtml(episode.source_chapter?.chapter_title || "")}</div>
      </td>
      <td>${escapeHtml(summary).slice(0, 86)}</td>
      <td>${statusBadge(episode.status)}</td>
      <td><span class="badge">${shots.length} 镜</span></td>
      <td><button class="mini-button table-action" data-episode-detail="${escapeHtml(episode.id)}">查看详情</button></td>
    </tr>`;
}

function shotsForEpisode(episodeId) {
  return (project().shots || []).filter((shot) => shot.episode_id === episodeId);
}

function episodeDetail(item) {
  if (!item) return `<div class="detail-card"><h2>选择一集</h2><p class="muted">从左侧剧集表格进入单集详情。</p></div>`;
  const shots = shotsForEpisode(item.id);
  return `
    <form class="detail-card episode-detail" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <button type="button" class="back-button" data-episode-list>返回剧集列表</button>
      <div class="detail-head">
        <div>
          <div class="eyebrow">约 3 分钟 · 单集工作台</div>
          <h2>${escapeHtml(item.title || "新一集")}</h2>
          <p>${escapeHtml(item.source_chapter?.work || "三国演义")} · 第 ${escapeHtml(item.source_chapter?.chapter_number || item.number || "")} 回 · ${escapeHtml(item.runtime || "about 3 minutes")}</p>
        </div>
        ${statusBadge(item.status)}
      </div>

      <div class="episode-tabs" role="tablist" aria-label="剧集详情">
        <button type="button" class="${episodeTab === "summary" ? "active" : ""}" data-episode-tab="summary">剧集总述</button>
        <button type="button" class="${episodeTab === "shots" ? "active" : ""}" data-episode-tab="shots">分镜详情</button>
      </div>

      ${episodeTab === "shots" ? episodeShotsTab(item, shots) : episodeSummaryTab(item)}
      ${episodeTab === "shots" ? `<div class="form-actions"><span class="muted">分镜详情当前用于查看执行层，编辑分镜可后续接到单镜头弹窗。</span></div>` : formActions()}
    </form>`;
}

function episodeSummaryTab(item) {
  return `
    <section class="script-section">
      <h3>单集总结</h3>
      <div class="form-grid">
        ${input("id", "剧集 ID", item.id)}
        ${input("number", "回目 / 集数", item.number || "", "number")}
        ${input("title", "标题", item.title)}
        ${statusSelect(item.status)}
        ${textarea("summary", "总结", item.summary || item.promise)}
        ${textarea("promise", "原著锚点 / 本集承诺", item.promise)}
        ${textarea("a_plot", "A 剧情", item.a_plot, false)}
        ${textarea("b_plot", "B 剧情", item.b_plot, false)}
        ${textarea("cliffhanger", "结尾悬念", item.cliffhanger)}
        ${textarea("beats_json", "节拍 JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
    </section>
    ${scriptPreview(item)}`;
}

function episodeShotsTab(item, shots) {
  return executionTimeline(item, shots);
}

function scriptPreview(item) {
  const beats = item.beats || [];
  return `
    <section class="script-section">
      <h3>剧本结构</h3>
      <div class="beat-stack">
        ${beats.map((beat, index) => `
          <article class="beat-row">
            <div class="beat-index">${String(index + 1).padStart(2, "0")}</div>
            <div>
              <strong>${escapeHtml(beat.label || beat.id)}</strong>
              <p>${escapeHtml(beat.hook || "")}</p>
              <p class="muted">${escapeHtml(beat.conflict || "")}</p>
            </div>
          </article>
        `).join("") || `<p class="muted">还没有节拍。</p>`}
      </div>
    </section>`;
}

function executionTimeline(item, shots) {
  const execution = item.execution || {};
  return `
    <section class="script-section">
      <div class="section-head">
        <div>
          <h3>Storyboard</h3>
          <p class="muted">分镜图使用 OpenAI-compatible Images API，本地保存生成结果。</p>
        </div>
      </div>
      ${imageConfigPanel()}
      <div class="execution-grid">
        <div class="execution-card">
          <span>01</span>
          <strong>镜头描述</strong>
          <p>${escapeHtml(execution.shot_description || "按下方分镜逐镜确认画面、构图、场景和镜头运动。")}</p>
        </div>
        <div class="execution-card">
          <span>02</span>
          <strong>台词 SRT</strong>
          <p>${escapeHtml(execution.srt_status || "先放样例台词和时间轴，后续再逐集精修。")}</p>
        </div>
        <div class="execution-card">
          <span>03</span>
          <strong>分镜图片</strong>
          <p>${escapeHtml(execution.image_status || "分镜图片先作为占位状态，不急着生成。")}</p>
        </div>
        <div class="execution-card">
          <span>04</span>
          <strong>最终分镜视频</strong>
          <p>${escapeHtml(execution.video_status || "视频生成保持未开始，只保留未来入口。")}</p>
        </div>
      </div>
      <div class="shot-stack">
        ${shots.map(shotPreview).join("") || `<div class="empty-shot">本集还没有独立分镜。可以先用剧本节拍推进，后面再补镜头。</div>`}
      </div>
    </section>`;
}

function imageConfigPanel() {
  const config = imageConfig || {};
  return `
    <form class="image-config" data-image-config>
      <div class="field">
        <label for="imageBaseUrl">BASE_URL</label>
        <input id="imageBaseUrl" name="base_url" value="${escapeHtml(config.base_url || "https://moonrouter.dev/v1")}" />
      </div>
      <div class="field">
        <label for="imageApiKey">API Key</label>
        <input id="imageApiKey" name="api_key" type="password" placeholder="${escapeHtml(config.has_api_key ? `已配置：${config.api_key_preview}` : "粘贴 API Key")}" value="" />
      </div>
      <div class="field">
        <label for="imageModel">模型</label>
        <input id="imageModel" name="model" value="${escapeHtml(config.model || "gpt-image-2")}" />
      </div>
      <div class="field">
        <label for="imageSize">尺寸</label>
        <select id="imageSize" name="size">
          ${["1024x1024", "1536x1024", "1024x1536"].map((size) => `<option value="${size}" ${size === (config.size || "1024x1024") ? "selected" : ""}>${size}</option>`).join("")}
        </select>
      </div>
      <button type="submit">保存图像配置</button>
    </form>`;
}

function shotPreview(shot) {
  const srt = shot.srt || [];
  return `
    <article class="shot-script-card">
      <div class="shot-script-head">
        <div>
          <span class="badge">${escapeHtml(shot.beat_id || "beat")}</span>
          <span class="badge">${escapeHtml(shot.duration_preset || `${shot.duration_seconds || ""}s` || "时长待定")}</span>
          <h4>${escapeHtml(shot.title || shot.id)}</h4>
        </div>
        ${statusBadge(shot.status)}
      </div>
      <div class="shot-pipeline">
        <div>
          <label>镜头描述</label>
          <p>${escapeHtml(shot.composition || "")}</p>
          <p class="muted">${escapeHtml([shot.camera, shot.setting, shot.lighting].filter(Boolean).join(" · "))}</p>
        </div>
        <div>
          <label>台词 SRT</label>
          <pre>${escapeHtml(srt.length ? srt.map(formatSrtLine).join("\n\n") : shot.dialogue_srt || "00:00:00,000 --> 00:00:03,000\n（待补台词）")}</pre>
        </div>
        <div>
          <label>分镜图片</label>
          ${storyboardImageBlock(shot)}
        </div>
        <div>
          <label>最终分镜视频</label>
          <div class="asset-placeholder">${escapeHtml(shot.video_asset || "暂不生成")}</div>
        </div>
      </div>
    </article>`;
}

function storyboardImageBlock(shot) {
  const asset = shot.image_asset || "";
  const isGenerated = asset.startsWith("/generated/");
  return `
    <div class="storyboard-image">
      ${isGenerated ? `<img src="${escapeHtml(asset)}" alt="${escapeHtml(shot.title || "分镜图")}" />` : `<div class="asset-placeholder">${escapeHtml(asset || "待生成")}</div>`}
      <button type="button" class="mini-button generate-image-button" data-generate-image="${escapeHtml(shot.id)}">生成分镜图</button>
    </div>`;
}

function formatSrtLine(line, index) {
  if (typeof line === "string") return line;
  return `${index + 1}\n${line.time || "00:00:00,000 --> 00:00:03,000"}\n${line.text || ""}`;
}

function itemCard(item) {
  const title = item.name || item.title || item.type || item.id;
  const body = item.logline || item.promise || item.conflict || item.note || item.prompt || item.character_card?.identity || item.hidden_truth || "";
  const meta = [
    item.role,
    item.type,
    item.status ? statusBadge(item.status) : "",
    item.number ? `<span class="badge">第 ${item.number} 集</span>` : "",
  ].filter(Boolean).map((part) => String(part).startsWith("<") ? part : `<span class="badge">${escapeHtml(part)}</span>`).join("");
  return `
    <button class="item-card ${item.id === selectedId ? "active" : ""}" data-select="${escapeHtml(item.id)}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body).slice(0, 180)}</p>
      <div class="card-meta">${meta}</div>
    </button>`;
}

function input(name, label, value = "", type = "text") {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" /></div>`;
}

function textarea(name, label, value = "", full = true) {
  return `<div class="field ${full ? "full" : ""}"><label for="${name}">${label}</label><textarea id="${name}" name="${name}">${escapeHtml(value)}</textarea></div>`;
}

function select(name, label, value, options) {
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
  </select></div>`;
}

function seriesForm(series) {
  return `
    <form class="detail-card" data-kind="series">
      <h2>系列设定</h2>
      <div class="form-grid">
        ${input("title", "剧名", series.title)}
        ${input("genre", "类型", series.genre)}
        ${input("platform", "平台/形态", series.platform)}
        ${input("format", "集数/时长", series.format)}
        ${input("tone", "气质", series.tone)}
        ${input("audience", "目标观众", series.audience)}
        ${textarea("logline", "一句话卖点", series.logline)}
        ${textarea("hook_rules", "钩子规则（一行一条）", lines(series.hook_rules))}
        ${textarea("world_rules", "世界规则（一行一条）", lines(series.world_rules))}
      </div>
      <div class="form-actions"><button type="submit">保存系列</button></div>
    </form>`;
}

function detailForm(item) {
  if (!item) return `<div class="detail-card"><h2>选择或新建一项</h2><p class="muted">这里会显示当前视图的编辑表单。</p></div>`;
  if (view === "characters") return characterForm(item);
  if (view === "relationships") return relationshipForm(item);
  if (view === "episodes") return episodeForm(item);
  if (view === "shots") return shotForm(item);
  if (view === "tasks") return taskForm(item);
  return "";
}

function statusSelect(value) {
  return select("status", "状态", value || "draft", ["draft", "needs_review", "changes_requested", "approved", "done", "blocked"]);
}

function characterForm(item) {
  const card = item.character_card || {};
  const visual = item.visual || {};
  const reference = item.reference_card || {};
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || "新角色")}</h2>
      ${characterReferencePreview(reference)}
      <div class="form-grid">
        ${input("id", "角色 ID", item.id)}
        ${input("name", "姓名", item.name)}
        ${input("role", "戏剧功能", item.role)}
        ${statusSelect(item.status)}
        ${textarea("actor_profile", "演员/表演设定", item.actor_profile)}
        ${textarea("identity", "身份", card.identity, false)}
        ${textarea("motivation", "欲望", card.motivation, false)}
        ${textarea("wound", "创伤", card.wound, false)}
        ${textarea("secret", "秘密", card.secret, false)}
        ${textarea("arc", "人物弧光", card.arc, false)}
        ${textarea("voice", "台词声音", card.voice, false)}
        ${textarea("front", "三视图：正面", visual.front, false)}
        ${textarea("side", "三视图：侧面", visual.side, false)}
        ${textarea("back", "三视图：背面", visual.back, false)}
        ${textarea("wardrobe", "服装", visual.wardrobe, false)}
        ${textarea("anchors", "一致性锚点（一行一条）", lines(visual.anchors))}
        ${textarea("forbidden_drift", "禁止漂移（一行一条）", lines(visual.forbidden_drift))}
      </div>
      ${formActions()}
    </form>`;
}

function characterReferencePreview(reference) {
  return `
    <section class="character-reference">
      <div>
        <h3>人物资料卡图</h3>
        <p class="muted">${escapeHtml(reference.purpose || "用于后续分镜和视频一致性。")}</p>
      </div>
      ${reference.image_asset ? `<img src="${escapeHtml(reference.image_asset)}" alt="人物资料卡图" />` : `<div class="asset-placeholder">人物资料卡图待生成</div>`}
    </section>`;
}

function relationshipForm(item) {
  return `
    <form class="detail-card" data-kind="relationships" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.type || "新关系")}</h2>
      <div class="form-grid">
        ${input("id", "关系 ID", item.id)}
        ${characterSelect("from", "关系起点", item.from)}
        ${characterSelect("to", "关系终点", item.to)}
        ${input("type", "关系类型", item.type)}
        ${input("emotional_temperature", "情感温度", item.emotional_temperature)}
        ${textarea("public_status", "公开关系", item.public_status, false)}
        ${textarea("hidden_truth", "隐藏真相", item.hidden_truth, false)}
        ${textarea("power_dynamic", "权力方向", item.power_dynamic, false)}
        ${textarea("conflict", "当前冲突", item.conflict)}
        ${textarea("evidence", "证据集（一行一条）", lines(item.evidence))}
      </div>
      ${relationshipPreview(item)}
      ${formActions()}
    </form>`;
}

function characterSelect(name, label, value) {
  const options = (project().characters || []).map((character) => character.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(characterName(id))}</option>`).join("")}
  </select></div>`;
}

function relationshipPreview(item) {
  return `<div class="relationship-node"><strong>${escapeHtml(characterName(item.from))}</strong> → <strong>${escapeHtml(characterName(item.to))}</strong><p>${escapeHtml(item.conflict || "")}</p></div>`;
}

function episodeForm(item) {
  return `
    <form class="detail-card" data-kind="episodes" data-id="${escapeHtml(item.id)}">
      <h2>第 ${escapeHtml(item.number || "")} 集：${escapeHtml(item.title || "")}</h2>
      <div class="form-grid">
        ${input("id", "剧集 ID", item.id)}
        ${input("number", "集数", item.number || "", "number")}
        ${input("title", "标题", item.title)}
        ${statusSelect(item.status)}
        ${textarea("promise", "本集承诺", item.promise)}
        ${textarea("a_plot", "A 剧情", item.a_plot, false)}
        ${textarea("b_plot", "B 剧情", item.b_plot, false)}
        ${textarea("cliffhanger", "结尾悬念", item.cliffhanger)}
        ${textarea("beats_json", "节拍 JSON", JSON.stringify(item.beats || [], null, 2))}
      </div>
      ${formActions()}
    </form>`;
}

function shotForm(item) {
  return `
    <form class="detail-card" data-kind="shots" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "新分镜")}</h2>
      <div class="form-grid">
        ${input("id", "分镜 ID", item.id)}
        ${episodeSelect("episode_id", "所属剧集", item.episode_id)}
        ${input("beat_id", "节拍 ID", item.beat_id)}
        ${input("title", "画面标题", item.title)}
        ${statusSelect(item.status)}
        ${textarea("characters", "出场角色 ID（一行一条）", lines(item.characters), false)}
        ${textarea("composition", "构图", item.composition, false)}
        ${textarea("camera", "镜头", item.camera, false)}
        ${textarea("setting", "场景", item.setting, false)}
        ${textarea("lighting", "光线", item.lighting, false)}
        ${textarea("prompt", "生图提示词", item.prompt)}
        ${textarea("negative_prompt", "负面提示词", item.negative_prompt)}
      </div>
      ${formActions()}
    </form>`;
}

function episodeSelect(name, label, value) {
  const options = (project().episodes || []).map((episode) => episode.id);
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">
    ${options.map((id) => `<option value="${escapeHtml(id)}" ${id === value ? "selected" : ""}>${escapeHtml(episodeTitle(id))}</option>`).join("")}
  </select></div>`;
}

function taskForm(item) {
  return `
    <form class="detail-card" data-kind="tasks" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.title || "新任务")}</h2>
      <div class="form-grid">
        ${input("id", "任务 ID", item.id)}
        ${input("kind", "类型", item.kind)}
        ${input("target_id", "目标 ID", item.target_id)}
        ${statusSelect(item.status)}
        ${input("title", "标题", item.title)}
        ${textarea("note", "说明 / @ai 请求", item.note)}
      </div>
      ${formActions()}
    </form>`;
}

function formActions() {
  return `<div class="form-actions"><button type="submit">保存</button><button type="button" class="danger" data-delete>删除</button><span class="muted">保存后写入本地 project.json</span></div>`;
}

function bindForm() {
  document.querySelectorAll("[data-go]").forEach((node) => {
    node.addEventListener("click", () => {
      view = node.dataset.go;
      selectedId = null;
      episodeMode = "list";
      episodeTab = "summary";
      render();
    });
  });
  document.querySelectorAll("[data-select]").forEach((node) => {
    node.addEventListener("click", () => {
      selectedId = node.dataset.select;
      render();
    });
  });
  document.querySelectorAll("[data-episode-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      selectedId = node.dataset.episodeDetail;
      episodeMode = "detail";
      episodeTab = "summary";
      render();
    });
  });
  document.querySelectorAll("[data-episode-list]").forEach((node) => {
    node.addEventListener("click", () => {
      episodeMode = "list";
      episodeTab = "summary";
      render();
    });
  });
  document.querySelectorAll("[data-episode-tab]").forEach((node) => {
    node.addEventListener("click", () => {
      episodeTab = node.dataset.episodeTab;
      render();
    });
  });
  const imageConfigForm = document.querySelector("[data-image-config]");
  if (imageConfigForm) {
    imageConfigForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const keepKey = !value(imageConfigForm, "api_key");
      imageConfig = await api("/api/image-config", {
        base_url: value(imageConfigForm, "base_url"),
        api_key: keepKey ? "__KEEP__" : value(imageConfigForm, "api_key"),
        model: value(imageConfigForm, "model"),
        size: value(imageConfigForm, "size"),
      });
      toast("图像配置已保存");
      render();
    });
  }
  document.querySelectorAll("[data-generate-image]").forEach((node) => {
    node.addEventListener("click", async () => {
      const shotId = node.dataset.generateImage;
      node.disabled = true;
      node.textContent = "生成中...";
      try {
        const result = await api("/api/storyboard-image", { shot_id: shotId });
        state = result.state || await api("/api/state");
        toast("分镜图已生成");
        render();
      } catch (error) {
        toast(error.message || "生成失败");
        node.disabled = false;
        node.textContent = "生成分镜图";
      }
    });
  });
  const form = document.querySelector("form.detail-card");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveForm(form);
  });
  const deleteButton = form.querySelector("[data-delete]");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!confirm("确定删除这一项？")) return;
      const kind = form.dataset.kind;
      const id = form.dataset.id;
      state = await api(`/api/${kind}/${encodeURIComponent(id)}`, { delete: true });
      selectedId = null;
      toast("已删除");
      render();
    });
  }
}

function value(form, name) {
  return form.elements[name]?.value ?? "";
}

async function saveForm(form) {
  const kind = form.dataset.kind;
  let payload;
  if (kind === "series") {
    payload = {
      title: value(form, "title"),
      genre: value(form, "genre"),
      platform: value(form, "platform"),
      format: value(form, "format"),
      tone: value(form, "tone"),
      audience: value(form, "audience"),
      logline: value(form, "logline"),
      hook_rules: arr(value(form, "hook_rules")),
      world_rules: arr(value(form, "world_rules")),
    };
    state = await api("/api/series", { series: payload });
  } else {
    payload = serializeItem(form, kind);
    state = await api(`/api/${kind}/${encodeURIComponent(payload.id)}`, payload);
    selectedId = payload.id;
  }
  toast("已保存");
  render();
}

function serializeItem(form, kind) {
  const base = { id: value(form, "id") || form.dataset.id };
  if (kind === "characters") {
    return {
      ...base,
      name: value(form, "name"),
      role: value(form, "role"),
      status: value(form, "status"),
      actor_profile: value(form, "actor_profile"),
      character_card: {
        identity: value(form, "identity"),
        motivation: value(form, "motivation"),
        wound: value(form, "wound"),
        secret: value(form, "secret"),
        arc: value(form, "arc"),
        voice: value(form, "voice"),
      },
      visual: {
        front: value(form, "front"),
        side: value(form, "side"),
        back: value(form, "back"),
        wardrobe: value(form, "wardrobe"),
        anchors: arr(value(form, "anchors")),
        forbidden_drift: arr(value(form, "forbidden_drift")),
      },
    };
  }
  if (kind === "relationships") {
    return {
      ...base,
      from: value(form, "from"),
      to: value(form, "to"),
      type: value(form, "type"),
      public_status: value(form, "public_status"),
      hidden_truth: value(form, "hidden_truth"),
      power_dynamic: value(form, "power_dynamic"),
      emotional_temperature: value(form, "emotional_temperature"),
      conflict: value(form, "conflict"),
      evidence: arr(value(form, "evidence")),
    };
  }
  if (kind === "episodes") {
    let beats = [];
    try {
      beats = JSON.parse(value(form, "beats_json") || "[]");
    } catch {
      throw new Error("节拍 JSON 格式不正确");
    }
    return {
      ...base,
      number: Number.parseInt(value(form, "number"), 10) || 0,
      title: value(form, "title"),
      status: value(form, "status"),
      summary: value(form, "summary"),
      promise: value(form, "promise"),
      a_plot: value(form, "a_plot"),
      b_plot: value(form, "b_plot"),
      cliffhanger: value(form, "cliffhanger"),
      beats,
    };
  }
  if (kind === "shots") {
    return {
      ...base,
      episode_id: value(form, "episode_id"),
      beat_id: value(form, "beat_id"),
      title: value(form, "title"),
      status: value(form, "status"),
      characters: arr(value(form, "characters")),
      composition: value(form, "composition"),
      camera: value(form, "camera"),
      setting: value(form, "setting"),
      lighting: value(form, "lighting"),
      prompt: value(form, "prompt"),
      negative_prompt: value(form, "negative_prompt"),
    };
  }
  return {
    ...base,
    kind: value(form, "kind"),
    target_id: value(form, "target_id"),
    status: value(form, "status"),
    title: value(form, "title"),
    note: value(form, "note"),
  };
}

function newItem() {
  const timestamp = Date.now().toString().slice(-5);
  const templates = {
    characters: { id: `char-new-${timestamp}`, name: "新角色", role: "helper", status: "draft", character_card: {}, visual: { anchors: [], forbidden_drift: [] } },
    relationships: { id: `rel-new-${timestamp}`, from: project().characters?.[0]?.id || "", to: project().characters?.[1]?.id || "", type: "new relationship", evidence: [] },
    episodes: { id: `ep-new-${timestamp}`, number: (project().episodes?.length || 0) + 1, title: "新一集", status: "draft", beats: [] },
    shots: { id: `shot-new-${timestamp}`, episode_id: project().episodes?.[0]?.id || "", title: "新分镜", status: "draft", characters: [] },
    tasks: { id: `task-new-${timestamp}`, kind: "episode", status: "needs_review", title: "新任务", note: "" },
  };
  const item = templates[view];
  selectedId = item.id;
  state.project[view].push(item);
  render();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    view = viewButton.dataset.view;
    selectedId = null;
    episodeMode = "list";
    episodeTab = "summary";
    render();
  }
});

$("searchInput").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

$("projectSelect").addEventListener("change", async () => {
  const option = $("projectSelect").selectedOptions[0];
  selectedId = null;
  episodeMode = "list";
  episodeTab = "summary";
  state = await api("/api/active-project", { project_id: $("projectSelect").value });
  toast(`已切换到《${option?.textContent || "当前短剧"}》`);
  render();
});

$("newItemButton").addEventListener("click", newItem);

load().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
