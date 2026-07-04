const now = "2026-07-02T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = String(query.lang || "")
    .toLowerCase()
    .startsWith("zh");
  const snapshot = demoSnapshot(scenario, zh);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-lesson",
    data_provider: "demo",
    onboarding: { completed: true, completed_at: now, config_version: "demo" },
    lock: null,
    config_summary: demoConfigSummary(zh),
    decisions: demoDecisions(zh),
    agent_tasks: demoAgentTasks(zh),
    execution_report: demoExecutionReport(),
    snapshot,
  };
}

function demoConfigSummary(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return {
    config_path: "demo://kelly-lesson/config.json",
    is_example: false,
    school: {
      name: L("Northlake Middle School", "北湖中学"),
      kind: "middle_school",
      term: L("2026–2027 Term 1", "2026—2027 学年第一学期"),
      class_length_minutes: 45,
    },
    subjects: [L("Math", "数学"), L("Chinese", "语文"), L("English", "英语"), L("Physics", "物理")],
    grades: [L("Grade 7", "七年级"), L("Grade 8", "八年级"), L("Grade 9", "九年级")],
    template_sections: demoRules(zh).template_sections,
    compliance_rules: demoRules(zh).rules.map((rule) => ({
      rule_id: rule.rule_id,
      name: rule.name,
      severity: rule.severity,
      type: rule.type,
    })),
    export: { format: "markdown", out_dir: "exports", docx_via_agent: true },
    feedback: {
      handoff_skill: "kelly-email",
      requires_approval: true,
      secret_envs: [],
      secrets_ready: true,
    },
  };
}

function demoDecisions(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return {
    updated_at: "2026-07-01T16:20:00.000Z",
    decisions: {
      "rv-beiying": {
        action: "request_changes",
        comment: L(
          "Timing is missing for two stages and there is no homework. Ask Daniel to complete both, then re-check.",
          "有两个环节没有标注时间，也没有布置作业。请徐老师补齐后重新检查。",
        ),
        decided_at: "2026-07-01T15:52:00.000Z",
      },
      "rv-listening": {
        action: "approve",
        comment: L("Approved. Publish to the library and send the feedback note.", "已批准。归入教案库并发送反馈。"),
        decided_at: "2026-07-01T16:05:00.000Z",
      },
      "rv-reading": {
        action: "block",
        comment: L(
          "Not on the school template at all. Blocked until it is rewritten; share the template with Frank.",
          "完全没有使用学校模板。退回重写，请把模板发给邓老师。",
        ),
        decided_at: "2026-07-01T16:20:00.000Z",
      },
    },
  };
}

function demoAgentTasks(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return {
    updated_at: "2026-07-01T15:52:00.000Z",
    tasks: [
      {
        task_id: "task-rv-beiying-1783094720000",
        type: "revise_plan",
        review_id: "rv-beiying",
        plan_id: "plan-chinese-beiying",
        ref: 4,
        comment: L(
          "Timing is missing for two stages and there is no homework. Ask Daniel to complete both, then re-check.",
          "有两个环节没有标注时间，也没有布置作业。请徐老师补齐后重新检查。",
        ),
        requested_at: "2026-07-01T15:52:00.000Z",
        status: "queued",
      },
    ],
  };
}

function demoExecutionReport() {
  return {
    executed_at: "2026-06-28T10:05:00.000Z",
    dry_run: false,
    source: "kelly-lesson-demo",
    results: [
      {
        review_id: "rv-congruent",
        plan_id: "plan-math-congruent",
        ref: 3,
        status: "executed",
        operation: "publish_plan",
        target: "exports/grade-8-math-congruent-triangles.md",
        executed_at: "2026-06-28T10:05:00.000Z",
      },
      {
        review_id: "rv-stats",
        plan_id: "plan-math-stats",
        ref: 12,
        status: "executed",
        operation: "publish_plan",
        target: "exports/grade-8-math-data-statistics.md",
        executed_at: "2026-06-28T10:05:00.000Z",
      },
    ],
  };
}

function demoRules(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return {
    template_sections: [
      { key: "objectives", label: L("Learning objectives", "教学目标"), required: true },
      { key: "key_points", label: L("Key points", "教学重点"), required: true },
      { key: "difficulties", label: L("Difficulties", "教学难点"), required: true },
      { key: "materials", label: L("Materials & preparation", "教具与课前准备"), required: true },
      { key: "stages", label: L("Lesson flow stages", "教学环节"), required: true },
      { key: "board_plan", label: L("Board plan", "板书设计"), required: true },
      { key: "homework", label: L("Homework", "作业布置"), required: true },
      { key: "reflection", label: L("Teaching reflection", "教学反思"), required: false },
      { key: "curriculum_refs", label: L("Curriculum standard refs", "课标依据"), required: false },
      { key: "safety_notes", label: L("Safety notes (lab lessons)", "安全提示（实验课）"), required: false },
    ],
    rules: [
      {
        rule_id: "measurable_objectives",
        name: L("Objectives are measurable", "教学目标可测量"),
        severity: "error",
        type: "deterministic",
      },
      {
        rule_id: "stage_count_timing",
        name: L("3+ stages with time allocation", "教学环节≥3个且标注时间"),
        severity: "error",
        type: "deterministic",
      },
      {
        rule_id: "duration_sum",
        name: L("Stage timing sums to class length", "环节时间合计等于课时长度"),
        severity: "error",
        type: "deterministic",
      },
      {
        rule_id: "homework_assigned",
        name: L("Homework assigned", "布置了课后作业"),
        severity: "warning",
        type: "deterministic",
      },
      {
        rule_id: "template_sections",
        name: L("Uses school template sections", "使用学校模板栏目"),
        severity: "error",
        type: "deterministic",
      },
      {
        rule_id: "safety_note_lab",
        name: L("Safety note for lab lessons", "实验课包含安全提示"),
        severity: "error",
        type: "deterministic",
      },
      {
        rule_id: "curriculum_alignment",
        name: L("Objectives align with curriculum refs", "目标对应课标条目"),
        severity: "warning",
        type: "agent_review",
      },
    ],
  };
}

