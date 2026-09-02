// Deterministic, explicitly-labeled, read-only demo data. Never reads or
// writes Busabase, never claims a real connection, and never persists
// anything — matches the ?demo=1 contract used across Kelly App-in-Skills.
//
// The vault deliberately holds ideas that became real Kelly skills, so a
// classroom can point at kelly-email and say "this is the conversation that
// produced it", plus one still-vague idea mid-interrogation and one honestly
// parked idea.
import { buildSnapshot } from "../ideas-model.js?v=0.1.0";

const NOW = "2026-09-02T09:30:00.000Z";

const idea = (record_id, title, fields = {}) => ({
  record_id,
  title,
  one_liner: "",
  problem: "",
  who: "",
  why_now: "",
  stage: "idea",
  status: "打磨中",
  source: "",
  tags: [],
  agent_next_action: "",
  notes: "",
  created_at: NOW,
  updated_at: NOW,
  ...fields,
});

const doc = (record_id, idea_id, kind, fields = {}) => ({
  record_id,
  idea_id,
  kind,
  title: "",
  body: "",
  status: "草稿",
  version: 1,
  gaps: [],
  updated_at: NOW,
  ...fields,
});

const question = (record_id, idea_id, stage, position, question_text, fields = {}) => ({
  record_id,
  idea_id,
  stage,
  position,
  question: question_text,
  why_asking: "",
  answer: "",
  status: "open",
  asked_at: NOW,
  answered_at: "",
  ...fields,
});

const IDEAS = [
  idea("idea-vague", "想做个东西帮我管客户", {
    one_liner: "",
    who: "",
    stage: "idea",
    status: "打磨中",
    source: "开车的时候想到的",
    tags: ["未成形"],
    notes: "先别急着做，我自己也没说清楚。",
  }),
  idea("idea-email", "外贸老板的邮件审批台", {
    one_liner: "帮外贸老板在一个界面里批准今天该回的邮件，AI 起草，人拍板",
    who: "有自己邮箱、每天收几十封询盘和订单邮件的小型外贸公司老板",
    problem:
      "重要的和不重要的邮件混在一起，回复慢就丢单；但全交给 AI 自动回，改价格、改收款账户这种事出一次就是大事故。",
    why_now: "AI 现在能读懂邮件语义并分类了，但敢不敢让它直接发出去，仍然必须由人决定。",
    stage: "prd",
    status: "已落地",
    source: "第二期第 4 课备用课",
    tags: ["邮件", "审批", "已成为 kelly-email"],
    agent_next_action: "已交付为 kelly-email，可作为课堂范例",
  }),
  idea("idea-wechat", "微信好友那么多，不知道今天该找谁", {
    one_liner: "把已经认识的人变成看得见的关系快照，告诉我今天该找谁",
    who: "微信里躺着几千个好友、但说不出谁该联系的创业者和销售",
    problem: "通讯录越长越没用。真正的问题不是找不到人，是不知道跟谁的关系到了可以开口的程度。",
    why_now: "本地微信数据现在能只读取出来，不用把聊天记录交给任何云端。",
    stage: "mrd",
    status: "打磨中",
    source: "第二期第 6 课",
    tags: ["微信", "关系", "已成为 kelly-wechat-crm"],
  }),
  idea("idea-parked", "做一个 AI 相亲平台", {
    one_liner: "用 AI 给人配对，比现有相亲软件更准",
    who: "想脱单的年轻人",
    problem: "现有相亲软件配对很随机，浪费时间。",
    why_now: "",
    stage: "idea",
    status: "已搁置",
    source: "跟朋友吃饭聊到的",
    tags: ["已搁置"],
    notes: "咨询师复盘：说不出为什么是我们做、也说不出比现有平台强在哪。不是想法不好，是没有我们的位置。先搁置。",
  }),
];

