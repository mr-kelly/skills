import type { ScalePptxState, WorkflowStatus } from "../../lib/types.ts";

type Query = Record<string, string | undefined>;

export function isDemoQuery(query: Query): boolean {
  return query.demo !== undefined;
}

function zhFrom(query: Query): boolean {
  const lang = `${query.lang || ""}`.toLowerCase();
  return lang.startsWith("zh");
}

function L(en: string, zh: string, isZh: boolean): string {
  return isZh ? zh : en;
}

const now = "2026-07-07T08:00:00.000Z";

export function demoStatePayload(query: Query): ScalePptxState {
  const zh = zhFrom(query);
  const style = {
    style_system_id: "style-nanzhi-soft-classroom",
    name: L("Nanzhi Soft Classroom", "南枝柔和课堂", zh),
    palette: ["#F7A66A", "#FFF6E8", "#2F4F46", "#5A9D8C", "#C94F4F"],
    fonts: { heading: "Arial Rounded MT Bold", body: "Aptos", chinese: "PingFang SC" },
    visual_rules: [
      L(
        "Friendly illustrated children or bright inspectable photos on every teaching slide.",
        "每个教学页都需要友好插画或清晰可观察照片。",
        zh,
      ),
      L(
        "Chinese prompts stay large; pinyin and English support never compete with the main text.",
        "中文问题保持最大层级，拼音和英文只做辅助。",
        zh,
      ),
      L(
        "Warm orange is the dominant teaching color; deep green is the stable navigation color.",
        "暖橙为主教学色，深绿用于稳定导航和标题。",
        zh,
      ),
    ],
    layout_rules: [
      L("One teaching objective per slide card.", "每张页面卡只承载一个教学目标。", zh),
      L(
        "Use recurring slide families so a 30-deck batch still feels like one system.",
        "固定页面家族，让 30 套课件也像同一套系统。",
        zh,
      ),
      L("Split dense dialogue or bilingual copy instead of shrinking text.", "内容太密就拆页，不缩小文字。", zh),
    ],
    component_library: [
      L("Warm title band", "暖色标题条", zh),
      L("Image plus question panel", "图片+问题面板", zh),
      L("Vocabulary chip row", "词汇标签行", zh),
      L("Teacher note strip", "教师备注条", zh),
    ],
  };

  const brand = {
    client_id: "client-nanzhi",
    name: L("Nanzhi Chinese", "南枝中文", zh),
    audience: L("Children ages 5-9 learning Chinese overseas", "海外 5-9 岁中文学习儿童", zh),
    language_mode: "zh+pinyin+light_en",
    style_system_id: style.style_system_id,
  };

  const projects = [
    project(
      "proj-nanzhi-hello",
      1,
      brand.client_id,
      L("Starter Conversation Pack", "启蒙对话课件包", zh),
      L("Beginner Chinese", "中文启蒙", zh),
      "style-system",
      "Kelly",
      "needs_review",
      3,
      28,
    ),
    project(
      "proj-nanzhi-animals",
      2,
      brand.client_id,
      L("Animals Batch", "动物主题批量课件", zh),
      L("Theme vocabulary", "主题词汇", zh),
      "deck-generation",
      "Kelly",
      "approved",
      5,
      64,
    ),
    project(
      "proj-nanzhi-seasons",
      3,
      brand.client_id,
      L("Seasons And Weather", "四季与天气", zh),
      L("Culture + vocabulary", "文化+词汇", zh),
      "qa",
      "Kelly",
      "generated",
      4,
      46,
    ),
  ];

  const decks = [
    deck(
      "deck-hello-self",
      1,
      "proj-nanzhi-hello",
      L("Hello, My Name Is...", "你好，我叫什么？", zh),
      L("self introduction", "自我介绍", zh),
      "A1",
      brand.audience,
      "needs_review",
      10,
      6,
      2,
      88,
      "exports/hello-self.pptx",
    ),
    deck(
      "deck-animals-zoo",
      2,
      "proj-nanzhi-animals",
      L("My Favorite Animal", "我最喜欢的动物", zh),
      L("animals", "动物", zh),
      "A1",
      brand.audience,
      "approved",
      14,
      14,
      0,
      94,
      "exports/favorite-animal.pptx",
    ),
    deck(
      "deck-seasons-spring",
      3,
      "proj-nanzhi-seasons",
      L("Spring Is Here", "春天来了", zh),
      L("seasons", "季节", zh),
      "A1-A2",
      brand.audience,
      "generated",
      12,
      12,
      12,
      91,
      "exports/spring-is-here.pptx",
    ),
  ];

  const slideCards = [
    slide(
      "slide-hello-cover",
      1,
      decks[0],
      "cover",
      "full-bleed friendly illustration",
      L("你好！", "你好！", zh),
      L("Set the classroom mood and introduce the lesson question.", "建立课堂气氛，引出本课核心问题。", zh),
      "approved",
      {
        subtitle: L("Hello, my name is...", "我叫……", zh),
        chinese: "你好！我叫Kelly。",
        pinyin: "Ni hao! Wo jiao Kelly.",
        english: "Hello! My name is Kelly.",
        teacher_notes: L(
          "Ask learners to wave and say 你好 before showing the name pattern.",
          "先让学生挥手说“你好”，再出现“我叫……”句型。",
          zh,
        ),
        image_prompt: L(
          "Five cheerful children waving in a warm classroom, soft orange title band.",
          "五个开心挥手的小朋友，暖橙色中文课堂标题条。",
          zh,
        ),
      },
    ),
    slide(
      "slide-name-question",
      2,
      decks[0],
      "image_prompt",
      "image left, question stack right",
      L("我叫什么？", "我叫什么？", zh),
      L("Practice asking and answering a name question.", "练习姓名问答。", zh),
      "needs_review",
      {
        chinese: "你叫什么？\n我叫安安。",
        pinyin: "Ni jiao shenme?\nWo jiao An'an.",
        english: "What is your name? My name is An'an.",
        interaction: L("Students pass a name card and answer in turn.", "传名字卡，轮流回答。", zh),
        image_prompt: L(
          "A child holding a name card; clear empty space for question text.",
          "一个孩子拿着姓名卡，右侧留出问题文字空间。",
          zh,
        ),
      },
      [L("Needs simpler pinyin line break for small screens.", "拼音行需要拆得更适合小屏幕。", zh)],
    ),
    slide(
      "slide-age-question",
      3,
      decks[0],
      "dialogue",
      "two character dialogue bubbles",
      L("我今年几岁？", "我今年几岁？", zh),
      L("Introduce age answer pattern after name practice.", "在姓名问答后引入年龄回答。", zh),
      "changes_requested",
      {
        chinese: "你今年几岁？\n我今年六岁。",
        pinyin: "Ni jin nian ji sui?\nWo jin nian liu sui.",
        english: "How old are you? I am six.",
        interaction: L("Use number fingers before speaking.", "先用手指数数，再开口回答。", zh),
      },
      [L("Client asked for less English on this page.", "客户要求本页英文更少。", zh)],
    ),
    slide(
      "slide-animal-cover",
      4,
      decks[1],
      "cover",
      "photo grid with warm title",
      L("我最喜欢的动物", "我最喜欢的动物", zh),
      L("Open an animal-vocabulary deck with a recognizable visual field.", "用明确动物视觉场开启词汇课。", zh),
      "approved",
      {
        subtitle: L("Tell us your favorite animal", "说说你喜欢的动物", zh),
        chinese: "你喜欢什么动物？",
        pinyin: "Ni xihuan shenme dongwu?",
        image_prompt: L(
          "Bright zoo-photo collage with lion, rabbit, panda, dog, cat.",
          "明亮动物园照片拼贴，包含狮子、兔子、熊猫、狗、猫。",
          zh,
        ),
      },
    ),
    slide(
      "slide-spring-photo",
      5,
      decks[2],
      "vocabulary",
      "half-bleed nature photo",
      L("春天来了", "春天来了", zh),
      L("Connect season vocabulary with real visual observation.", "把季节词汇和真实观察连接起来。", zh),
      "generated",
      {
        chinese: "春天、花、树、雨",
        pinyin: "chun tian, hua, shu, yu",
        interaction: L("Circle what you can see in the picture.", "圈出图里能看到的东西。", zh),
        image_prompt: L(
          "Fresh spring branches with small flowers, clear daylight, child-friendly crop.",
          "春天枝条和小花，光线清晰，适合儿童观察。",
          zh,
        ),
      },
    ),
  ];

  const qaChecks = [
    qa(
      "qa-style-1",
      "slide-name-question",
      "slide",
      L("Pinyin readability", "拼音可读性", zh),
      "warn",
      L("Pinyin line wraps into a narrow column on 1024px preview.", "1024px 预览中拼音列过窄。", zh),
    ),
    qa(
      "qa-style-2",
      "deck-animals-zoo",
      "deck",
      L("Style consistency", "风格一致性", zh),
      "pass",
      L(
        "All approved slides use warm orange title band and consistent image ratio.",
        "全部已批准页面使用暖橙标题条和一致图片比例。",
        zh,
      ),
    ),
    qa(
      "qa-export-1",
      "deck-seasons-spring",
      "export",
      L("Rendered thumbnail QA", "渲染缩略图质检", zh),
      "manual",
      L("PDF render exists; human visual pass still pending.", "PDF 渲染已存在，等待人工视觉复核。", zh),
    ),
  ];

  const exports = [
    {
      export_id: "exp-spring",
      deck_id: "deck-seasons-spring",
      status: "generated",
      format: "pptx",
      path: "exports/spring-is-here.pptx",
      generated_at: now,
      qa_summary: L("12 slides generated, 1 manual QA item pending.", "已生成 12 页，1 项人工 QA 待处理。", zh),
    },
    {
      export_id: "exp-animals",
      deck_id: "deck-animals-zoo",
      status: "pending",
      format: "pptx",
      path: "exports/favorite-animal.pptx",
      generated_at: "",
      qa_summary: L("Ready after final deck approval.", "整套确认后即可导出。", zh),
    },
  ];

  const reviewItems = [
    review(
      "rv-slide-name",
      1,
      "slide",
      "slide-name-question",
      "needs_review",
      L("Slide #2 needs final wording approval before generation.", "页面 #2 需要确认措辞后再生成。", zh),
      [L("Shorten pinyin line", "缩短拼音行", zh), L("Keep one question per page", "一页只保留一个问题", zh)],
      L("Please simplify the pinyin and keep English as a small support line.", "请简化拼音，把英文作为小辅助行。", zh),
    ),
    review(
      "rv-slide-age",
      2,
      "slide",
      "slide-age-question",
      "changes_requested",
      L("Client requested less English on the age-question page.", "客户要求年龄问答页减少英文。", zh),
      [L("Remove English sentence from main panel", "主面板移除英文句子", zh)],
      L("Revise with Chinese+pinyin only; put English in teacher notes.", "改成中文+拼音；英文放教师备注。", zh),
    ),
    review(
      "rv-deck-animals",
      3,
      "deck",
      "deck-animals-zoo",
      "approved",
      L("Animal deck page plan is approved and ready for PPTX export.", "动物主题页面方案已批准，可导出 PPTX。", zh),
      [],
      L("Generate PPTX and render thumbnails for QA.", "生成 PPTX 并渲染缩略图做 QA。", zh),
    ),
  ];

  const activity = [
    act(
      "act-1",
      "agent",
      L("Created 10 slide cards for the self-introduction deck.", "为自我介绍课件创建 10 张页面卡。", zh),
      "deck-hello-self",
    ),
    act(
      "act-2",
      "Kelly",
      L("Requested lighter English support on Slide #3.", "Kelly 要求第 3 页弱化英文辅助。", zh),
      "slide-age-question",
    ),
    act(
      "act-3",
      "agent",
      L("Generated Spring Is Here PPTX and queued render QA.", "已生成《春天来了》PPTX，并进入渲染 QA。", zh),
      "deck-seasons-spring",
    ),
  ];

  const warnings = [
    {
      id: "warn-name-pinyin",
      severity: "warning",
      target_id: "slide-name-question",
      message: L("Slide #2 pinyin may wrap too tightly.", "第 2 页拼音可能换行过紧。", zh),
      detail: L("Split pinyin into two shorter lines before export.", "导出前把拼音拆成两行。", zh),
    },
  ];

  const metrics = {
    project_count: projects.length,
    deck_count: decks.length,
    slide_count: 28 + 64 + 46,
    slides_needs_review: slideCards.filter(
      (item) => item.status === "needs_review" || item.status === "changes_requested",
    ).length,
    slides_approved: 72,
    decks_generated: decks.filter((item) => item.status === "generated" || item.status === "done").length,
    qa_warnings: qaChecks.filter((item) => item.result === "warn" || item.result === "fail" || item.result === "manual")
      .length,
    avg_style_score: Math.round(decks.reduce((sum, item) => sum + item.style_score, 0) / decks.length),
  };

  return {
    app: "kelly-scale-pptx",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-scale-pptx/config.json",
      is_example: false,
      default_brand_id: brand.client_id,
      brand_profiles: [brand],
      style_systems: [style],
      export: { out_dir: "exports", render_dir: "exports/rendered", pptx_template: "", require_render_qa: true },
    },
    decisions: { updated_at: now, decisions: {} },
    agent_tasks: { updated_at: now, tasks: [] },
    execution_report: null,
    snapshot: {
      schema_version: "1",
      generated_at: now,
      source: "kelly-scale-pptx-demo",
      brand_profiles: [brand],
      style_systems: [style],
      projects,
      decks,
      slide_cards: slideCards,
      qa_checks: qaChecks,
      exports,
      review_items: reviewItems,
      activity_log: activity,
      warnings,
      metrics,
    },
  };
}

