// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never persists anything. Ported verbatim (same ids, same
// copy, same personas — 《霓虹潮汐》/ "Neon Tide") from the retired
// app/server/demo.ts's demoProject(). Binary media are synthetic in-memory
// placeholders (a tiny silent WAV data URL for the song, hash-tinted SVG data
// URLs for character/shot images) generated in the browser — never a real
// generated/uploaded asset, matching the existing demo-visuals pattern used
// across every converted skill.
import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
import { attention, completeness, countBy, nextStep } from "../mv-model.js?v=0.1.0";

const DEMO_UPDATED_AT = "2026-06-30T09:30:00.000Z";

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  return hash;
}

function placeholderSvgDataUrl(label) {
  const hue = hashCode(label) % 360;
  const text = label.replace(/[-_]+/g, " ").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="hsl(${hue}, 32%, 24%)"/>
  <rect x="24" y="24" width="1232" height="672" fill="none" stroke="hsl(${hue}, 40%, 62%)" stroke-width="4" stroke-dasharray="18 14"/>
  <text x="640" y="345" text-anchor="middle" font-family="system-ui, sans-serif" font-size="56" fill="hsl(${hue}, 45%, 86%)">${text}</text>
  <text x="640" y="415" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" fill="hsl(${hue}, 30%, 68%)">DEMO PLACEHOLDER</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// A short, valid, deterministic silent WAV as a data URL — plays fine in an
// <audio> element without any network fetch.
function silentWavDataUrl() {
  const sampleRate = 8000;
  const dataSize = sampleRate; // 0.5s at 16-bit mono
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) buffer[offset + i] = str.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let binary = "";
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function castMember(id, name, role, status, visual, refPrompt, hasRef) {
  return {
    id,
    name,
    role,
    status,
    actor_profile: "",
    character_card: {},
    visual,
    reference_card: hasRef
      ? {
          prompt: refPrompt,
          image_asset: placeholderSvgDataUrl(id),
          status: "generated",
          generated_at: DEMO_UPDATED_AT,
          generation: {},
        }
      : { prompt: refPrompt, status: "ready_to_generate", image_asset: "", generated_at: "", generation: {} },
  };
}

function mvShot(id, title, status, durationSeconds, description, videoPrompt, characterIds, hasImage) {
  return {
    id,
    title,
    status,
    duration_seconds: durationSeconds,
    description,
    video_prompt: videoPrompt,
    negative_prompt: "on-screen lyrics, captions, watermark, plastic skin, malformed hands",
    characters: characterIds,
    image_asset: hasImage ? placeholderSvgDataUrl(id) : "",
    image_generated_at: hasImage ? DEMO_UPDATED_AT : "",
    image_generation: hasImage ? { mode: "image-edit", model: "gpt-image-2" } : {},
    image_status: hasImage ? "generated" : "draft",
    image_candidates: hasImage
      ? [{ path: placeholderSvgDataUrl(id), generated_at: DEMO_UPDATED_AT, generation: {} }]
      : [],
    video_asset: "",
    video_generated_at: "",
    video_generation: {},
    video_status: "draft",
    video_candidates: [],
  };
}

function demoProject(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  const song = {
    title: L("Neon Tide", "霓虹潮汐"),
    artist: L("Mirror Line", "镜线乐队"),
    duration_seconds: 214,
    audio_asset: silentWavDataUrl(),
    source: "upload",
    uploaded_at: DEMO_UPDATED_AT,
  };
  const treatment = {
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
      true,
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
      true,
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
      true,
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
      false,
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
      false,
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
      true,
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
      true,
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
      true,
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
      true,
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
      true,
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
      true,
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
      true,
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
      false,
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
      false,
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
      false,
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
      false,
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
      false,
    ),
  ];

  return {
    project_id: "kelly-mv-demo",
    updated_at: DEMO_UPDATED_AT,
    song,
    treatment,
    characters,
    shots,
    _settings: {
      image_base_url: "https://demo.invalid/v1",
      image_model: "gpt-image-2",
      image_size: "1536x1024",
      song_draft_backend: "songgeneration-v2-mlx",
      video_draft_backend: "ltx-video-mps",
    },
  };
}

function activeLangIsZh() {
  const params = new URLSearchParams(window.location.search);
  const lang = String(params.get("lang") || "").toLowerCase();
  if (lang) return lang.startsWith("zh");
  return Boolean(navigator.languages?.some((item) => String(item).toLowerCase().startsWith("zh")));
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const project = demoProject(activeLangIsZh());
    const visuals = demoVisualsForApp("kelly-mv");
    return {
      demo: true,
      demo_scenario: scenario,
      app: "kelly-mv",
      data_provider: "demo",
      onboarding: { completed: true, config_version: "demo" },
      lock: { locked: false },
      config_summary: { config_path: "demo://kelly-mv/config.json", is_example: false },
      demo_visuals: visuals,
      project: { ...project, demo_visuals: visuals },
      projects: [{ id: project.project_id, title: project.song.title, artist: project.song.artist, mode: "" }],
      active_project_id: project.project_id,
      counts: { characters: countBy(project.characters), shots: countBy(project.shots), tasks: {} },
      totals: { characters: project.characters.length, shots: project.shots.length, tasks: 0 },
      completeness: completeness(project),
      attention: attention(project),
      next_step: nextStep(project),
    };
  },

  async saveTreatment() {
    throw new Error("Demo mode is read-only.");
  },
  async saveSongMeta() {
    throw new Error("Demo mode is read-only.");
  },
  async uploadSong() {
    throw new Error("Demo mode is read-only.");
  },
  async saveCharacter() {
    throw new Error("Demo mode is read-only.");
  },
  async deleteCharacter() {
    throw new Error("Demo mode is read-only.");
  },
  async requestCharacterCardGeneration() {
    throw new Error("Demo mode is read-only.");
  },
  async saveShot() {
    throw new Error("Demo mode is read-only.");
  },
  async deleteShot() {
    throw new Error("Demo mode is read-only.");
  },
  async requestStoryboardImageGeneration() {
    throw new Error("Demo mode is read-only.");
  },
  async requestShotVideoGeneration() {
    throw new Error("Demo mode is read-only.");
  },
  async uploadShotAsset() {
    throw new Error("Demo mode is read-only.");
  },
  async setShotActive() {
    throw new Error("Demo mode is read-only.");
  },
  async saveImageConfig() {
    throw new Error("Demo mode is read-only.");
  },
  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