const DOCUMENTS = [
  doc("doc-email-brd", "idea-email", "brd", {
    title: "邮件审批台 · 商业需求",
    status: "已完善",
    version: 3,
    body: [
      "## 谁的问题",
      "小型外贸公司老板，每天 30-80 封邮件，其中真正影响成交的不到 10 封。",
      "",
      "## 现状的代价",
      "回复延迟按天计算，询盘转化肉眼可见地掉；老板晚上还在手机上翻邮件。",
      "",
      "## 为什么是我们",
      "我们已经有审批台这套骨架（求职、拓客都在用），把它接到邮箱上是复用不是新建。",
      "",
      "## 成功长什么样",
      "老板每天花 10 分钟过一遍待办邮件，且没有一封是 AI 擅自发出去的。",
    ].join("\n"),
  }),
  doc("doc-email-mrd", "idea-email", "mrd", {
    title: "邮件审批台 · 市场需求",
    status: "已完善",
    version: 2,
    body: [
      "## 目标细分",
      "先打外贸，因为邮件就是他们的生产资料，痛感最强、最愿意付费。",
      "",
      "## 今天他们怎么解决",
      "靠人肉翻邮箱，或者用邮件营销工具（方向反了，那是往外群发的）。",
      "",
      "## 我们的差别",
      "别人做的是「让 AI 替你发」，我们做的是「让 AI 替你准备，你来发」。",
      "",
      "## 进入路径",
      "课程学员是第一批用户，他们自己就是外贸老板或服务外贸老板的人。",
    ].join("\n"),
  }),
  doc("doc-email-prd", "idea-email", "prd", {
    title: "邮件审批台 · 产品需求",
    status: "已完善",
    version: 4,
    body: [
      "## 用户故事",
      "作为外贸老板，我要一次看完今天所有待处理邮件，并对每一封给出一个决定。",
      "",
      "## 六个出口",
      "每封未读邮件必须落到：起草回复 / 批准发送 / 批准归档 / 标已读 / 需查看 / 受阻。",
      "",
      "## 硬约束",
      "界面只写决定，不执行。点「批准发送」不会发出邮件，必须回到聊天让 Skill 执行。",
      "交期、价格、付款条件、收款账户变更四类一律人工确认；收款账户变更默认拦截升级。",
      "",
      "## 非目标",
      "不做邮件营销、不做群发、不做回复率归因。",
      "",
      "## 验收",
      "演示模式可完整走完六个出口；真实模式下未经批准的邮件不会离开邮箱。",
    ].join("\n"),
  }),
  doc("doc-wechat-brd", "idea-wechat", "brd", {
    title: "微信关系攻略 · 商业需求",
    status: "已完善",
    version: 2,
    body: [
      "## 谁的问题",
      "微信好友 2000+ 的创业者和销售。",
      "",
      "## 现状的代价",
      "关系躺在通讯录里自然衰减，真需要的时候开不了口。",
      "",
      "## 为什么是我们",
      "本地只读 + 人工决定这套边界，我们在前几课已经建立了信任。",
      "",
      "## 成功长什么样",
      "每天能说出「今天该找这三个人，因为这个理由」。",
    ].join("\n"),
  }),
  doc("doc-wechat-mrd", "idea-wechat", "mrd", {
    title: "微信关系攻略 · 市场需求",
    status: "草稿",
    version: 1,
    gaps: ["定价还没想", "没想清楚跟现成 SCRM 的边界"],
    body: [
      "## 目标细分",
      "先服务已经有真实业务、且关系资产在微信里的人。",
      "",
      "## 今天他们怎么解决",
      "企业微信 SCRM，但那是管销售团队的，不是管老板自己关系的。",
      "",
      "## 我们的差别",
      "只读本地、不发消息、不改备注 —— 这是隐私底线，也是差异点。",
      "",
      "## 待补",
      "定价、以及跟现成 SCRM 的边界还没想清楚。",
    ].join("\n"),
  }),
];

