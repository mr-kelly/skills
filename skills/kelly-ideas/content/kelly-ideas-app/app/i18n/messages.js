export const messages = {
  en: {
    // shell
    overview: "Overview",
    overviewSubtitle: "What is waiting on you",
    settings: "Help & Settings",
    settingsTitle: "Help & Settings",
    ideasTitle: "Idea Vault",
    ideasSubtitle: "{count} ideas",
    ideasUnit: "ideas",
    needAnswer: "waiting on you",
    empty: "Nothing yet",
    search: "Search ideas",
    refresh: "Refresh",

    // attention (task language, not data-model language)
    attention_needs_answer: "Needs your answer",
    attention_ready_for_agent: "Ready for agent next",
    attention_settled: "Settled",
    attention_parked: "Parked",

    // ladder
    stage_idea: "Idea",
    stage_brd: "BRD",
    stage_mrd: "MRD",
    stage_prd: "PRD",
    clarity: "Clarity",
    clarityHint: "Derived from ladder progress, answered questions, and settled documents",

    // overview panels
    panelNeedsAnswer: "Waiting on your answer",
    panelReady: "Ready to advance",
    panelParked: "Parked",
    nothingToAnswer: "Nothing is waiting on you.",
    nothingReady: "Nothing is ready to advance yet.",
    nothingParked: "No parked ideas.",
    metricTotal: "Ideas",
    metricNeedsAnswer: "Need your answer",
    metricReady: "Ready to advance",
    metricParked: "Parked",
    readyFor: "ready for {stage}",
    missingFields: "missing answers",
    openQuestionsCount: "{count} open question(s)",

    // idea fields
    field_one_liner: "In one sentence",
    field_who: "Who is it for",
    field_problem: "Whose problem, and what problem",
    field_why_now: "Why now",
    notes: "Notes",
    notAnswered: "Not answered yet",
    noOneLiner: "No one-liner yet",
    noIdeas: "No ideas here.",
    ideaNotFound: "That idea no longer exists.",
    backToList: "Back to list",

    // tabs
    language: "Language",
    navBrd: "BRD",
    navMrd: "MRD",
    navPrd: "PRD",
    pickIdeaFirst: "Pick an idea first",
    noDocsOfKind: "No idea has a {kind} yet.",
    tabOverview: "Overview",
    tabQuestions: "Questions",
    noQuestions: "No questions yet.",

    // gate
    gateReady: "Everything on this rung is answered. Ready to move to {stage}.",
    gateBlocked: "Cannot advance yet: {blockers}.",
    gateComplete: "This idea has reached PRD. It is ready to hand to the app creator.",
    gateParked: "This idea is parked. Nothing is expected of you.",
    advanceTo: "Advance to {stage}",

    // questions
    answerPlaceholder: "Answer in your own words. \"I don't know\" is a valid answer.",
    submitAnswer: "Save answer",
    skipQuestion: "Skip",
    questionSkipped: "Skipped.",
    answerEmpty: "An answer cannot be empty. Use Skip if you want to move past it.",

    // documents
    docNotWritten: "Not written yet.",
    docLocked: "The {stage} comes after the rung above it is answered.",
    gaps: "Still missing",

    // settings
    connection: "Connection",
    provider: "Data provider",
    configPath: "Config path",
    operator: "Operator",
    name: "Name",
    role: "Role",
    resources: "Resources",

    // pager
    prevPage: "Prev",
    nextPage: "Next",
    pageOf: "Page {current} of {total}",

    demoNotice: "Demo mode: read-only, nothing is saved.",
  },

  zh: {
    // shell
    overview: "总览",
    overviewSubtitle: "现在等着你的事",
    settings: "帮助与设置",
    settingsTitle: "帮助与设置",
    ideasTitle: "灵感库",
    ideasSubtitle: "共 {count} 条灵感",
    ideasUnit: "条灵感",
    needAnswer: "等你回答",
    empty: "还没有内容",
    search: "搜索灵感",
    refresh: "刷新",

    // attention
    attention_needs_answer: "等你回答",
    attention_ready_for_agent: "可以往下走了",
    attention_settled: "已定稿",
    attention_parked: "已搁置",

    // ladder
    stage_idea: "灵感",
    stage_brd: "商业需求",
    stage_mrd: "市场需求",
    stage_prd: "产品需求",
    clarity: "清晰度",
    clarityHint: "由推进层级、已回答问题和已完善文档共同算出",

    // overview panels
    panelNeedsAnswer: "等你回答",
    panelReady: "可以往下走",
    panelParked: "已搁置",
    nothingToAnswer: "没有等着你回答的问题。",
    nothingReady: "暂时没有可以往下走的灵感。",
    nothingParked: "没有搁置的灵感。",
    metricTotal: "灵感总数",
    metricNeedsAnswer: "等你回答",
    metricReady: "可以往下走",
    metricParked: "已搁置",
    readyFor: "可进入{stage}",
    missingFields: "还有没填的",
    openQuestionsCount: "{count} 个问题没答",

    // idea fields
    field_one_liner: "一句话说清楚",
    field_who: "给谁用",
    field_problem: "谁的什么问题",
    field_why_now: "为什么是现在",
    notes: "备注",
    notAnswered: "还没回答",
    noOneLiner: "还没有一句话说清楚",
    noIdeas: "这里还没有灵感。",
    ideaNotFound: "这条灵感已经不在了。",
    backToList: "返回列表",

    // tabs
    language: "语言",
    navBrd: "商业需求 BRD",
    navMrd: "市场需求 MRD",
    navPrd: "产品需求 PRD",
    pickIdeaFirst: "先选一条灵感",
    noDocsOfKind: "还没有灵感写了 {kind}。",
    tabOverview: "概览",
    tabQuestions: "咨询师追问",
    noQuestions: "还没有问题。",

    // gate
    gateReady: "这一层该答的都答了，可以进入{stage}。",
    gateBlocked: "还不能往下走：{blockers}。",
    gateComplete: "已经到 PRD 了，可以交给 App Creator 做出来。",
    gateParked: "这条已经搁置，不需要你做什么。",
    advanceTo: "推进到{stage}",

    // questions
    answerPlaceholder: "用你自己的话回答。「我不知道」也是有效回答。",
    submitAnswer: "保存回答",
    skipQuestion: "跳过",
    questionSkipped: "已跳过。",
    answerEmpty: "回答不能是空的。想先放一放就点「跳过」。",

    // documents
    docNotWritten: "还没写。",
    docLocked: "要先把上一层答完，才会有{stage}。",
    gaps: "还缺什么",

    // settings
    connection: "连接",
    provider: "数据来源",
    configPath: "配置位置",
    operator: "使用者",
    name: "名字",
    role: "角色",
    resources: "资源",

    // pager
    prevPage: "上一页",
    nextPage: "下一页",
    pageOf: "第 {current} / {total} 页",

    demoNotice: "演示模式：只读，不会保存任何改动。",
  },
};