function project(
  project_id: string,
  ref: number,
  client_id: string,
  title: string,
  course: string,
  stage: string,
  owner: string,
  status: WorkflowStatus,
  deck_count: number,
  slide_count: number,
) {
  return {
    project_id,
    ref,
    client_id,
    title,
    course,
    stage,
    owner,
    status,
    deck_count,
    slide_count,
    due_at: "2026-07-20",
    updated_at: now,
  };
}

function deck(
  deck_id: string,
  ref: number,
  project_id: string,
  title: string,
  theme: string,
  level: string,
  audience: string,
  status: WorkflowStatus,
  target_slide_count: number,
  approved_slide_count: number,
  generated_slide_count: number,
  style_score: number,
  pptx_path: string,
) {
  return {
    deck_id,
    ref,
    project_id,
    title,
    theme,
    level,
    audience,
    status,
    target_slide_count,
    approved_slide_count,
    generated_slide_count,
    style_score,
    pptx_path,
    render_path: `exports/rendered/${deck_id}`,
    updated_at: now,
  };
}

function slide(
  slide_id: string,
  ref: number,
  deck: { deck_id: string; project_id: string },
  slide_type: string,
  layout: string,
  title: string,
  objective: string,
  status: WorkflowStatus,
  content: Record<string, unknown>,
  qa_flags: string[] = [],
) {
  return {
    slide_id,
    ref,
    deck_id: deck.deck_id,
    project_id: deck.project_id,
    status,
    slide_type,
    layout,
    title,
    objective,
    content,
    asset_brief: String(content.image_prompt || "Use the style system's friendly classroom visual language."),
    style_checks: ["palette", "font hierarchy", "image ratio", "one objective", "child-readable Chinese"],
    qa_flags,
    updated_at: now,
  };
}

function qa(check_id: string, target_id: string, target_type: string, rule: string, result: string, evidence: string) {
  return { check_id, target_id, target_type, rule, result, evidence, checked_at: now };
}

function review(
  review_id: string,
  ref: number,
  target_type: string,
  target_id: string,
  status: WorkflowStatus,
  summary: string,
  suggestions: string[],
  draft_note: string,
) {
  return { review_id, ref, target_type, target_id, status, summary, suggestions, draft_note, created_at: now };
}

function act(id: string, actor: string, detail: string, target_id: string) {
  return { id, at: now, actor, detail, target_id };
}