function demoSnapshot(scenario, zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  const { rules } = demoRules(zh);

  const MATH = L("Math", "数学");
  const CHINESE = L("Chinese", "语文");
  const ENGLISH = L("English", "英语");
  const PHYSICS = L("Physics", "物理");
  const G7 = L("Grade 7", "七年级");
  const G8 = L("Grade 8", "八年级");
  const G9 = L("Grade 9", "九年级");

  const teachers = [
    teacher("t-wang", L("Alice Wong", "王丽芳"), MATH, [G7]),
    teacher("t-zhao", L("Brian Zhao", "赵斌"), MATH, [G8, G9]),
    teacher("t-lin", L("Carol Lin", "林春燕"), CHINESE, [G7]),
    teacher("t-xu", L("Daniel Xu", "徐大伟"), CHINESE, [G8]),
    teacher("t-song", L("Emma Song", "宋雅文"), ENGLISH, [G7, G8]),
    teacher("t-deng", L("Frank Deng", "邓峰"), ENGLISH, [G9]),
    teacher("t-hu", L("Grace Hu", "胡桂香"), PHYSICS, [G8]),
    teacher("t-ma", L("Henry Ma", "马宏"), PHYSICS, [G9]),
  ];

  const plans = [
    plan({
      plan_id: "plan-math-linear-eq",
      ref: 1,
      title: L("Solving Linear Equations in One Variable — Lesson 1", "七年级数学《一元一次方程》第一课时"),
      subject: MATH,
      grade: G7,
      unit: L("Unit 3: Equations", "第三单元 方程"),
      teacher_id: "t-wang",
      source: "agent_draft",
      status: "approved",
      compliance_score: 98,
      updated_at: "2026-07-01T09:10:00.000Z",
      sections: {
        objectives: [
          L(
            "Solve one-variable linear equations of the form ax + b = c using the properties of equality.",
            "运用等式的基本性质，解形如 ax+b=c 的一元一次方程。",
          ),
          L(
            "Explain the justification for each transformation step when solving.",
            "能说出解方程每一步变形所依据的等式性质。",
          ),
          L(
            "Apply a linear equation to model and solve one real-world word problem.",
            "能运用一元一次方程解决一个实际问题。",
          ),
        ],
        key_points: [
          L("Properties of equality", "等式的基本性质"),
          L("Standard solving procedure: simplify, isolate, verify", "解方程的一般步骤：化简、移项、检验"),
        ],
        difficulties: [L("Sign errors when moving terms across the equals sign", "移项变号的理解与正确运用")],
        materials: [
          L("Balance scale demo", "天平演示教具"),
          L("Worksheet 3.1 (tiered)", "分层练习卷 3.1"),
          L("Slides: equation transformations", "课件：方程的变形"),
        ],
        stages: [
          stage(
            L("Warm-up review", "复习导入"),
            5,
            L("Balance puzzles recap the properties of equality.", "用天平小谜题回顾等式的基本性质。"),
          ),
          stage(
            L("Concept building", "新知建构"),
            12,
            L("Derive the solving steps from the balance model.", "由天平模型归纳解一元一次方程的步骤。"),
          ),
          stage(
            L("Guided practice", "例题精讲"),
            10,
            L("Solve three equations together, verbalizing each property used.", "师生共解三道例题，说出每步依据。"),
          ),
          stage(
            L("Independent practice", "巩固练习"),
            12,
            L("Worksheet 3.1 tiered problems with pair checking.", "完成练习卷 3.1 分层训练，同伴互查。"),
          ),
          stage(
            L("Summary & assignment", "小结与布置"),
            6,
            L("Students summarize the procedure; assign homework.", "学生归纳解题步骤，布置课后作业。"),
          ),
        ],
        board_plan: L(
          "Left: balance sketch and properties of equality. Center: worked example with every step labeled. Right: common sign errors.",
          "左侧：天平示意图与等式性质；中间：例题分步板演并标注依据；右侧：易错点（移项变号）。",
        ),
        homework: L(
          "Textbook p.87 problems 1–6; challenge: write one word problem solvable by a linear equation.",
          "课本第 87 页第 1–6 题；挑战题：编一道可用一元一次方程解决的应用题。",
        ),
        reflection: L(
          "Watch for students applying inverse operations mechanically; revisit the balance model if step justification is weak.",
          "关注学生是否机械套用步骤；若说理薄弱，下一课时回到天平模型强化理解。",
        ),
        curriculum_refs: [
          L("Standards: Expressions & Equations 7.EE.4a", "《义务教育数学课程标准（2022）》方程与不等式 7.2.1"),
        ],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-math-quadratic",
      ref: 2,
      title: L("Quadratic Functions: Graphs — Lesson 1", "九年级数学《二次函数的图象》第一课时"),
      subject: MATH,
      grade: G9,
      unit: L("Unit 2: Quadratic Functions", "第二单元 二次函数"),
      teacher_id: "t-zhao",
      source: "teacher_import",
      status: "needs_review",
      compliance_score: 74,
      updated_at: "2026-07-01T14:40:00.000Z",
      sections: {
        objectives: [
          L("Understand the graph of y = ax².", "理解 y=ax² 的图象。"),
          L("Appreciate the beauty of symmetry in parabolas.", "体会抛物线对称之美。"),
        ],
        key_points: [L("Shape and symmetry of the parabola", "抛物线的形状与对称性")],
        difficulties: [L("Effect of the coefficient a on the opening", "系数 a 对开口方向和大小的影响")],
        materials: [L("Graphing software", "几何画板"), L("Grid handouts", "方格纸")],
        stages: [
          stage(L("Review of functions", "函数复习"), 8, L("Recall linear function graphs.", "回顾一次函数图象。")),
          stage(
            L("Plotting y = x²", "描点画 y=x²"),
            15,
            L("Students plot points and connect the curve.", "学生列表、描点、连线。"),
          ),
          stage(
            L("Comparing coefficients", "比较系数"),
            14,
            L("Explore y = 2x² and y = -x² with software.", "用画板探究 y=2x² 与 y=-x²。"),
          ),
          stage(L("Summary", "课堂小结"), 8, L("Summarize opening direction and symmetry.", "归纳开口方向与对称性。")),
        ],
        board_plan: L(
          "Three parabolas on one grid with labels for vertex and axis.",
          "同一坐标系中三条抛物线，标注顶点与对称轴。",
        ),
        homework: L("Textbook p.36 problems 1–4.", "课本第 36 页第 1–4 题。"),
        reflection: "",
        curriculum_refs: [],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-math-congruent",
      ref: 3,
      title: L("Congruent Triangles: SSS Criterion", "八年级数学《全等三角形：SSS 判定》"),
      subject: MATH,
      grade: G8,
      unit: L("Unit 1: Congruence", "第一单元 全等三角形"),
      teacher_id: "t-zhao",
      source: "agent_draft",
      status: "done",
      compliance_score: 92,
      updated_at: "2026-06-28T10:05:00.000Z",
      sections: {
        objectives: [
          L(
            "State the SSS criterion and use it to prove two triangles congruent.",
            "能叙述 SSS 判定并用其证明两个三角形全等。",
          ),
          L("Construct a triangle from three given side lengths with compass and ruler.", "会用尺规按三边作三角形。"),
        ],
        key_points: [L("SSS congruence criterion", "SSS 全等判定")],
        difficulties: [L("Writing a complete congruence proof", "规范书写全等证明过程")],
        materials: [L("Compasses and rulers", "圆规与直尺"), L("Straw triangles kit", "吸管拼三角形材料")],
        stages: [
          stage(
            L("Hands-on exploration", "动手探究"),
            12,
            L("Build triangles from fixed side lengths; compare results.", "用固定边长拼三角形并比较结果。"),
          ),
          stage(
            L("Criterion statement", "归纳判定"),
            10,
            L("Formalize SSS from the exploration.", "由操作归纳出 SSS 判定。"),
          ),
          stage(
            L("Proof practice", "证明练习"),
            17,
            L("Two guided proofs, one independent.", "两道引导证明，一道独立完成。"),
          ),
          stage(
            L("Summary & assignment", "小结与布置"),
            6,
            L("Recap proof format; assign homework.", "回顾证明格式，布置作业。"),
          ),
        ],
        board_plan: L(
          "Criterion statement, model proof with numbered steps, common mistakes corner.",
          "判定内容、编号书写的示范证明、易错角落。",
        ),
        homework: L(
          "Textbook p.12 problems 2, 3, 5; prove one pair of triangles from the classroom poster.",
          "课本第 12 页第 2、3、5 题；证明教室挂图中的一组全等三角形。",
        ),
        reflection: L("Straw kit worked well; keep groups of three.", "拼接材料效果好，维持三人小组。"),
        curriculum_refs: [L("Standards: Congruence G8.1", "《义务教育数学课程标准（2022）》图形与几何 8.1")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-chinese-beiying",
      ref: 4,
      title: L("Reading: 'Bei Ying' (Retreating Figure) — Lesson 1", "八年级语文《背影》第一课时"),
      subject: CHINESE,
      grade: G8,
      unit: L("Unit 4: Family and Affection", "第四单元 亲情"),
      teacher_id: "t-xu",
      source: "teacher_import",
      status: "changes_requested",
      compliance_score: 61,
      updated_at: "2026-07-01T15:52:00.000Z",
      sections: {
        objectives: [
          L(
            "Summarize the four appearances of the father's retreating figure in the text.",
            "梳理并概括文中四次写“背影”的内容。",
          ),
          L("Analyze how detail description conveys the father's love.", "分析细节描写如何表现父爱。"),
        ],
        key_points: [L("Detail description of the station scene", "买橘送别场景的细节描写")],
        difficulties: [L("Understanding restrained emotion in plain language", "体会朴实语言中的深沉情感")],
        materials: [L("Text annotations handout", "课文批注学习单")],
        stages: [
          stage(
            L("Author and context", "作者与背景"),
            8,
            L("Introduce Zhu Ziqing and the family situation.", "介绍朱自清及写作背景。"),
          ),
          stage(
            L("First reading", "初读感知"),
            12,
            L("Silent reading; mark the four 'bei ying' moments.", "默读课文，圈画四次“背影”。"),
          ),
          stage(L("Close reading", "精读品析"), 0, L("Analyze the platform scene.", "品析月台买橘场景。")),
          stage(
            L("Discussion", "讨论交流"),
            0,
            L("Share a family memory sparked by the text.", "结合课文交流自己的亲情记忆。"),
          ),
        ],
        board_plan: L("Four 'bei ying' timeline with emotional keywords.", "四次“背影”时间轴与情感关键词。"),
        homework: "",
        reflection: "",
        curriculum_refs: [L("Standards: Literary reading G8", "《义务教育语文课程标准（2022）》文学阅读与创意表达")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-chinese-poetry",
      ref: 5,
      title: L("Classical Poetry: 'Viewing the Mountain' — Lesson 1", "七年级语文《望岳》第一课时"),
      subject: CHINESE,
      grade: G7,
      unit: L("Unit 5: Classical Poetry", "第五单元 古代诗歌"),
      teacher_id: "t-lin",
      source: "agent_draft",
      status: "approved",
      compliance_score: 95,
      updated_at: "2026-06-30T11:20:00.000Z",
      sections: {
        objectives: [
          L("Recite the poem fluently and from memory.", "能正确、流利、有感情地背诵《望岳》。"),
          L(
            "Explain the meaning of key images such as 'zaohua' and 'ceng yun'.",
            "能解释“造化”“层云”等关键意象的含义。",
          ),
          L("Describe the poet's aspiration expressed in the final couplet.", "能说出尾联表达的诗人抱负。"),
        ],
        key_points: [L("Imagery and structure of the poem", "诗歌意象与结构")],
        difficulties: [L("Linking imagery to the poet's ambition", "由景入情，理解诗人志向")],
        materials: [L("Audio recitation", "范读音频"), L("Mount Tai photo set", "泰山组图")],
        stages: [
          stage(
            L("Image-led opening", "情境导入"),
            6,
            L("Mount Tai photos; students describe the view.", "出示泰山组图，学生描述所见。"),
          ),
          stage(
            L("Reading aloud", "朗读感知"),
            12,
            L("Model reading, choral reading, rhythm marking.", "范读、齐读，划分节奏。"),
          ),
          stage(
            L("Line-by-line study", "逐联品读"),
            15,
            L("Unpack images couplet by couplet.", "逐联解读意象与情感。"),
          ),
          stage(
            L("Recitation & summary", "背诵与小结"),
            12,
            L("Memory scaffold, group recitation, summary.", "支架式背诵，小组展示，课堂小结。"),
          ),
        ],
        board_plan: L(
          "Poem structure ladder: view → distance → detail → aspiration.",
          "板书阶梯：远望—近望—细望—抒怀。",
        ),
        homework: L(
          "Recite to family; write four lines imitating the 'gazing' structure.",
          "背诵给家人听；仿“望”的结构写四行小诗。",
        ),
        reflection: L("Rhythm marking helped weaker readers keep pace.", "节奏划分对朗读较弱的学生帮助明显。"),
        curriculum_refs: [L("Standards: Classical poetry recitation G7", "《义务教育语文课程标准（2022）》古诗文诵读")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-eng-daily",
      ref: 6,
      title: L(
        "Unit 4: My Daily Routine — Lesson 2 (Speaking)",
        "七年级英语 Unit 4《My Daily Routine》第二课时（口语）",
      ),
      subject: ENGLISH,
      grade: G7,
      unit: L("Unit 4: Daily Life", "第四单元 Daily Life"),
      teacher_id: "t-song",
      source: "agent_draft",
      status: "needs_review",
      compliance_score: 88,
      updated_at: "2026-07-01T13:15:00.000Z",
      sections: {
        objectives: [
          L(
            "Use frequency adverbs (always, usually, never) to describe daily routines in pair talk.",
            "能在对话中运用频度副词（always、usually、never）描述日常作息。",
          ),
          L(
            "Ask and answer 'What time do you…?' questions with correct third-person forms.",
            "能正确使用第三人称形式进行 What time do you…? 问答。",
          ),
        ],
        key_points: [L("Frequency adverbs and time expressions", "频度副词与时间表达")],
        difficulties: [L("Third-person singular -s in fast speech", "口语中第三人称单数 -s 的落实")],
        materials: [L("Clock cards", "钟面卡片"), L("Routine picture strips", "作息图片条")],
        stages: [
          stage(L("Warm-up chant", "热身吟唱"), 5, L("Daily-routine chant with gestures.", "配动作的作息韵律操。")),
          stage(
            L("Presentation", "呈现新知"),
            12,
            L("Clock cards drill time expressions.", "用钟面卡片操练时间表达。"),
          ),
          stage(
            L("Pair interview", "同伴采访"),
            16,
            L("Interview partner; fill the routine grid.", "采访同伴并填写作息表格。"),
          ),
          stage(
            L("Report out", "汇报展示"),
            10,
            L("Report partner's routine in third person.", "用第三人称汇报同伴作息。"),
          ),
        ],
        board_plan: L(
          "Timeline with frequency adverb ladder and sentence frames.",
          "时间轴 + 频度副词阶梯 + 句型框架。",
        ),
        homework: L(
          "Record a 60-second audio describing your family member's routine.",
          "录一段 60 秒音频，描述家人的日常作息。",
        ),
        reflection: "",
        curriculum_refs: [L("Standards: Spoken interaction Level 3", "《义务教育英语课程标准（2022）》口语交际三级")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-eng-reading",
      ref: 7,
      title: L("Reading: Great Inventions", "九年级英语阅读课《Great Inventions》"),
      subject: ENGLISH,
      grade: G9,
      unit: L("Unit 6: Inventions", "第六单元 Inventions"),
      teacher_id: "t-deng",
      source: "teacher_import",
      status: "blocked",
      compliance_score: 42,
      updated_at: "2026-07-01T16:20:00.000Z",
      sections: {
        objectives: [
          L("Understand the passage about inventions.", "理解关于发明的课文。"),
          L("Learn new words.", "学习生词。"),
        ],
        key_points: [L("Passage comprehension", "语篇理解")],
        difficulties: [L("Long sentences in paragraph 3", "第三段长难句")],
        materials: [L("Textbook", "课本")],
        stages: [
          stage(
            L("Read the passage", "阅读课文"),
            0,
            L("Students read and underline new words.", "学生阅读并划出生词。"),
          ),
          stage(L("Answer questions", "回答问题"), 0, L("Go through the exercises.", "处理课后习题。")),
        ],
        board_plan: "",
        homework: L("Copy the new words three times.", "抄写生词三遍。"),
        reflection: "",
        curriculum_refs: [],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-phys-buoyancy",
      ref: 8,
      title: L("Buoyancy — Lesson 1", "八年级物理《浮力》第一课时"),
      subject: PHYSICS,
      grade: G8,
      unit: L("Chapter 10: Forces in Fluids", "第十章 流体中的力"),
      teacher_id: "t-hu",
      source: "agent_draft",
      status: "needs_review",
      compliance_score: 96,
      updated_at: "2026-07-02T08:20:00.000Z",
      sections: {
        objectives: [
          L(
            "Describe buoyant force and identify its direction on submerged and floating objects.",
            "能描述浮力，并指出浸没和漂浮物体所受浮力的方向。",
          ),
          L(
            "Measure the buoyant force on a block with a spring scale using the weight-difference method.",
            "会用弹簧测力计通过称重法测量物块所受浮力。",
          ),
          L(
            "Predict and verify how buoyant force changes with submerged depth.",
            "能预测并通过实验验证浮力随浸没深度的变化。",
          ),
        ],
        key_points: [L("Weight-difference method for measuring buoyancy", "称重法测浮力")],
        difficulties: [L("Buoyant force exists even on sinking objects", "下沉物体同样受到浮力")],
        materials: [
          L("Spring scales, metal blocks, beakers", "弹簧测力计、金属块、烧杯"),
          L("Water trays and towels", "水槽与抹布"),
          L("Lab worksheet 10.1", "实验记录单 10.1"),
        ],
        stages: [
          stage(
            L("Demo hook", "演示激趣"),
            6,
            L("Floating and sinking objects; students predict.", "浮沉演示，学生先猜想。"),
          ),
          stage(
            L("Concept building", "建立概念"),
            12,
            L("Define buoyant force; weight-difference method.", "定义浮力，讲解称重法。"),
          ),
          stage(
            L("Lab activity", "分组实验"),
            18,
            L("Groups measure buoyant force at three depths.", "小组测量三个深度下的浮力。"),
          ),
          stage(
            L("Data discussion & summary", "数据讨论与小结"),
            9,
            L("Compare group data; summarize findings.", "汇总各组数据，归纳结论。"),
          ),
        ],
        board_plan: L(
          "Force diagram of submerged block, F_buoyancy = G − F_spring, data table skeleton.",
          "浸没物块受力图，F浮 = G − F示，数据记录表框架。",
        ),
        homework: L(
          "Worksheet 10.1 questions 1–5; predict tomorrow's Archimedes experiment outcome in one sentence.",
          "实验册 10.1 第 1–5 题；用一句话预测下一课时阿基米德实验的结果。",
        ),
        reflection: "",
        curriculum_refs: [
          L("Standards: Mechanics — force and motion 2.2.9", "《义务教育物理课程标准（2022）》运动和相互作用 2.2.9"),
        ],
        safety_notes: L(
          "Keep water away from power sockets; use trays and wipe spills immediately; review glassware handling before the lab stage.",
          "水槽远离电源插座；使用托盘并及时擦干水渍；实验前复习玻璃器皿使用规范。",
        ),
      },
    }),
    plan({
      plan_id: "plan-phys-ohm",
      ref: 9,
      title: L("Ohm's Law Lab", "九年级物理《欧姆定律》实验课"),
      subject: PHYSICS,
      grade: G9,
      unit: L("Chapter 17: Ohm's Law", "第十七章 欧姆定律"),
      teacher_id: "t-ma",
      source: "teacher_import",
      status: "needs_review",
      compliance_score: 68,
      updated_at: "2026-07-01T17:05:00.000Z",
      sections: {
        objectives: [
          L("Understand Ohm's law.", "理解欧姆定律。"),
          L("Do the current-voltage experiment.", "完成电流电压实验。"),
        ],
        key_points: [L("Relationship between current and voltage", "电流与电压的关系")],
        difficulties: [L("Controlling variables with the sliding rheostat", "利用滑动变阻器控制变量")],
        materials: [L("Batteries, ammeters, voltmeters, rheostats", "电池、电流表、电压表、滑动变阻器")],
        stages: [
          stage(
            L("Circuit review", "电路复习"),
            8,
            L("Recall series circuit reading rules.", "回顾串联电路读数规则。"),
          ),
          stage(L("Experiment setup", "实验准备"), 10, L("Groups wire the measurement circuit.", "小组连接测量电路。")),
          stage(
            L("Data collection", "采集数据"),
            18,
            L("Vary voltage; record current three times.", "改变电压，三次记录电流。"),
          ),
          stage(
            L("Graphing & conclusion", "作图与结论"),
            9,
            L("Plot I–U graph; state the law.", "绘制 I–U 图象，得出结论。"),
          ),
        ],
        board_plan: L("Circuit diagram, data table, I–U axes.", "电路图、数据表、I–U 坐标系。"),
        homework: L("Finish the lab report; exercises p.82 1–3.", "完成实验报告；课本第 82 页第 1–3 题。"),
        reflection: "",
        curriculum_refs: [L("Standards: Electricity 2.4.4", "《义务教育物理课程标准（2022）》电磁能 2.4.4")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-eng-listening",
      ref: 10,
      title: L("Listening & Speaking: Travel Plans", "八年级英语听说课《Travel Plans》"),
      subject: ENGLISH,
      grade: G8,
      unit: L("Unit 5: Travel", "第五单元 Travel"),
      teacher_id: "t-song",
      source: "agent_draft",
      status: "approved",
      compliance_score: 93,
      updated_at: "2026-07-01T16:05:00.000Z",
      sections: {
        objectives: [
          L(
            "Extract destination, date, and transport details from two listening passages.",
            "能从两段听力材料中提取目的地、日期和交通方式等信息。",
          ),
          L(
            "Use 'be going to' to describe a travel plan in a two-minute pair talk.",
            "能用 be going to 在两分钟对话中描述旅行计划。",
          ),
        ],
        key_points: [L("Listening for specific information", "抓取细节信息的听力策略")],
        difficulties: [L("Linking sounds in dates and times", "日期与时间中的连读")],
        materials: [L("Audio tracks 5.1–5.2", "听力音频 5.1–5.2"), L("Travel plan cards", "旅行计划卡片")],
        stages: [
          stage(
            L("Lead-in", "导入"),
            5,
            L("Holiday photos; brainstorm travel words.", "假期照片导入，头脑风暴旅行词汇。"),
          ),
          stage(
            L("Listening tasks", "听力任务"),
            15,
            L("Two tiered listening passes with grids.", "两轮分层听力，完成信息表。"),
          ),
          stage(
            L("Language focus", "语言聚焦"),
            10,
            L("'be going to' forms from the transcript.", "从听力文本归纳 be going to 用法。"),
          ),
          stage(
            L("Pair speaking", "结对口语"),
            15,
            L("Plan a trip with cards; report to class.", "抽卡片设计行程并汇报。"),
          ),
        ],
        board_plan: L(
          "Information grid, 'be going to' frames, useful travel phrases.",
          "信息表格、be going to 句型框架、旅行常用语。",
        ),
        homework: L("Write a 6-sentence travel plan for the summer break.", "写一篇 6 句话的暑假旅行计划。"),
        reflection: L("Tiered listening kept early finishers engaged.", "分层听力让先完成的学生仍有任务。"),
        curriculum_refs: [L("Standards: Listening Level 4", "《义务教育英语课程标准（2022）》听力四级")],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-chinese-writing",
      ref: 11,
      title: L("Composition: Describing a Person — Lesson 1", "七年级语文写作课《写人要抓住特点》第一课时"),
      subject: CHINESE,
      grade: G7,
      unit: L("Unit 3: Writing Workshop", "第三单元 写作"),
      teacher_id: "t-lin",
      source: "teacher_import",
      status: "changes_requested",
      compliance_score: 70,
      updated_at: "2026-07-01T15:30:00.000Z",
      sections: {
        objectives: [
          L("Feel the charm of character description.", "感受写人文章的魅力。"),
          L("Improve writing ability.", "提高写作能力。"),
        ],
        key_points: [L("Selecting characteristic details", "选取有特点的细节")],
        difficulties: [L("Avoiding generic descriptions", "避免千人一面的描写")],
        materials: [L("Excerpt cards from three model texts", "三篇例文片段卡")],
        stages: [
          stage(L("Model text study", "例文品读"), 12, L("Compare three character sketches.", "比较三段写人片段。")),
          stage(L("Detail hunting", "细节捕捉"), 12, L("List classmates' distinctive habits.", "列举同学的独特习惯。")),
          stage(L("Drafting", "片段写作"), 15, L("Write a 150-character sketch.", "写 150 字人物片段。")),
          stage(
            L("Sharing", "交流点评"),
            6,
            L("Peer sharing with one-star-one-wish feedback.", "同伴互评：一颗星一个建议。"),
          ),
        ],
        board_plan: L("Detail types: appearance, action, speech, habit.", "细节类型：外貌、动作、语言、习惯。"),
        homework: L("Expand the sketch into a 400-character passage.", "将片段扩写为 400 字短文。"),
        reflection: "",
        curriculum_refs: [],
        safety_notes: "",
      },
    }),
    plan({
      plan_id: "plan-math-stats",
      ref: 12,
      title: L("Data & Statistics: Reading Charts", "八年级数学《数据的表示：统计图表》"),
      subject: MATH,
      grade: G8,
      unit: L("Unit 6: Data", "第六单元 数据的收集与表示"),
      teacher_id: "t-zhao",
      source: "agent_draft",
      status: "done",
      compliance_score: 96,
      updated_at: "2026-06-28T10:05:00.000Z",
      sections: {
        objectives: [
          L(
            "Read and interpret bar, line, and pie charts from real data.",
            "能读取并解释条形图、折线图和扇形图中的真实数据。",
          ),
          L(
            "Choose an appropriate chart type for a given data set and justify the choice.",
            "能为给定数据选择合适的统计图并说明理由。",
          ),
        ],
        key_points: [L("Chart selection criteria", "统计图选择依据")],
        difficulties: [L("Misleading axis scales", "坐标刻度带来的误导")],
        materials: [L("School canteen survey data", "食堂问卷数据"), L("Chart poster set", "统计图挂图")],
        stages: [
          stage(L("Data hook", "数据导入"), 6, L("Canteen survey results teaser.", "食堂问卷结果引入。")),
          stage(L("Chart gallery walk", "图表巡展"), 12, L("Stations for three chart types.", "三种统计图分站学习。")),
          stage(
            L("Chart choice debate", "选图辩论"),
            15,
            L("Teams justify chart choices for four data sets.", "小组为四组数据选图并辩护。"),
          ),
          stage(
            L("Summary & assignment", "小结与布置"),
            12,
            L("Summarize criteria; assign chart-making task.", "归纳选图依据，布置绘图任务。"),
          ),
        ],
        board_plan: L("Three chart sketches with 'best for…' labels.", "三种统计图简图并标注适用场景。"),
        homework: L(
          "Chart the class's one-week reading minutes; one paragraph of interpretation.",
          "把全班一周阅读时长绘制成统计图，并写一段解读。",
        ),
        reflection: L(
          "Debate format surfaced misconceptions about pie charts.",
          "辩论环节暴露了对扇形图的误解，效果好。",
        ),
        curriculum_refs: [
          L("Standards: Statistics & Probability 8.3", "《义务教育数学课程标准（2022）》统计与概率 8.3"),
        ],
        safety_notes: "",
      },
    }),
  ];

  const checks = buildChecks(plans, rules, zh);
  const review_items = buildReviewItems(zh);
  const activity_log = buildActivityLog(zh);

  const resolved = checks.filter((check) => ["pass", "warn", "fail"].includes(check.result));
  const metrics = {
    teacher_count: teachers.length,
    plan_count: plans.length,
    plans_approved: plans.filter((item) => ["approved", "done"].includes(item.status)).length,
    plans_in_revision: plans.filter((item) => item.status === "changes_requested").length,
    plans_needs_review: plans.filter((item) => item.status === "needs_review").length,
    checks_failed: checks.filter((check) => check.result === "fail").length,
    compliance_pass_rate: Math.round(
      (resolved.filter((check) => check.result === "pass").length / Math.max(1, resolved.length)) * 100,
    ),
  };

  return {
    schema_version: "1",
    generated_at: now,
    source: "kelly-lesson-demo",
    school: {
      name: zh ? "北湖中学" : "Northlake Middle School",
      kind: "middle_school",
      class_length_minutes: 45,
      term: zh ? "2026—2027 学年第一学期" : "2026–2027 Term 1",
    },
    metrics,
    teachers,
    plans,
    rules,
    checks,
    review_items,
    activity_log,
    warnings: ["review", "checks", "detail"].includes(scenario)
      ? [
          {
            id: "ohm-safety-missing",
            severity: "warning",
            plan_id: "plan-phys-ohm",
            message: zh
              ? "《欧姆定律》实验课缺少安全提示，批准前必须补齐。"
              : "The Ohm's Law lab plan has no safety note; it must be added before approval.",
            detail: zh ? "演示提醒，未读取真实教案数据。" : "Demo warning, no live plan data.",
          },
        ]
      : [],
  };
}

function buildChecks(plans, rules, zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  const overrides = {
    "plan-math-quadratic": {
      measurable_objectives: [
        "warn",
        L(
          "Objectives use 'understand' and 'appreciate' with no observable behavior.",
          "目标使用“理解”“体会”，缺少可观察的行为动词。",
        ),
      ],
      curriculum_alignment: ["warn", L("No curriculum standard refs listed.", "未填写课标依据。")],
    },
    "plan-chinese-beiying": {
      stage_count_timing: ["fail", L("4 stages but 2 have no time allocation.", "共 4 个环节，其中 2 个未标注时间。")],
      duration_sum: [
        "fail",
        L("Timed stages total 20 min of a 45 min class.", "已标时环节合计 20 分钟，课时为 45 分钟。"),
      ],
      homework_assigned: ["fail", L("Homework section is empty.", "作业栏目为空。")],
    },
    "plan-eng-daily": {
      duration_sum: ["warn", L("Stages total 43 min vs 45 min class length.", "环节合计 43 分钟，课时为 45 分钟。")],
      curriculum_alignment: [
        "agent_review",
        L("Awaiting agent judgement against Unit 4 standard descriptors.", "待智能体对照第四单元课标描述判断。"),
      ],
    },
    "plan-eng-reading": {
      measurable_objectives: ["warn", L("'Understand the passage' is not measurable.", "“理解课文”不可测量。")],
      stage_count_timing: ["fail", L("Only 2 stages listed and none are timed.", "仅列出 2 个环节，且均未标注时间。")],
      duration_sum: ["fail", L("No stage timing recorded at all.", "完全没有时间分配记录。")],
      template_sections: ["fail", L("Missing board plan and reflection sections.", "缺少板书设计和教学反思栏目。")],
      curriculum_alignment: ["warn", L("No curriculum standard refs listed.", "未填写课标依据。")],
    },
    "plan-phys-buoyancy": {
      curriculum_alignment: [
        "agent_review",
        L("Awaiting agent judgement against mechanics descriptor 2.2.9.", "待智能体对照课标 2.2.9 条目判断。"),
      ],
    },
    "plan-phys-ohm": {
      measurable_objectives: [
        "warn",
        L("'Understand Ohm's law' has no observable behavior.", "“理解欧姆定律”缺少可观察行为。"),
      ],
      safety_note_lab: [
        "fail",
        L("Lab lesson with beakers and circuits but no safety note.", "涉及电路实验，但没有任何安全提示。"),
      ],
    },
    "plan-chinese-writing": {
      measurable_objectives: [
        "warn",
        L("'Feel the charm' and 'improve ability' are not measurable.", "“感受魅力”“提高能力”不可测量。"),
      ],
      curriculum_alignment: ["warn", L("No curriculum standard refs listed.", "未填写课标依据。")],
    },
  };

  const checks = [];
  for (const plan of plans) {
    const stages = plan.sections.stages || [];
    const timed = stages.filter((item) => Number(item.minutes) > 0);
    const total = stages.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    const defaults = {
      measurable_objectives: L(
        `${plan.sections.objectives.length} objectives, all with measurable verbs.`,
        `共 ${plan.sections.objectives.length} 条目标，均含可测量行为动词。`,
      ),
      stage_count_timing: L(
        `${stages.length} stages, all with time allocation.`,
        `共 ${stages.length} 个环节，均已标注时间。`,
      ),
      duration_sum: L(
        `Stages total ${total} min for a ${plan.class_length_minutes} min class.`,
        `环节合计 ${total} 分钟，课时 ${plan.class_length_minutes} 分钟。`,
      ),
      homework_assigned: plan.sections.homework
        ? L(`Homework: "${plan.sections.homework.slice(0, 60)}"`, `作业：“${plan.sections.homework.slice(0, 40)}”`)
        : L("Homework section is empty.", "作业栏目为空。"),
      template_sections: L("All required template sections are present.", "学校模板必填栏目齐全。"),
      safety_note_lab: plan.sections.safety_notes
        ? L(
            `Safety note present: "${plan.sections.safety_notes.slice(0, 60)}"`,
            `安全提示：“${plan.sections.safety_notes.slice(0, 40)}”`,
          )
        : L("Not a lab lesson; no safety note required.", "非实验课，无需安全提示。"),
      curriculum_alignment: plan.sections.curriculum_refs?.length
        ? L(
            `Refs: ${plan.sections.curriculum_refs.join("; ")}`,
            `课标依据：${plan.sections.curriculum_refs.join("；")}`,
          )
        : L("No curriculum standard refs listed.", "未填写课标依据。"),
    };
    for (const rule of rules) {
      const override = overrides[plan.plan_id]?.[rule.rule_id];
      const result = override
        ? override[0]
        : rule.type === "agent_review" && plan.sections.curriculum_refs?.length
          ? "pass"
          : rule.type === "agent_review"
            ? "warn"
            : "pass";
      const evidence = override ? override[1] : defaults[rule.rule_id];
      checks.push({
        check_id: `chk-${plan.plan_id.replace(/^plan-/, "")}-${rule.rule_id}`,
        plan_id: plan.plan_id,
        rule_id: rule.rule_id,
        severity: rule.severity,
        result,
        evidence,
        checked_at: now,
      });
    }
    void timed;
  }
  return checks;
}

function buildReviewItems(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return [
    reviewItem({
      review_id: "rv-quadratic",
      ref: 2,
      plan_id: "plan-math-quadratic",
      status: "needs_review",
      compliance_summary: L(
        "Score 74 — 2 warnings: objectives not measurable, no curriculum refs.",
        "得分 74——2 项提醒：目标不可测量、缺少课标依据。",
      ),
      suggestions: [
        L(
          "Rewrite both objectives with observable verbs, e.g. 'sketch the graph of y = ax² and identify vertex and axis of symmetry'.",
          "将两条目标改为可观察行为动词，如“会画 y=ax² 的图象，并说出顶点和对称轴”。",
        ),
        L("Add the curriculum standard reference for quadratic functions.", "补充二次函数对应的课标条目。"),
      ],
      feedback_draft: L(
        "Hi Brian,\n\nThe Grade 9 'Quadratic Functions: Graphs' plan is close to approval. Two adjustments first:\n\n1. Restate the objectives with observable verbs — e.g. 'sketch the graph of y = ax² and identify its vertex and axis of symmetry'.\n2. Add the curriculum standard reference for quadratic functions.\n\nThe lesson flow and timing look solid. Send it back once updated and I will re-run the checks.\n\nThanks,\nDean's Office",
        "赵老师您好：\n\n九年级《二次函数的图象》教案已接近通过，批准前请调整两点：\n\n1. 教学目标改为可观察的行为动词，如“会画 y=ax² 的图象，并说出顶点和对称轴”；\n2. 补充二次函数对应的课标条目。\n\n教学环节与时间分配没有问题。修改后发回，我会重新运行检查。\n\n教导处",
      ),
    }),
    reviewItem({
      review_id: "rv-beiying",
      ref: 4,
      plan_id: "plan-chinese-beiying",
      status: "changes_requested",
      compliance_summary: L(
        "Score 61 — 3 failures: 2 stages untimed, timing sums to 20/45, no homework.",
        "得分 61——3 项不合格：2 个环节未标时、时间合计 20/45、未布置作业。",
      ),
      suggestions: [
        L("Add minutes to the close-reading and discussion stages.", "为“精读品析”“讨论交流”两个环节补充时间。"),
        L("Assign homework tied to the detail-description objective.", "布置与细节描写目标相关的作业。"),
      ],
      feedback_draft: L(
        "Hi Daniel,\n\nThe 'Bei Ying' Lesson 1 plan reads well, but the school template needs two fixes before review:\n\n1. The close-reading and discussion stages have no time allocation — the timed stages only sum to 20 of 45 minutes.\n2. The homework section is empty; a short detail-description task would fit the objectives.\n\nPlease complete both and resubmit.\n\nThanks,\nDean's Office",
        "徐老师您好：\n\n《背影》第一课时教案内容不错，但按学校模板还需补充两处：\n\n1. “精读品析”“讨论交流”两个环节未标注时间，目前已标时环节仅合计 20 分钟（课时 45 分钟）；\n2. 作业栏目为空，建议布置一个与细节描写目标相关的小练笔。\n\n请补齐后重新提交。\n\n教导处",
      ),
    }),
    reviewItem({
      review_id: "rv-ohm",
      ref: 9,
      plan_id: "plan-phys-ohm",
      status: "needs_review",
      compliance_summary: L(
        "Score 68 — 1 failure: lab lesson without a safety note; 1 warning on objectives.",
        "得分 68——1 项不合格：实验课缺少安全提示；1 项目标提醒。",
      ),
      suggestions: [
        L(
          "Add a safety note covering battery handling and not exceeding rated voltage.",
          "补充安全提示：电池使用规范、不得超过额定电压。",
        ),
        L(
          "Restate 'Understand Ohm's law' as an observable outcome, e.g. 'state and apply I = U/R to compute one quantity'.",
          "将“理解欧姆定律”改为可观察结果，如“能陈述并运用 I=U/R 计算其中一个量”。",
        ),
      ],
      feedback_draft: L(
        "Hi Henry,\n\nThe Ohm's Law lab plan cannot be approved yet: school policy requires an explicit safety note for every lab lesson, and this one has none. Please add battery-handling rules and the voltage limit for the group circuits.\n\nAlso consider restating 'Understand Ohm's law' as an observable outcome.\n\nThanks,\nDean's Office",
        "马老师您好：\n\n《欧姆定律》实验课教案暂时无法批准：按学校规定，实验课必须包含明确的安全提示，目前教案中没有。请补充电池使用规范和小组电路的电压上限。\n\n另外建议将“理解欧姆定律”改为可观察的学习结果。\n\n教导处",
      ),
    }),
    reviewItem({
      review_id: "rv-listening",
      ref: 10,
      plan_id: "plan-eng-listening",
      status: "approved",
      compliance_summary: L(
        "Score 93 — all checks pass; tiered listening tasks are a model example.",
        "得分 93——全部检查通过，分层听力任务可作范例。",
      ),
      suggestions: [
        L(
          "Consider sharing the tiered listening grid at the next English teaching group meeting.",
          "建议在下次英语教研组会议上分享分层听力表格设计。",
        ),
      ],
      feedback_draft: L(
        "Hi Emma,\n\n'Travel Plans' is approved — every compliance check passes and the tiered listening grids are exactly the differentiation we want to see. I'd like to feature this plan at the next teaching group meeting.\n\nWell done,\nDean's Office",
        "宋老师您好：\n\n《Travel Plans》听说课教案已批准——所有合规检查全部通过，分层听力表格正是我们期望看到的差异化设计。希望在下次教研组会议上把这份教案作为范例分享。\n\n做得很好！\n\n教导处",
      ),
    }),
    reviewItem({
      review_id: "rv-reading",
      ref: 7,
      plan_id: "plan-eng-reading",
      status: "blocked",
      compliance_summary: L(
        "Score 42 — 3 failures: not on school template, 2 untimed stages, no board plan or reflection.",
        "得分 42——3 项不合格：未使用学校模板、环节未标时、缺少板书设计与教学反思。",
      ),
      suggestions: [
        L(
          "Rewrite the plan on the school template with all required sections.",
          "按学校模板重写教案，补齐所有必填栏目。",
        ),
        L("Break the lesson into at least 3 timed stages.", "将课堂拆分为至少 3 个标注时间的环节。"),
      ],
      feedback_draft: L(
        "Hi Frank,\n\nThe 'Great Inventions' reading plan is blocked for now: it is not on the school template, several required sections are missing, and no stage has a time allocation. Please rewrite it on the template — I have shared the file and Emma's approved listening plan as a reference.\n\nThanks,\nDean's Office",
        "邓老师您好：\n\n《Great Inventions》阅读课教案暂缓通过：未使用学校模板，多个必填栏目缺失，各环节也没有时间分配。请按模板重写——模板文件和宋老师已批准的听说课教案已发给您作参考。\n\n教导处",
      ),
    }),
  ];
}

function buildActivityLog(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  return [
    activity(
      "act-1",
      "2026-07-02T08:20:00.000Z",
      "agent",
      L(
        "Drafted 'Buoyancy — Lesson 1' from Chapter 10 materials and the school template.",
        "根据第十章材料和学校模板起草《浮力》第一课时教案。",
      ),
      "plan-phys-buoyancy",
    ),
    activity(
      "act-2",
      "2026-07-01T17:05:00.000Z",
      "agent",
      L(
        "Imported Henry Ma's Ohm's Law lab plan and ran compliance checks: 1 failure.",
        "导入马宏老师《欧姆定律》实验课教案并运行合规检查：1 项不合格。",
      ),
      "plan-phys-ohm",
    ),
    activity(
      "act-3",
      "2026-07-01T16:20:00.000Z",
      "dean",
      L(
        "Blocked 'Great Inventions' — must be rewritten on the school template.",
        "退回《Great Inventions》——需按学校模板重写。",
      ),
      "plan-eng-reading",
    ),
    activity(
      "act-4",
      "2026-07-01T16:05:00.000Z",
      "dean",
      L("Approved 'Travel Plans'; feedback note queued for sending.", "批准《Travel Plans》，反馈已进入待发送队列。"),
      "plan-eng-listening",
    ),
    activity(
      "act-5",
      "2026-07-01T15:52:00.000Z",
      "dean",
      L(
        "Requested changes on 'Bei Ying' Lesson 1: timing and homework.",
        "对《背影》第一课时提出修改：补时间分配和作业。",
      ),
      "plan-chinese-beiying",
    ),
    activity(
      "act-6",
      "2026-07-01T14:40:00.000Z",
      "agent",
      L(
        "Imported Brian Zhao's quadratic functions plan; checks found 2 warnings.",
        "导入赵斌老师二次函数教案，检查发现 2 项提醒。",
      ),
      "plan-math-quadratic",
    ),
    activity(
      "act-7",
      "2026-06-30T11:20:00.000Z",
      "dean",
      L("Approved 'Viewing the Mountain' Lesson 1.", "批准《望岳》第一课时。"),
      "plan-chinese-poetry",
    ),
    activity(
      "act-8",
      "2026-06-28T10:05:00.000Z",
      "agent",
      L(
        "Exported 2 approved Math plans to the library as Markdown.",
        "将 2 份已批准的数学教案导出为 Markdown 归入教案库。",
      ),
      "plan-math-congruent",
    ),
  ];
}

function teacher(teacher_id, name, subject, grades) {
  return { teacher_id, name, subject, grades };
}

function stage(name, minutes, activities) {
  return { name, minutes, activities };
}

function plan(input) {
  return {
    plan_id: input.plan_id,
    ref: input.ref,
    title: input.title,
    subject: input.subject,
    grade: input.grade,
    unit: input.unit,
    teacher_id: input.teacher_id,
    source: input.source,
    status: input.status,
    compliance_score: input.compliance_score,
    class_length_minutes: 45,
    duration_minutes: (input.sections.stages || []).reduce((sum, item) => sum + Number(item.minutes || 0), 0),
    sections: input.sections,
    notes: input.notes || "",
    created_at: "2026-06-24T09:00:00.000Z",
    updated_at: input.updated_at || now,
  };
}

function reviewItem(input) {
  return {
    review_id: input.review_id,
    ref: input.ref,
    plan_id: input.plan_id,
    status: input.status,
    compliance_summary: input.compliance_summary,
    suggestions: input.suggestions,
    feedback_draft: input.feedback_draft,
    created_at: "2026-07-01T12:00:00.000Z",
  };
}

function activity(id, at, actor, detail, plan_id) {
  return { id, at, actor, detail, plan_id };
}
