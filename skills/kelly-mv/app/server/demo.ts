// Demo mode: deterministic mock data for documentation and screenshots.
// `/api/state?demo=<scene>&lang=en|zh` returns this payload instead of real
// project state. Demo mode never reads or writes anything under app/.data.

import type { DemoQuery } from "./types.ts";

const DEMO_UPDATED_AT = "2026-06-30T09:30:00.000Z";

export function isDemoQuery(query: DemoQuery = {}) {
  return Boolean(query.demo);
}

export function demoNotice(query: DemoQuery = {}) {
  return isZh(query)
    ? "演示模式：只读示例数据，不会写入任何项目文件。"
    : "Demo mode: read-only sample data. Nothing is written to project files.";
}

export function demoImageConfigPayload() {
  return {
    base_url: "https://demo.invalid/v1",
    model: "gpt-image-2",
    size: "1536x1024",
    has_api_key: false,
    api_key_preview: "",
    demo: true,
  };
}

export function demoSongConfigPayload(query: DemoQuery = {}) {
  return {
    draft_backend: "songgeneration-v2-mlx",
    prod_backend: null,
    draft_ready: false,
    note: demoNotice(query),
    demo: true,
  };
}

export function demoStatePayload(query: DemoQuery = {}) {
  const scenario = String(query.demo || "overview");
  const zh = isZh(query);
  const project = demoProject(zh);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-mv",
    project,
    projects: [
      {
        id: project.project_id,
        title: project.song.title,
        artist: project.song.artist,
        mode: project.treatment.mode,
      },
    ],
    active_project_id: project.project_id,
    paths: {
      project_path: "demo://kelly-mv/project.json",
      tasks_path: "demo://kelly-mv/agent_tasks.json",
      report_path: "demo://kelly-mv/execution_report.json",
    },
    counts: {
      characters: countBy(project.characters),
      shots: countBy(project.shots),
      tasks: countBy(project.tasks),
    },
    totals: {
      characters: project.characters.length,
      shots: project.shots.length,
      tasks: project.tasks.length,
    },
    completeness: completeness(project),
    attention: attention(project),
    next_step: nextStep(project),
    lock: { locked: false },
  };
}

// Synthetic placeholder assets served under /generated/demo/*. Everything is
// generated in memory — no project media files are ever referenced.
export function demoAsset(pathname) {
  const name = String(pathname || "").replace(/^\/generated\/demo\//, "");
  if (!name || name.includes("/") || name.includes("..")) return null;
  if (name.endsWith(".svg")) {
    return { type: "image/svg+xml", body: Buffer.from(placeholderSvg(name.replace(/\.svg$/, ""))) };
  }
  if (name.endsWith(".wav")) {
    return { type: "audio/wav", body: silentWav() };
  }
  return null;
}

function isZh(query: DemoQuery = {}) {
  return String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
}

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  return hash;
}

