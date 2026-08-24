import { demoVisualsForApp } from "../demo-visuals-data.js?v=0.1.0";
// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
// The fixtures below are ported verbatim (same ids, same copy, same
// numbers, same en/zh text via the same L()/zhFrom() helpers) from the
// retired app/server/demo.ts, reshaped into the new normalized snapshot
// shape (review_summary/review_suggestions/review_draft_note and
// decision_action/decision_note/decided_at live directly on the deck or
// slide card row instead of a separate review_items.json array).
import { APP_ID, assembleSnapshot } from "../ppt-model.js?v=0.1.0";

function zhFrom(query) {
  const lang = `${query.get("lang") || ""}`.toLowerCase();
  return lang.startsWith("zh");
}

function L(en, zh, isZh) {
  return isZh ? zh : en;
}

const NOW = "2026-07-07T08:00:00.000Z";

function buildDemoData(isZh) {
  const style = {
    style_system_id: "style-clean-growth-system",
    name: L("Clean Growth System", "清爽增长简报", isZh),
    palette: ["#2563EB", "#F8FAFC", "#111827", "#14B8A6", "#F59E0B"],
    fonts: { heading: "Aptos Display", body: "Aptos", chinese: "PingFang SC" },
    visual_rules: [
      L("Use one clear headline and one visual proof point per slide.", "每页只保留一个清晰主张和一个视觉证据。", isZh),
      L(
        "Prefer product screenshots, clean charts, and inspectable diagrams over decoration.",
        "优先使用产品截图、清晰图表和可检查的流程图，不做纯装饰。",
        isZh,
      ),
      L(
        "Blue anchors navigation; teal and amber mark evidence, risk, or next action.",
        "蓝色稳定导航，青色和琥珀色用于证据、风险和下一步动作。",
        isZh,
      ),
    ],
    layout_rules: [
      L("One message per slide card.", "每张页面卡只承载一个核心信息。", isZh),
      L(
        "Use recurring slide families so a 30-deck batch still feels like one system.",
        "固定页面家族，让 30 套 PPT 也像同一套系统。",
        isZh,
      ),
      L("Split dense analysis or source copy instead of shrinking text.", "内容太密就拆页，不缩小文字。", isZh),
    ],
    component_library: [
      L("Title rail", "标题导轨", isZh),
      L("Metric callout", "指标强调块", isZh),
      L("Two-column proof block", "双栏证据块", isZh),
      L("Speaker note strip", "演讲备注条", isZh),
    ],
  };

  const brand = {
    client_id: "client-demo-studio",
    name: L("Demo Studio", "Demo Studio", isZh),
    audience: L("Founders, operators, sales teams, and stakeholders", "创始人、运营团队、销售团队和业务干系人", isZh),
    language_mode: "presentation",
    style_system_id: style.style_system_id,
  };

  const projects = [
    {
      project_id: "proj-investor-story",
      ref: 1,
      client_id: brand.client_id,
      title: L("Investor Story Pack", "融资故事包", isZh),
      course: L("Pitch deck", "融资 PPT", isZh),
      stage: "storyboard",
      owner: "Kelly",
      status: "needs_review",
      deck_count: 2,
      slide_count: 24,
      due_at: "2026-07-20",
      updated_at: NOW,
    },
    {
      project_id: "proj-sales-enablement",
      ref: 2,
      client_id: brand.client_id,
      title: L("Sales Enablement Kit", "销售赋能包", isZh),
      course: L("Training deck", "培训 PPT", isZh),
      stage: "deck-generation",
      owner: "Kelly",
      status: "approved",
      deck_count: 3,
      slide_count: 42,
      due_at: "2026-07-20",
      updated_at: NOW,
    },
    {
      project_id: "proj-quarterly-report",
      ref: 3,
      client_id: brand.client_id,
      title: L("Quarterly Business Review", "季度业务复盘", isZh),
      course: L("Report deck", "报告 PPT", isZh),
      stage: "qa",
      owner: "Kelly",
      status: "generated",
      deck_count: 2,
      slide_count: 32,
      due_at: "2026-07-20",
      updated_at: NOW,
    },
  ];

  const decks = [
    {
      deck_id: "deck-seed-pitch",
      ref: 1,
      project_id: "proj-investor-story",
      title: L("Seed Fundraising Narrative", "种子轮融资叙事", isZh),
      theme: L("investor story", "投资人故事", isZh),
      level: "strategic",
      audience: brand.audience,
      status: "needs_review",
      target_slide_count: 12,
      approved_slide_count: 7,
      generated_slide_count: 2,
      style_score: 88,
      pptx_path: "exports/seed-fundraising-narrative.pptx",
      render_path: "exports/rendered/deck-seed-pitch",
      updated_at: NOW,
      review_summary: "",
      review_suggestions: [],
      review_draft_note: "",
      decision_action: "",
      decision_note: "",
    },
    {
      deck_id: "deck-sales-playbook",
      ref: 2,
      project_id: "proj-sales-enablement",
      title: L("AI Product Sales Playbook", "AI 产品销售手册", isZh),
      theme: L("sales enablement", "销售赋能", isZh),
      level: "operator",
      audience: brand.audience,
      status: "approved",
      target_slide_count: 16,
      approved_slide_count: 16,
      generated_slide_count: 0,
      style_score: 94,
      pptx_path: "exports/ai-product-sales-playbook.pptx",
      render_path: "exports/rendered/deck-sales-playbook",
      updated_at: NOW,
      review_summary: L(
        "Sales playbook page plan is approved and ready for PPTX export.",
        "销售手册页面方案已批准，可导出 PPTX。",
        isZh,
      ),
      review_suggestions: [],
      review_draft_note: L("Generate PPTX and render thumbnails for QA.", "生成 PPTX 并渲染缩略图做 QA。", isZh),
      decision_action: "approve",
      decision_note: L("Approved for generation.", "已批准，可以生成。", isZh),
      decided_at: "2026-07-06T12:00:00.000Z",
    },
    {
      deck_id: "deck-qbr-growth",
      ref: 3,
      project_id: "proj-quarterly-report",
      title: L("Q3 Growth Review And Outlook", "Q3 增长复盘与展望", isZh),
      theme: L("quarterly report", "季度报告", isZh),
      level: "executive",
      audience: brand.audience,
      status: "generated",
      target_slide_count: 14,
      approved_slide_count: 14,
      generated_slide_count: 14,
      style_score: 91,
      pptx_path: "exports/q3-growth-review.pptx",
      render_path: "exports/rendered/deck-qbr-growth",
      updated_at: NOW,
      review_summary: "",
      review_suggestions: [],
      review_draft_note: "",
      decision_action: "",
      decision_note: "",
    },
  ];

  const slideCards = [
    {
      slide_id: "slide-pitch-cover",
      ref: 1,
      deck_id: "deck-seed-pitch",
      project_id: "proj-investor-story",
      status: "approved",
      slide_type: "cover",
      layout: "full-bleed product scene",
      title: L("AI Workflow Platform", "AI 工作流平台", isZh),
      objective: L(
        "Open the investor narrative with a concrete promise and visual product proof.",
        "用明确承诺和产品证据开启融资叙事。",
        isZh,
      ),
      content: {
        subtitle: L("Seed round narrative", "种子轮融资叙事", isZh),
        chinese: L("Turn repeated team work into reviewable AI workflows.", "把重复团队工作变成可审核 AI 流程。", isZh),
        pinyin: "",
        english: L("Investor story deck", "投资人故事稿", isZh),
        bullets: [],
        teacher_notes: L(
          "Lead with the pain: teams already use AI, but the work is not yet repeatable or auditable.",
          "先讲痛点：团队已经在用 AI，但工作还没有可复用、可审核的流程。",
          isZh,
        ),
        interaction: "",
        image_prompt: L(
          "Product screenshot collage with workflow cards, approval states, and export paths.",
          "产品截图拼贴：工作流卡片、审批状态、导出路径。",
          isZh,
        ),
      },
      asset_brief: L(
        "Product screenshot collage with workflow cards, approval states, and export paths.",
        "产品截图拼贴：工作流卡片、审批状态、导出路径。",
        isZh,
      ),
      style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
      qa_flags: [],
      updated_at: NOW,
      review_summary: "",
      review_suggestions: [],
      review_draft_note: "",
      decision_action: "",
      decision_note: "",
    },
    {
      slide_id: "slide-why-now",
      ref: 2,
      deck_id: "deck-seed-pitch",
      project_id: "proj-investor-story",
      status: "needs_review",
      slide_type: "concept",
      layout: "headline left, market signals right",
      title: L("Why Now", "为什么是现在", isZh),
      objective: L("Explain the timing shift that makes the product urgent now.", "解释为什么现在正是切入窗口。", isZh),
      content: {
        subtitle: "",
        chinese: L("AI work moved from experiments to operating cadence.", "AI 工作正在从试验走向日常运营节奏。", isZh),
        pinyin: "",
        english: L(
          "Add 3 proof points: usage, budget, workflow fatigue.",
          "补 3 个证据：使用率、预算、流程疲劳。",
          isZh,
        ),
        bullets: [],
        teacher_notes: "",
        interaction: L("Review two headline options before deck generation.", "生成前先确认两个标题版本。", isZh),
        image_prompt: L(
          "Three compact market signal cards with adoption, spend, and workflow pain metrics.",
          "三张市场信号卡：采用率、预算投入、流程痛点。",
          isZh,
        ),
      },
      asset_brief: L(
        "Three compact market signal cards with adoption, spend, and workflow pain metrics.",
        "三张市场信号卡：采用率、预算投入、流程痛点。",
        isZh,
      ),
      style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
      qa_flags: [L("Headline still too generic.", "标题还不够具体。", isZh)],
      updated_at: NOW,
      review_summary: L(
        "Slide #2 needs a sharper why-now headline before generation.",
        "页面 #2 需要更有力的 why-now 标题后再生成。",
        isZh,
      ),
      review_suggestions: [
        L("Name the buyer behavior change", "点明买方行为变化", isZh),
        L("Keep one claim per page", "一页只保留一个主张", isZh),
      ],
      review_draft_note: L(
        "Please make the headline more specific and add one proof metric.",
        "请把标题改得更具体，并补一个证据指标。",
        isZh,
      ),
      decision_action: "",
      decision_note: "",
    },
    {
      slide_id: "slide-pricing-model",
      ref: 3,
      deck_id: "deck-seed-pitch",
      project_id: "proj-investor-story",
      status: "changes_requested",
      slide_type: "comparison",
      layout: "pricing ladder with risk notes",
      title: L("Pricing Model", "定价模型", isZh),
      objective: L(
        "Show how the pricing story maps to usage and expansion.",
        "说明定价如何跟使用量和扩张路径对应。",
        isZh,
      ),
      content: {
        subtitle: "",
        chinese: L("Start per team, expand per workflow.", "按团队起步，按工作流扩张。", isZh),
        pinyin: "",
        english: L(
          "Replace jargon with a customer-facing pricing explanation.",
          "把行话改成客户能听懂的定价解释。",
          isZh,
        ),
        bullets: [],
        teacher_notes: "",
        interaction: L(
          "Ask founder to confirm pricing language before rendering.",
          "渲染前请创始人确认定价措辞。",
          isZh,
        ),
        image_prompt: "",
      },
      asset_brief: L("Use the style kit's approved visual language.", "使用风格包中已批准的视觉语言。", isZh),
      style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
      qa_flags: [L("Too much internal jargon.", "内部行话太多。", isZh)],
      updated_at: NOW,
      review_summary: L("Pricing slide needs less internal jargon.", "定价页需要减少内部行话。", isZh),
      review_suggestions: [L("Rewrite in customer-facing language", "改成客户能听懂的语言", isZh)],
      review_draft_note: L(
        "Revise into simple buyer language and keep internal notes in speaker notes.",
        "改成买方能理解的简单表达，内部说明放演讲备注。",
        isZh,
      ),
      decision_action: "request_changes",
      decision_note: L("Please simplify the pricing language.", "请简化定价措辞。", isZh),
      decided_at: "2026-07-06T09:30:00.000Z",
    },
    {
      slide_id: "slide-sales-objections",
      ref: 4,
      deck_id: "deck-sales-playbook",
      project_id: "proj-sales-enablement",
      status: "approved",
      slide_type: "case_study",
      layout: "objection cards plus talk track",
      title: L("Handle The Three Hard Objections", "处理三类关键异议", isZh),
      objective: L(
        "Give sales reps a repeatable talk track for common objections.",
        "给销售团队一套可复用的异议处理话术。",
        isZh,
      ),
      content: {
        subtitle: L("Security, ROI, and change management", "安全、ROI、变更管理", isZh),
        chinese: L("Answer with proof, not persuasion.", "用证据回答，而不是只靠说服。", isZh),
        pinyin: "",
        english: "",
        bullets: [],
        teacher_notes: "",
        interaction: "",
        image_prompt: L(
          "Three cards, each with objection, proof point, and next question.",
          "三张卡片：异议、证据、下一步问题。",
          isZh,
        ),
      },
      asset_brief: L(
        "Three cards, each with objection, proof point, and next question.",
        "三张卡片：异议、证据、下一步问题。",
        isZh,
      ),
      style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
      qa_flags: [],
      updated_at: NOW,
      review_summary: "",
      review_suggestions: [],
      review_draft_note: "",
      decision_action: "",
      decision_note: "",
    },
    {
      slide_id: "slide-qbr-pipeline",
      ref: 5,
      deck_id: "deck-qbr-growth",
      project_id: "proj-quarterly-report",
      status: "generated",
      slide_type: "data_chart",
      layout: "chart left, interpretation right",
      title: L("Pipeline Quality Improved", "管道质量提升", isZh),
      objective: L(
        "Connect quarterly metrics to a concise executive interpretation.",
        "把季度指标转成高管能快速理解的结论。",
        isZh,
      ),
      content: {
        subtitle: "",
        chinese: L("Win rate rose while low-fit leads declined.", "低匹配线索下降，赢率同步提升。", isZh),
        pinyin: "",
        english: L(
          "Use chart annotations to explain mix shift, not just totals.",
          "用图表标注解释结构变化，而不只是总量。",
          isZh,
        ),
        bullets: [],
        teacher_notes: "",
        interaction: "",
        image_prompt: L(
          "Clean pipeline quality chart with callouts for conversion and lead-fit mix.",
          "清晰管道质量图，标注转化率和线索匹配结构。",
          isZh,
        ),
      },
      asset_brief: L(
        "Clean pipeline quality chart with callouts for conversion and lead-fit mix.",
        "清晰管道质量图，标注转化率和线索匹配结构。",
        isZh,
      ),
      style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
      qa_flags: [],
      updated_at: NOW,
      review_summary: "",
      review_suggestions: [],
      review_draft_note: "",
      decision_action: "",
      decision_note: "",
    },
  ];

  const qaChecks = [
    {
      check_id: "qa-style-1",
      target_id: "slide-why-now",
      target_type: "slide",
      rule: L("Headline specificity", "标题具体度", isZh),
      result: "warn",
      evidence: L(
        "Headline says the category changed, but not what changed for the buyer.",
        "标题说明了品类变化，但还没说买方具体变化。",
        isZh,
      ),
      checked_at: NOW,
    },
    {
      check_id: "qa-style-2",
      target_id: "deck-sales-playbook",
      target_type: "deck",
      rule: L("Style consistency", "风格一致性", isZh),
      result: "pass",
      evidence: L(
        "All approved slides use consistent title rail, proof block, and note-strip placement.",
        "全部已批准页面使用一致的标题导轨、证据块和备注条位置。",
        isZh,
      ),
      checked_at: NOW,
    },
    {
      check_id: "qa-export-1",
      target_id: "deck-qbr-growth",
      target_type: "export",
      rule: L("Rendered thumbnail QA", "渲染缩略图质检", isZh),
      result: "manual",
      evidence: L("PDF render exists; human visual pass still pending.", "PDF 渲染已存在，等待人工视觉复核。", isZh),
      checked_at: NOW,
    },
  ];

  const exportsList = [
    {
      export_id: "exp-qbr",
      deck_id: "deck-qbr-growth",
      status: "generated",
      format: "pptx",
      path: "exports/q3-growth-review.pptx",
      generated_at: NOW,
      qa_summary: L("14 slides generated, 1 manual QA item pending.", "已生成 14 页，1 项人工 QA 待处理。", isZh),
    },
    {
      export_id: "exp-sales",
      deck_id: "deck-sales-playbook",
      status: "pending",
      format: "pptx",
      path: "exports/ai-product-sales-playbook.pptx",
      generated_at: "",
      qa_summary: L("Ready after final deck approval.", "整套确认后即可导出。", isZh),
    },
  ];

  const configSummary = {
    config_path: "demo://kelly-ppt-factory/config.json",
    is_example: false,
    default_brand_id: brand.client_id,
    brand_profiles: [brand],
    style_systems: [style],
    export: { out_dir: "exports", render_dir: "exports/rendered", pptx_template: "", require_render_qa: true },
  };

  return { projects, decks, slideCards, qaChecks, exportsList, configSummary };
}

function demoSnapshot(isZh) {
  const data = buildDemoData(isZh);
  const snapshot = assembleSnapshot({
    projects: data.projects,
    decks: data.decks,
    slideCards: data.slideCards,
    styleSystems: data.configSummary.style_systems,
    qaChecks: data.qaChecks,
    exportsList: data.exportsList,
    configSummary: data.configSummary,
    now: NOW,
    source: "kelly-ppt-factory-demo",
  });
  return { snapshot, configSummary: data.configSummary };
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const isZh = zhFrom(params);
    const { snapshot, configSummary } = demoSnapshot(isZh);
    const visuals = demoVisualsForApp(APP_ID);
    return {
      app: APP_ID,
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: configSummary,
      demo_visuals: visuals,
      snapshot: { ...snapshot, demo_visuals: visuals },
    };
  },

  async decideItem() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
