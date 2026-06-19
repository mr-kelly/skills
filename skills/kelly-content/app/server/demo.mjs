const now = "2026-06-18T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  const value = query.get?.("demo") ?? query.demo;
  return Boolean(value);
}

export function demoState() {
  return {
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
}
