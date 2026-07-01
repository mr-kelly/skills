const now = "2026-06-18T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  const value = query.get?.("demo") ?? query.demo;
  return Boolean(value);
}

export function demoState(query = {}) {
  const lang = query.get?.("lang") || query.lang || "en";
  const state = {
    demo: true,
    batch: {
      batch_id: "demo-content-20260618",
      generated_at: now,
      updated_at: now,
      source: "demo",
      canonical_idea: "A practical launch guide for a local-first AI workflow",
      source_summary: "The source article explains how a small team can use local review queues, approval gates, and channel-specific publishing drafts without exposing private customer data.",
      topics: [
        {
          id: "topic-local-first",
          title: "Local-first AI workflows build trust before speed",
          source: "demo",
          status: "confirmed",
          score: 94,
          audience: "founders, operators, and product teams",
          subject: "A workflow that keeps private context local while still letting AI prepare useful drafts.",
          evidence: "The original article highlights three proof points: local files, explicit approval, and channel-aware exports.",
          directions: [
            {
              id: "dir-trust-before-speed",
              title: "Build the approval desk before you automate the action",
              description: "Lead with the safety principle, then show how local review files let teams move quickly without handing over the final decision.",
              angle: "Trust-first operating system",
              status: "selected"
            },
            {
              id: "dir-quiet-automation",
              title: "Quiet automation for teams that cannot leak context",
              description: "Position the workflow as a privacy-preserving assistant that prepares work but waits for a human commit.",
              angle: "Privacy and control",
              status: "ready"
            }
          ]
        },
        {
          id: "topic-channel-system",
          title: "One source, five channel-ready drafts",
          source: "demo",
          status: "ready",
          score: 88,
          audience: "content operators",
          subject: "Repurpose one canonical article into channel-native posts.",
          evidence: "The source has a clear claim, examples, and a workflow diagram that can be adapted for different channels.",
          directions: [
            {
              id: "dir-channel-native",
              title: "Keep the proof. Change the wrapper.",
              description: "Explain how to preserve the core argument while rewriting hooks, pacing, and media for each platform.",
              angle: "Distribution principle",
              status: "ready"
            }
          ]
        },
        {
          id: "topic-review-queue",
          title: "The review queue is the product interface",
          source: "demo",
          status: "ready",
          score: 82,
          audience: "AI product builders",
          subject: "Approval UIs make agent work inspectable.",
          evidence: "Screenshots show reviewers editing copy, approving exports, and requesting changes before any external side effect.",
          directions: [
            {
              id: "dir-interface",
              title: "Make agent work visible before making it powerful",
              description: "Turn the post into a product lesson about queues, locks, and human-readable decision records.",
              angle: "Product design",
              status: "ready"
            }
          ]
        }
      ],
      todos: [
        {
          id: "todo-local-first",
          topic_id: "topic-local-first",
          direction_id: "dir-trust-before-speed",
          title: "Build the approval desk before you automate the action",
          description: "Draft the canonical post around local files, human approval, and safe export boundaries.",
          subject: "Local-first AI workflows",
          status: "in_progress",
          assignee: "AI writer",
          source: "demo",
          created_at: now,
          updated_at: now
        },
        {
          id: "todo-channel-native",
          topic_id: "topic-channel-system",
          direction_id: "dir-channel-native",
          title: "Keep the proof. Change the wrapper.",
          description: "Prepare a distribution memo for channel-specific copy variants.",
          subject: "Channel-native distribution",
          status: "todo",
          assignee: "AI writer",
          source: "demo",
          created_at: now,
          updated_at: now
        }
      ],
      main_content: {
        id: "main-demo",
        title: "Build the approval desk before you automate the action",
        status: "writing",
        hero_alt: "Local review desk with draft cards and approval controls",
        cover_brief: "A clean workspace showing one source article feeding approved drafts into email, PR review, and publishing queues.",
        dek: "A local-first AI workflow should make the next action inspectable before it makes the action executable.",
        html: "<p>The fastest agent workflow is not the one that skips review. It is the one that makes review cheap enough to happen every time.</p><h3>1. Keep context local</h3><p>Use local handoff files for batches, drafts, and decisions. The UI can be rich without sending private data anywhere.</p><h3>2. Separate preparation from execution</h3><p>Agents prepare summaries, recommendations, and drafts. Humans approve the final action.</p><h3>3. Export only after approval</h3><p>The output step reads explicit decisions, then writes channel-ready artifacts.</p>"
      },
      distribution: [
        {
          id: "dist-blog",
          channel: "official_blog",
          status: "needs_review",
          owner: "Kelly Content",
          title: "Build the approval desk before you automate the action",
          summary: "Canonical article for teams designing local-first AI workflows.",
          body: "A local approval desk gives teams speed without surrendering control. Start with a queue, show the recommendation, keep edits local, and execute only after an explicit approval.",
          cta: "Use this pattern for the next workflow that touches customer data.",
          media_brief: "Diagram: source article -> local review queue -> approved channel exports.",
          title_options: ["Build the approval desk before you automate the action", "Local-first agents need review desks, not black boxes"],
          hashtags: ["#LocalFirst", "#AIWorkflow", "#ProductOps"]
        },
        {
          id: "dist-linkedin",
          channel: "linkedin",
          status: "to_approve",
          owner: "Kelly Content",
          title: "The approval desk is where AI work becomes team work",
          summary: "Short professional post for operators and founders.",
          body: "The best AI workflow I have seen lately is deliberately boring: generate a batch, review it locally, approve the next action, then execute. That small approval layer is what turns an agent from clever demo into usable operations.",
          cta: "What is the first workflow where you would add a review desk?",
          media_brief: "Screenshot carousel with queue, detail pane, and approval buttons.",
          hashtags: ["#AI", "#Operations", "#Workflow"]
        },
        {
          id: "dist-newsletter",
          channel: "newsletter",
          status: "approved",
          owner: "Kelly Content",
          title: "A calmer way to ship AI-assisted work",
          summary: "Newsletter version with a practical checklist.",
          body: "This week: a pattern for AI-assisted work that does not require blind trust. Keep the batch local, show every recommendation, preserve the draft, and make approval a file-backed decision.",
          cta: "Reply with the workflow you want to put behind an approval gate.",
          media_brief: "Simple checklist graphic.",
          hashtags: ["#AI", "#Review"]
        },
        {
          id: "dist-x",
          channel: "x",
          status: "needs_review",
          owner: "Kelly Content",
          title: "Agents need approval desks",
          summary: "Thread draft for concise distribution.",
          body: "A useful agent workflow has two separate moments: prepare the work, then execute the approved action. Mixing those together is how teams lose trust.",
          cta: "Build the review queue first.",
          media_brief: "No image; keep it text-first.",
          hashtags: ["#AI", "#LocalFirst"]
        }
      ],
      items: []
    },
    decisions: {
      "dist-newsletter": {
        action: "approve",
        title: "A calmer way to ship AI-assisted work",
        body: "This week: a pattern for AI-assisted work that does not require blind trust. Keep the batch local, show every recommendation, preserve the draft, and make approval a file-backed decision.",
        comment: "Ready for export.",
        decided_at: now
      }
    },
    lock: null,
    config_summary: {
      provider: "demo",
      config_source: "mock data",
      publishing_connectors: "disabled",
      config_paths: []
    }
  };
  return String(lang).toLowerCase().startsWith("zh") ? localizeZh(state) : state;
}