const QUESTIONS = [
  question("q-v1", "idea-vague", "idea", 1, "「管客户」是指什么？是记住他们是谁，还是知道下一步该做什么？", {
    why_asking: "这两个是完全不同的产品，第一个是通讯录，第二个是工作台。",
  }),
  question("q-v2", "idea-vague", "idea", 2, "你现在是怎么管的？拿什么工具，卡在哪一步？", {
    why_asking: "先看现状，才知道新东西要替掉什么。说不出现状，通常意味着痛感还不够。",
  }),
  question("q-v3", "idea-vague", "idea", 3, "如果这东西做出来了，你明天早上第一件事会在上面做什么？", {
    why_asking: "把抽象需求逼成一个具体动作。答不上来，说明还没有真实场景。",
  }),
  question("q-e1", "idea-email", "brd", 1, "如果 AI 替你把一封邮件发错了，最坏会发生什么？", {
    why_asking: "找出必须由人拍板的红线在哪。",
    answer: "改收款账户那种，钱直接打错，公司会出大事。所以这类绝对不能自动发。",
    status: "answered",
    answered_at: NOW,
  }),
  question("q-e2", "idea-email", "prd", 2, "每封邮件最后必须落到哪几个结局？漏一个就会有邮件卡住。", {
    why_asking: "队列类产品必须穷举出口，否则用户会遇到「这封我不知道该怎么办」。",
    answer: "起草回复、批准发送、批准归档、标已读、需查看、受阻，六个。",
    status: "answered",
    answered_at: NOW,
  }),
  question("q-w1", "idea-wechat", "brd", 1, "读本地微信数据这件事，你自己能接受到什么程度？", {
    why_asking: "隐私边界必须在动手前定死，事后再补就晚了。",
    answer: "只读，不发消息不改备注。数据不出本机。",
    status: "answered",
    answered_at: NOW,
  }),
  question("q-w2", "idea-wechat", "mrd", 2, "同样是管关系，为什么用户不直接上企业微信的 SCRM？", {
    why_asking: "说不出替代方案的不足，就没有市场位置。",
  }),
  question("q-w3", "idea-wechat", "mrd", 3, "你打算收多少钱？按人头还是按月？", {
    why_asking: "定价是市场假设的一部分，不是上线前才想的事。",
  }),
  question("q-p1", "idea-parked", "idea", 1, "比现有相亲软件「更准」，准在哪？你能说出一个它们做不到的判断吗？", {
    why_asking: "「更好」不是差异点，必须能说出一个具体的、别人做不到的事。",
    answer: "……其实说不太出来。",
    status: "answered",
    answered_at: NOW,
  }),
  question("q-p2", "idea-parked", "idea", 2, "为什么是你来做这件事？你手上有别人没有的什么？", {
    why_asking: "没有独特资源的红海想法，做出来也活不下来。",
    answer: "没有，我不认识相亲行业的人，也没有用户。",
    status: "answered",
    answered_at: NOW,
  }),
];

export function demoSnapshot(scenario) {
  let ideas = IDEAS;
  if (scenario === "needs-answer") {
    ideas = IDEAS.filter((i) => ["idea-vague", "idea-wechat"].includes(i.record_id));
  } else if (scenario === "ready") {
    ideas = IDEAS.filter((i) => i.record_id === "idea-email");
  } else if (scenario === "parked") {
    ideas = IDEAS.filter((i) => i.record_id === "idea-parked");
  }
  const ids = new Set(ideas.map((i) => i.record_id));
  return buildSnapshot({
    ideas,
    documents: DOCUMENTS.filter((d) => ids.has(d.idea_id)),
    questions: QUESTIONS.filter((q) => ids.has(q.idea_id)),
  });
}

export const demoProvider = {
  kind: "demo",

  async getState() {
    const params = new URLSearchParams(window.location.search);
    const scenario = String(params.get("demo") || "overview");
    const snapshot = demoSnapshot(scenario);
    return {
      app: "kelly-ideas",
      demo: true,
      demo_scenario: scenario,
      data_provider: "demo",
      onboarding: { completed: true, completed_at: NOW, config_version: "demo" },
      lock: null,
      config_summary: {
        config_path: "demo://kelly-ideas/config.json",
        is_example: false,
        operator: { name: "Kelly Chan", role: "Founder", company: "Atlas Studio LLC", timezone: "Asia/Shanghai" },
        style_tone: "直接、不绕弯、先问清楚再动手",
      },
      agent_tasks: { updated_at: "", tasks: [] },
      execution_report: null,
      snapshot,
    };
  },

  async applyDecision() {
    throw new Error("Demo mode is read-only.");
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