function placeholderSvg(label) {
  const hue = hashCode(label) % 360;
  const text = label.replace(/[-_]+/g, " ").toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="hsl(${hue}, 32%, 24%)"/>
  <rect x="24" y="24" width="1232" height="672" fill="none" stroke="hsl(${hue}, 40%, 62%)" stroke-width="4" stroke-dasharray="18 14"/>
  <text x="640" y="345" text-anchor="middle" font-family="system-ui, sans-serif" font-size="56" fill="hsl(${hue}, 45%, 86%)">${text}</text>
  <text x="640" y="415" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" fill="hsl(${hue}, 30%, 68%)">DEMO PLACEHOLDER</text>
</svg>`;
}

// One second of 8 kHz 16-bit mono silence — a valid, deterministic WAV so the
// demo song renders as a playable audio element.
function silentWav() {
  const sampleRate = 8000;
  const dataSize = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function countBy(items, field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function completeness(project) {
  const song = project.song || {};
  const shots = project.shots || [];
  return {
    song_ready: Boolean(song.audio_asset?.startsWith("/generated/")),
    concept_ready: Boolean(project.treatment?.summary || project.treatment?.concept),
    characters_missing_refs: (project.characters || []).filter(
      (c) => !c.reference_card?.image_asset?.startsWith("/generated/"),
    ).length,
    shots_missing_desc: shots.filter((s) => !String(s.description || "").trim()).length,
    shots_missing_image: shots.filter((s) => !s.image_asset?.startsWith("/generated/")).length,
    shots_missing_video: shots.filter((s) => !s.video_asset?.startsWith("/generated/")).length,
    shots_total_seconds: Math.round(shots.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0)),
    song_duration: Number(song.duration_seconds) || 0,
  };
}

function attention(project) {
  const all = [...project.tasks, ...project.characters, ...project.shots];
  return {
    needs_review: all.filter((item) => ["needs_review", "changes_requested"].includes(item.status)).length,
    approved: all.filter((item) => item.status === "approved").length,
    blocked: project.tasks.filter((task) => task.status === "blocked").length,
  };
}

function nextStep(project) {
  const c = completeness(project);
  if (!c.song_ready) return "upload_song";
  if (!c.concept_ready) return "set_concept";
  if ((project.characters || []).length === 0) return "add_cast";
  if (c.characters_missing_refs > 0) return "generate_cast_refs";
  if ((project.shots || []).length === 0) return "add_shots";
  if (c.shots_missing_image > 0) return "fill_shot_images";
  if (c.shots_missing_video > 0) return "fill_shot_videos";
  return "review";
}

function demoProject(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  const song = {
    title: L("Neon Tide", "霓虹潮汐"),
    artist: L("Mirror Line", "镜线乐队"),
    duration_seconds: 214,
    audio_asset: "/generated/demo/neon-tide.wav",
    source: "upload",
    uploaded_at: DEMO_UPDATED_AT,
  };
  const treatment = {
    mode: "pure-visual",
    summary: L(
      "One dancer crosses a coastal city from dusk to sunrise; every chorus, the city's neon 'tide' rises one street higher until light finally floods the rooftop.",
      "一位舞者从黄昏走到日出，横穿海滨城市；每到副歌，城市的霓虹'潮水'就漫高一条街，直到天光淹没天台。",
    ),
    look: L(
      "35mm film grain, wet asphalt reflections, sodium amber against teal neon.",
      "35mm 胶片颗粒、湿沥青反光、钠灯琥珀撞青色霓虹。",
    ),
    aspect_ratio: "16:9",
  };

  const characters = [
    castMember(
      "char-demo-dreamer",
      L("The Dreamer", "追光者"),
      L("lead dancer", "领舞 / 主角"),
      "approved",
      {
        front: L(
          "Early 20s, buzzed silver hair, reflective bomber jacket over black.",
          "二十出头，银色寸头，黑衣外罩反光飞行夹克。",
        ),
        side: L("Sharp profile, small tide-wave tattoo behind the left ear.", "侧脸轮廓利落，左耳后有小小的潮汐纹身。"),
        back: L("Jacket back reads a faded tide chart print.", "夹克背面是褪色的潮汐表印花。"),
        wardrobe: L(
          "Reflective bomber, black cargo trousers, worn white trainers.",
          "反光飞行夹克、黑色工装裤、旧白球鞋。",
        ),
        anchors: [L("silver buzz cut", "银色寸头"), L("reflective bomber jacket", "反光飞行夹克")],
        forbidden_drift: [L("no hats", "不戴帽子"), L("no color change on jacket", "夹克不得变色")],
      },
      L(
        "Cinematic full-body reference of the lead dancer under mixed neon, 35mm look.",
        "混合霓虹光下领舞的全身电影感定妆照，35mm 质感。",
      ),
      "/generated/demo/cast-dreamer.svg",
    ),
    castMember(
      "char-demo-stranger",
      L("The Stranger", "陌生人"),
      L("mirrored counterpart", "镜像对手"),
      "approved",
      {
        front: L(
          "Ageless, long charcoal coat, face half-lit at all times.",
          "年龄难辨，炭色长大衣，面部永远只被照亮一半。",
        ),
        side: L("Umbrella carried closed even in rain.", "雨中也始终收着伞。"),
        back: L("Coat hem always dry, no matter the weather.", "无论天气如何，大衣下摆永远是干的。"),
        wardrobe: L("Charcoal coat, closed black umbrella.", "炭色大衣、收拢的黑伞。"),
        anchors: [L("closed umbrella", "收拢的黑伞")],
        forbidden_drift: [L("never show both eyes lit", "双眼不得同时受光")],
      },
      L("Half-lit portrait reference, charcoal coat, teal rim light.", "半侧光定妆照，炭色大衣，青色轮廓光。"),
      "/generated/demo/cast-stranger.svg",
    ),
    castMember(
      "char-demo-tide-girl",
      L("Tide Girl", "潮汐少女"),
      L("chorus apparition", "副歌幻影"),
      "needs_review",
      {
        front: L(
          "Teenage silhouette in a translucent rain cape that catches every neon color.",
          "少女剪影，半透明雨披映出所有霓虹色。",
        ),
        side: L("Cape hem drips light instead of water.", "雨披下摆滴落的是光而不是水。"),
        back: "",
        wardrobe: L("Translucent rain cape, bare feet.", "半透明雨披、赤足。"),
        anchors: [L("translucent rain cape", "半透明雨披")],
        forbidden_drift: [],
      },
      L(
        "Backlit reference through a translucent cape, prismatic neon spill.",
        "逆光透过半透明雨披的定妆照，霓虹折射成棱镜色。",
      ),
      "/generated/demo/cast-tide-girl.svg",
    ),
    castMember(
      "char-demo-band",
      L("The Band", "乐队"),
      L("rooftop performers (finale)", "天台演出者（终章）"),
      "draft",
      {
        front: L(
          "Three-piece band in matching workwear, instruments taped with reflective strips.",
          "三人乐队着同款工装，乐器贴反光条。",
        ),
        side: "",
        back: "",
        wardrobe: L("Matching indigo workwear.", "同款靛蓝工装。"),
        anchors: [L("reflective-taped instruments", "贴反光条的乐器")],
        forbidden_drift: [],
      },
      L("Group reference on a rooftop at first light.", "破晓天台上的乐队合影定妆照。"),
      "",
    ),
    castMember(
      "char-demo-night-runner",
      L("Night Runner", "夜跑者"),
      L("recurring background motif", "反复出现的背景符号"),
      "draft",
      {
        front: L(
          "Runner in a light-strip vest who passes through every chorus street.",
          "身穿灯带背心的跑者，每段副歌的街道都会经过。",
        ),
        side: "",
        back: "",
        wardrobe: L("Light-strip running vest.", "灯带跑步背心。"),
        anchors: [L("light-strip vest", "灯带背心")],
        forbidden_drift: [],
      },
      L("Motion-blur reference, vest tracing a light line.", "动态模糊定妆照，背心拖出光线。"),
      "",
    ),
  ];

  const shots = [
    mvShot(
      "shot-demo-01",
      L("Dusk skyline (establishing)", "黄昏天际线（建立镜）"),
      "approved",
      8,
      L(
        "Wide static frame: the coastal city at dusk, first neon signs flickering on street by street.",
        "大全景固定机位：黄昏的海滨城市，霓虹招牌一条街一条街依次亮起。",
      ),
      L("Neon signs ignite in sequence toward the camera.", "霓虹由远及近依次点亮。"),
      ["char-demo-dreamer"],
      "/generated/demo/shot-dusk-skyline.svg",
    ),
    mvShot(
      "shot-demo-02",
      L("Bus door opens", "巴士开门"),
      "approved",
      4,
      L(
        "Medium shot: the Dreamer steps off the last bus into a puddle of amber light.",
        "中景：追光者走下末班巴士，踏进一滩琥珀色灯光。",
      ),
      L("Door hiss, one step down, puddle ripples with light.", "车门嘶响，迈步而下，水洼里光纹荡开。"),
      ["char-demo-dreamer"],
      "/generated/demo/shot-bus-door.svg",
    ),
    mvShot(
      "shot-demo-03",
      L("Shop-glass reflections", "橱窗倒影"),
      "approved",
      6,
      L(
        "Tracking along shop windows: the Dreamer's reflection multiplies across five panes of glass.",
        "沿橱窗横移：追光者的倒影在五面玻璃间层层复制。",
      ),
      L("Lateral tracking, reflections walking out of sync.", "横向跟拍，倒影彼此错拍行走。"),
      ["char-demo-dreamer"],
      "/generated/demo/shot-shop-glass.svg",
    ),
    mvShot(
      "shot-demo-04",
      L("First chorus: tide line", "第一段副歌：潮线"),
      "approved",
      10,
      L(
        "Low wide shot: a line of neon light rises up the street like a tide mark, the Dreamer dancing at its edge.",
        "低机位大全景：霓虹光线如潮痕沿街升起，追光者在光线边缘起舞。",
      ),
      L("Light line rises steadily; dance steps trace the waterline.", "光线稳定上升，舞步沿'水线'展开。"),
      ["char-demo-dreamer", "char-demo-tide-girl"],
      "/generated/demo/shot-tide-line.svg",
    ),
    mvShot(
      "shot-demo-05",
      L("Crosswalk surge", "斑马线人潮"),
      "needs_review",
      5,
      L(
        "Overhead shot: a crosswalk crowd surges around the motionless Dreamer.",
        "俯拍：人潮涌过斑马线，追光者静止其中。",
      ),
      L("Crowd in 2x speed, subject at normal speed.", "人群两倍速，主体正常速。"),
      ["char-demo-dreamer"],
      "/generated/demo/shot-crosswalk.svg",
    ),
    mvShot(
      "shot-demo-06",
      L("The Stranger's glance", "陌生人的一瞥"),
      "needs_review",
      6,
      L(
        "Close-up across the street: the Stranger's half-lit face turns toward camera for the first time.",
        "街对面特写：陌生人半明半暗的脸第一次转向镜头。",
      ),
      L("Slow head turn, neon flicker across the lit half.", "缓慢转头，霓虹在受光半脸上闪烁。"),
      ["char-demo-stranger"],
      "/generated/demo/shot-stranger-glance.svg",
    ),
    mvShot(
      "shot-demo-07",
      L("Arcade duet", "电玩厅双人舞"),
      "approved",
      12,
      L(
        "Steadicam through a closed arcade: the Dreamer and their own reflection dance a duet between machines.",
        "斯坦尼康穿过打烊的电玩厅：追光者与自己的倒影在机台间共舞。",
      ),
      L("One continuous move weaving between cabinets.", "一镜到底穿行于机台之间。"),
      ["char-demo-dreamer"],
      "/generated/demo/shot-arcade-duet.svg",
    ),
    mvShot(
      "shot-demo-08",
      L("Rain begins", "雨落"),
      "draft",
      4,
      L(
        "Insert: first raindrops hit a neon-lit puddle, colors shattering.",
        "插入镜头：第一滴雨落入霓虹水洼，色彩碎裂。",
      ),
      L("Macro splash, colors ripple outward.", "微距水花，色彩向外荡开。"),
      [],
      "",
    ),
    mvShot(
      "shot-demo-09",
      L("Umbrella bloom", "伞开如花"),
      "draft",
      6,
      L(
        "Top-down: dozens of umbrellas bloom at once; only the Stranger's stays closed.",
        "垂直俯拍：无数伞面同时撑开，唯有陌生人的伞仍收着。",
      ),
      L("Umbrellas open in a radial wave.", "伞面呈放射状依次撑开。"),
      ["char-demo-stranger"],
      "",
    ),
    mvShot(
      "shot-demo-10",
      L("Subway light streaks", "地铁光轨"),
      "draft",
      8,
      L(
        "Long exposure look: train windows streak past the platform where the Dreamer stands still.",
        "长曝光质感：列车车窗化作光轨掠过站台，追光者伫立不动。",
      ),
      L("Light streaks accelerate with the bridge section.", "光轨随桥段加速。"),
      ["char-demo-dreamer"],
      "",
    ),
    mvShot(
      "shot-demo-11",
      L("Tide Girl apparition", "潮汐少女现身"),
      "draft",
      5,
      L(
        "Backlit medium shot: the Tide Girl appears in the flooded street's glow, cape refracting the skyline.",
        "逆光中景：潮汐少女出现在漫光的街道中，雨披折射整片天际线。",
      ),
      L("She raises an arm; the light line surges to rooftop height.", "她抬起手臂，光线瞬间涨至天台高度。"),
      ["char-demo-tide-girl"],
      "",
    ),
    mvShot(
      "shot-demo-12",
      L("Sunrise rooftop hold", "日出天台长镜"),
      "draft",
      12,
      L(
        "Final wide hold: the band plays on the rooftop as sunrise washes the neon tide out to sea.",
        "结尾大全景长镜：乐队在天台演奏，日出将霓虹潮水'退'回海面。",
      ),
      L("Static hold, neon dimming as daylight rises.", "固定长镜，天光渐亮霓虹渐灭。"),
      ["char-demo-dreamer", "char-demo-band"],
      "",
    ),
  ];

  const tasks = [
    {
      id: "task-demo-cape-review",
      kind: "character",
      target_id: "char-demo-tide-girl",
      status: "needs_review",
      title: L("Confirm Tide Girl cape refraction look", "确认潮汐少女雨披折射效果"),
      note: L("Cape must refract neon without reading as CGI glass.", "雨披折射霓虹时不能像 CG 玻璃。"),
    },
    {
      id: "task-demo-chorus-timing",
      kind: "shot",
      target_id: "shot-demo-04",
      status: "approved",
      title: L("Chorus tide-line timing locked", "副歌潮线时点已锁定"),
      note: L("Light line hits rooftop height exactly on the last chorus.", "光线在最后一段副歌准点涨至天台高度。"),
    },
  ];

  return {
    project_id: "kelly-mv-demo",
    updated_at: DEMO_UPDATED_AT,
    projects: [],
    library: {},
    song,
    treatment,
    characters,
    shots,
    tasks,
  };
}

function castMember(id, name, role, status, visual, refPrompt, refImage) {
  return {
    id,
    name,
    role,
    status,
    actor_profile: "",
    character_card: {},
    visual,
    reference_card: refImage
      ? { prompt: refPrompt, image_asset: refImage, status: "generated", generated_at: DEMO_UPDATED_AT }
      : { prompt: refPrompt, status: "ready_to_generate" },
  };
}

function mvShot(id, title, status, durationSeconds, description, videoPrompt, characterIds, imageAsset) {
  return {
    id,
    title,
    status,
    duration_seconds: durationSeconds,
    description,
    video_prompt: videoPrompt,
    negative_prompt: "on-screen lyrics, captions, watermark, plastic skin, malformed hands",
    characters: characterIds,
    ...(imageAsset
      ? {
          image_asset: imageAsset,
          image_generated_at: DEMO_UPDATED_AT,
          image_generation: { mode: "image-edit", model: "gpt-image-2" },
        }
      : {}),
  };
}