function localizeZh(state) {
  const batch = state.batch;
  batch.canonical_idea = "本地优先 AI 工作流的实用发布指南";
  batch.source_summary = "源文章说明小团队如何用本地复核队列、审批门和按渠道生成的发布草稿，在不暴露私密客户数据的前提下使用 AI。";
  batch.topics[0].title = "本地优先的 AI 工作流先建立信任，再追求速度";
  batch.topics[0].audience = "创始人、运营和产品团队";
  batch.topics[0].subject = "一种让私密上下文留在本地，同时让 AI 准备有用草稿的工作流。";
  batch.topics[0].evidence = "原文强调三个证据点：本地文件、显式审批和按渠道导出。";
  batch.topics[0].directions[0].title = "先搭审批台，再自动执行动作";
  batch.topics[0].directions[0].description = "先讲安全原则，再展示本地复核文件如何让团队快速推进，同时不放弃最终决策权。";
  batch.topics[0].directions[0].angle = "信任优先的操作系统";
  batch.topics[0].directions[1].title = "适合不能泄露上下文团队的安静自动化";
  batch.topics[0].directions[1].description = "把这个工作流定位成保护隐私的助手：先准备工作，但等待人类确认。";
  batch.topics[1].title = "一个来源，五个渠道草稿";
  batch.topics[1].audience = "内容运营";
  batch.topics[1].subject = "把一篇主文章改写成适合不同渠道的帖子。";
  batch.topics[1].directions[0].title = "保留证据，替换包装";
  batch.topics[1].directions[0].description = "解释如何保留核心论点，同时为每个平台重写 hook、节奏和素材。";
  batch.topics[2].title = "复核队列才是产品界面";
  batch.topics[2].audience = "AI 产品构建者";
  batch.topics[2].subject = "审批界面让智能体的工作变得可检查。";
  batch.topics[2].directions[0].title = "先让智能体工作可见，再让它变强";
  batch.todos[0].title = "先搭审批台，再自动执行动作";
  batch.todos[0].description = "围绕本地文件、人工审批和安全导出边界撰写主稿。";
  batch.todos[0].subject = "本地优先 AI 工作流";
  batch.todos[1].title = "保留证据，替换包装";
  batch.todos[1].description = "为不同渠道的文案变体准备分发备忘。";
  batch.todos[1].subject = "渠道原生分发";
  batch.main_content.title = "先搭审批台，再自动执行动作";
  batch.main_content.hero_alt = "带草稿卡片和审批控件的本地复核台";
  batch.main_content.cover_brief = "一个干净的工作台：一篇源文章进入邮件、代码评审和发布队列，最后导出已批准草稿。";
  batch.main_content.dek = "本地优先 AI 工作流应该先让下一步动作可检查，再让动作可执行。";
  batch.main_content.html = "<p>最快的智能体工作流不是跳过复核，而是让复核足够轻，轻到每次都值得做。</p><h3>1. 让上下文留在本地</h3><p>用本地交接文件保存批次、草稿和决定。界面可以很丰富，但不需要把私密数据发出去。</p><h3>2. 把准备和执行分开</h3><p>智能体准备摘要、建议和草稿；人类批准最终动作。</p><h3>3. 只导出已批准内容</h3><p>输出步骤读取显式决定，再写出适合各渠道的成品。</p>";
  for (const item of batch.distribution) {
    if (item.id === "dist-blog") {
      item.title = "先搭审批台，再自动执行动作";
      item.summary = "给正在设计本地优先 AI 工作流团队的主文章。";
      item.body = "本地审批台让团队获得速度，同时不交出控制权。先建立队列，显示建议，保留本地编辑，只在明确批准后执行。";
      item.cta = "把这个模式用于下一个会接触客户数据的工作流。";
      item.media_brief = "图示：源文章 -> 本地复核队列 -> 已批准的渠道导出。";
      item.title_options = ["先搭审批台，再自动执行动作", "本地优先智能体需要复核台，不需要黑盒"];
      item.hashtags = ["#本地优先", "#AI工作流", "#产品运营"];
    } else if (item.id === "dist-linkedin") {
      item.title = "审批台让 AI 工作变成团队工作";
      item.summary = "面向运营和创始人的短 LinkedIn 帖子。";
      item.body = "我最近看到最好的 AI 工作流其实很朴素：生成批次，本地复核，批准下一步，再执行。这个小小的审批层，才让智能体从聪明演示变成可用运营工具。";
      item.cta = "你会先把哪个工作流放到审批台后面？";
      item.media_brief = "截图轮播：队列、详情面板和审批按钮。";
      item.hashtags = ["#AI", "#运营", "#工作流"];
    } else if (item.id === "dist-newsletter") {
      item.title = "一种更安静地交付 AI 辅助工作的方式";
      item.summary = "带实用 checklist 的 newsletter 版本。";
      item.body = "本周：一个不需要盲目信任的 AI 辅助工作模式。批次留在本地，展示每条建议，保留草稿，并把审批保存成文件记录。";
      item.cta = "回复我：你想把哪个工作流放进审批门？";
      item.media_brief = "简洁 checklist 图。";
      item.hashtags = ["#AI", "#复核"];
    } else if (item.id === "dist-x") {
      item.title = "智能体需要审批台";
      item.summary = "更短的串文草稿。";
      item.body = "有用的智能体工作流有两个独立时刻：准备工作，然后执行已批准动作。把两者混在一起，团队很快会失去信任。";
      item.cta = "先搭复核队列。";
      item.media_brief = "不配图，保持文字优先。";
      item.hashtags = ["#AI", "#本地优先"];
    }
  }
  state.decisions["dist-newsletter"].title = "一种更安静地交付 AI 辅助工作的方式";
  state.decisions["dist-newsletter"].body = "本周：一个不需要盲目信任的 AI 辅助工作模式。批次留在本地，展示每条建议，保留草稿，并把审批保存成文件记录。";
  state.decisions["dist-newsletter"].comment = "可以导出。";
  return state;
}
