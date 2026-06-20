let state = null;
let view = "overview";
let selectedId = null;
let query = "";

const $ = (id) => document.getElementById(id);

const viewMeta = {
  overview: ["总览", "项目健康度与创作入口"],
  characters: ["人物库", "角色卡、演员设定、三视图和一致性锚点"],
  relationships: ["关系网", "公开关系、隐藏真相、权力方向和证据集"],
  episodes: ["剧集", "分级剧情、节拍、反转和悬念"],
  shots: ["分镜生图", "画面、镜头、生图提示词和负面提示词"],
  tasks: ["任务", "人工判断、AI 改稿请求和导出准备"],
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

function render() {
  if (!state) return;
  updateChrome();
  if (view === "overview") renderOverview();
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
  `;
  $("detail").innerHTML = seriesForm(p.series || {});
  bindForm();
}

function overviewCard(title, body, target) {
  return `<button class="item-card" data-go="${target}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></button>`;
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
  return `
    <form class="detail-card" data-kind="characters" data-id="${escapeHtml(item.id)}">
      <h2>${escapeHtml(item.name || "新角色")}</h2>
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
      render();
    });
  });
  document.querySelectorAll("[data-select]").forEach((node) => {
    node.addEventListener("click", () => {
      selectedId = node.dataset.select;
      render();
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
    render();
  }
});

$("searchInput").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});

$("newItemButton").addEventListener("click", newItem);

load().catch((error) => {
  document.body.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
