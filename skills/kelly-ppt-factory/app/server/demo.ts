import type { PptFactoryState, WorkflowStatus } from "../../lib/types.ts";

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

export function demoStatePayload(query: Query): PptFactoryState {
  const zh = zhFrom(query);
  const style = {
    style_system_id: "style-clean-growth-system",
    name: L("Clean Growth System", "清爽增长简报", zh),
    palette: ["#2563EB", "#F8FAFC", "#111827", "#14B8A6", "#F59E0B"],
    fonts: { heading: "Aptos Display", body: "Aptos", chinese: "PingFang SC" },
    visual_rules: [
      L("Use one clear headline and one visual proof point per slide.", "每页只保留一个清晰主张和一个视觉证据。", zh),
      L(
        "Prefer product screenshots, clean charts, and inspectable diagrams over decoration.",
        "优先使用产品截图、清晰图表和可检查的流程图，不做纯装饰。",
        zh,
      ),
      L(
        "Blue anchors navigation; teal and amber mark evidence, risk, or next action.",
        "蓝色稳定导航，青色和琥珀色用于证据、风险和下一步动作。",
        zh,
      ),
    ],
    layout_rules: [
      L("One message per slide card.", "每张页面卡只承载一个核心信息。", zh),
      L(
        "Use recurring slide families so a 30-deck batch still feels like one system.",
        "固定页面家族，让 30 套 PPT 也像同一套系统。",
        zh,
      ),
      L("Split dense analysis or source copy instead of shrinking text.", "内容太密就拆页，不缩小文字。", zh),
    ],
    component_library: [
      L("Title rail", "标题导轨", zh),
      L("Metric callout", "指标强调块", zh),
      L("Two-column proof block", "双栏证据块", zh),
      L("Speaker note strip", "演讲备注条", zh),
    ],
  };

  const brand = {
    client_id: "client-demo-studio",
    name: L("Demo Studio", "Demo Studio", zh),
    audience: L("Founders, operators, sales teams, and stakeholders", "创始人、运营团队、销售团队和业务干系人", zh),
    language_mode: "presentation",
    style_system_id: style.style_system_id,
  };

  const projects = [
    project(
      "proj-investor-story",
      1,
      brand.client_id,
      L("Investor Story Pack", "融资故事包", zh),
      L("Pitch deck", "融资 PPT", zh),
      "storyboard",
      "Kelly",
      "needs_review",
      2,
      24,
    ),
    project(
      "proj-sales-enablement",
      2,
      brand.client_id,
      L("Sales Enablement Kit", "销售赋能包", zh),
      L("Training deck", "培训 PPT", zh),
      "deck-generation",
      "Kelly",
      "approved",
      3,
      42,
    ),
    project(
      "proj-quarterly-report",
      3,
      brand.client_id,
      L("Quarterly Business Review", "季度业务复盘", zh),
      L("Report deck", "报告 PPT", zh),
      "qa",
      "Kelly",
      "generated",
      2,
      32,
    ),
  ];

  const decks = [
    deck(
      "deck-seed-pitch",
      1,
      "proj-investor-story",
      L("Seed Fundraising Narrative", "种子轮融资叙事", zh),
      L("investor story", "投资人故事", zh),
      "strategic",
      brand.audience,
      "needs_review",
      12,
      7,
      2,
      88,
      "exports/seed-fundraising-narrative.pptx",
    ),
    deck(
      "deck-sales-playbook",
      2,
      "proj-sales-enablement",
      L("AI Product Sales Playbook", "AI 产品销售手册", zh),
      L("sales enablement", "销售赋能", zh),
      "operator",
      brand.audience,
      "approved",
      16,
      16,
      0,
      94,
      "exports/ai-product-sales-playbook.pptx",
    ),
    deck(
      "deck-qbr-growth",
      3,
      "proj-quarterly-report",
      L("Q3 Growth Review And Outlook", "Q3 增长复盘与展望", zh),
      L("quarterly report", "季度报告", zh),
      "executive",
      brand.audience,
      "generated",
      14,
      14,
      14,
      91,
      "exports/q3-growth-review.pptx",
    ),
  ];

  const slideCards = [
    slide(
      "slide-pitch-cover",
      1,
      decks[0],
      "cover",
      "full-bleed product scene",
      L("AI Workflow Platform", "AI 工作流平台", zh),
      L(
        "Open the investor narrative with a concrete promise and visual product proof.",
        "用明确承诺和产品证据开启融资叙事。",
        zh,
      ),
      "approved",
      {
        subtitle: L("Seed round narrative", "种子轮融资叙事", zh),
        chinese: L("Turn repeated team work into reviewable AI workflows.", "把重复团队工作变成可审核 AI 流程。", zh),
        english: L("Investor story deck", "投资人故事稿", zh),
        teacher_notes: L(
          "Lead with the pain: teams already use AI, but the work is not yet repeatable or auditable.",
          "先讲痛点：团队已经在用 AI，但工作还没有可复用、可审核的流程。",
          zh,
        ),
        image_prompt: L(
          "Product screenshot collage with workflow cards, approval states, and export paths.",
          "产品截图拼贴：工作流卡片、审批状态、导出路径。",
          zh,
        ),
      },
    ),
    slide(
      "slide-why-now",
      2,
      decks[0],
      "concept",
      "headline left, market signals right",
      L("Why Now", "为什么是现在", zh),
      L("Explain the timing shift that makes the product urgent now.", "解释为什么现在正是切入窗口。", zh),
      "needs_review",
      {
        chinese: L("AI work moved from experiments to operating cadence.", "AI 工作正在从试验走向日常运营节奏。", zh),
        english: L("Add 3 proof points: usage, budget, workflow fatigue.", "补 3 个证据：使用率、预算、流程疲劳。", zh),
        interaction: L("Review two headline options before deck generation.", "生成前先确认两个标题版本。", zh),
        image_prompt: L(
          "Three compact market signal cards with adoption, spend, and workflow pain metrics.",
          "三张市场信号卡：采用率、预算投入、流程痛点。",
          zh,
        ),
      },
      [L("Headline still too generic.", "标题还不够具体。", zh)],
    ),
    slide(
      "slide-pricing-model",
      3,
      decks[0],
      "comparison",
      "pricing ladder with risk notes",
      L("Pricing Model", "定价模型", zh),
      L("Show how the pricing story maps to usage and expansion.", "说明定价如何跟使用量和扩张路径对应。", zh),
      "changes_requested",
      {
        chinese: L("Start per team, expand per workflow.", "按团队起步，按工作流扩张。", zh),
        english: L(
          "Replace jargon with a customer-facing pricing explanation.",
          "把行话改成客户能听懂的定价解释。",
          zh,
        ),
        interaction: L("Ask founder to confirm pricing language before rendering.", "渲染前请创始人确认定价措辞。", zh),
      },
      [L("Too much internal jargon.", "内部行话太多。", zh)],
    ),
    slide(
      "slide-sales-objections",
      4,
      decks[1],
      "case_study",
      "objection cards plus talk track",
      L("Handle The Three Hard Objections", "处理三类关键异议", zh),
      L("Give sales reps a repeatable talk track for common objections.", "给销售团队一套可复用的异议处理话术。", zh),
      "approved",
      {
        subtitle: L("Security, ROI, and change management", "安全、ROI、变更管理", zh),
        chinese: L("Answer with proof, not persuasion.", "用证据回答，而不是只靠说服。", zh),
        image_prompt: L(
          "Three cards, each with objection, proof point, and next question.",
          "三张卡片：异议、证据、下一步问题。",
          zh,
        ),
      },
    ),
    slide(
      "slide-qbr-pipeline",
      5,
      decks[2],
      "data_chart",
      "chart left, interpretation right",
      L("Pipeline Quality Improved", "管道质量提升", zh),
      L("Connect quarterly metrics to a concise executive interpretation.", "把季度指标转成高管能快速理解的结论。", zh),
      "generated",
      {
        chinese: L("Win rate rose while low-fit leads declined.", "低匹配线索下降，赢率同步提升。", zh),
        english: L(
          "Use chart annotations to explain mix shift, not just totals.",
          "用图表标注解释结构变化，而不只是总量。",
          zh,
        ),
        image_prompt: L(
          "Clean pipeline quality chart with callouts for conversion and lead-fit mix.",
          "清晰管道质量图，标注转化率和线索匹配结构。",
          zh,
        ),
      },
    ),
  ];

  const qaChecks = [
    qa(
      "qa-style-1",
      "slide-why-now",
      "slide",
      L("Headline specificity", "标题具体度", zh),
      "warn",
      L(
        "Headline says the category changed, but not what changed for the buyer.",
        "标题说明了品类变化，但还没说买方具体变化。",
        zh,
      ),
    ),
    qa(
      "qa-style-2",
      "deck-sales-playbook",
      "deck",
      L("Style consistency", "风格一致性", zh),
      "pass",
      L(
        "All approved slides use consistent title rail, proof block, and note-strip placement.",
        "全部已批准页面使用一致的标题导轨、证据块和备注条位置。",
        zh,
      ),
    ),
    qa(
      "qa-export-1",
      "deck-qbr-growth",
      "export",
      L("Rendered thumbnail QA", "渲染缩略图质检", zh),
      "manual",
      L("PDF render exists; human visual pass still pending.", "PDF 渲染已存在，等待人工视觉复核。", zh),
    ),
  ];

  const exports = [
    {
      export_id: "exp-qbr",
      deck_id: "deck-qbr-growth",
      status: "generated",
      format: "pptx",
      path: "exports/q3-growth-review.pptx",
      generated_at: now,
      qa_summary: L("14 slides generated, 1 manual QA item pending.", "已生成 14 页，1 项人工 QA 待处理。", zh),
    },
    {
      export_id: "exp-sales",
      deck_id: "deck-sales-playbook",
      status: "pending",
      format: "pptx",
      path: "exports/ai-product-sales-playbook.pptx",
      generated_at: "",
      qa_summary: L("Ready after final deck approval.", "整套确认后即可导出。", zh),
    },
  ];

  const reviewItems = [
    review(
      "rv-slide-why-now",
      1,
      "slide",
      "slide-why-now",
      "needs_review",
      L(
        "Slide #2 needs a sharper why-now headline before generation.",
        "页面 #2 需要更有力的 why-now 标题后再生成。",
        zh,
      ),
      [
        L("Name the buyer behavior change", "点明买方行为变化", zh),
        L("Keep one claim per page", "一页只保留一个主张", zh),
      ],
      L(
        "Please make the headline more specific and add one proof metric.",
        "请把标题改得更具体，并补一个证据指标。",
        zh,
      ),
    ),
    review(
      "rv-slide-pricing",
      2,
      "slide",
      "slide-pricing-model",
      "changes_requested",
      L("Pricing slide needs less internal jargon.", "定价页需要减少内部行话。", zh),
      [L("Rewrite in customer-facing language", "改成客户能听懂的语言", zh)],
      L(
        "Revise into simple buyer language and keep internal notes in speaker notes.",
        "改成买方能理解的简单表达，内部说明放演讲备注。",
        zh,
      ),
    ),
    review(
      "rv-deck-sales",
      3,
      "deck",
      "deck-sales-playbook",
      "approved",
      L("Sales playbook page plan is approved and ready for PPTX export.", "销售手册页面方案已批准，可导出 PPTX。", zh),
      [],
      L("Generate PPTX and render thumbnails for QA.", "生成 PPTX 并渲染缩略图做 QA。", zh),
    ),
  ];

  const activity = [
    act(
      "act-1",
      "agent",
      L("Created 12 slide cards for the seed fundraising narrative.", "为种子轮融资叙事创建 12 张页面卡。", zh),
      "deck-seed-pitch",
    ),
    act(
      "act-2",
      "Kelly",
      L("Requested simpler buyer-facing language on the pricing slide.", "Kelly 要求定价页改成更简单的买方语言。", zh),
      "slide-pricing-model",
    ),
    act(
      "act-3",
      "agent",
      L("Generated Q3 Growth Review PPTX and queued render QA.", "已生成《Q3 增长复盘》PPTX，并进入渲染 QA。", zh),
      "deck-qbr-growth",
    ),
  ];

  const warnings = [
    {
      id: "warn-why-now-headline",
      severity: "warning",
      target_id: "slide-why-now",
      message: L("Slide #2 headline is still too broad.", "第 2 页标题还太宽。", zh),
      detail: L("Name the buyer behavior change before export.", "导出前需要点明买方行为变化。", zh),
    },
  ];

  const metrics = {
    project_count: projects.length,
    deck_count: decks.length,
    slide_count: 24 + 42 + 32,
    slides_needs_review: slideCards.filter(
      (item) => item.status === "needs_review" || item.status === "changes_requested",
    ).length,
    slides_approved: 58,
    decks_generated: decks.filter((item) => item.status === "generated" || item.status === "done").length,
    qa_warnings: qaChecks.filter((item) => item.result === "warn" || item.result === "fail" || item.result === "manual")
      .length,
    avg_style_score: Math.round(decks.reduce((sum, item) => sum + item.style_score, 0) / decks.length),
  };

  return {
    app: "kelly-ppt-factory",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: {
      config_path: "demo://kelly-ppt-factory/config.json",
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
      source: "kelly-ppt-factory-demo",
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
    asset_brief: String(content.image_prompt || "Use the style kit's approved visual language."),
    style_checks: ["palette", "font hierarchy", "image ratio", "one message", "audience-readable copy"],
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
