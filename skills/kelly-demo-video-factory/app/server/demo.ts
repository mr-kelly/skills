// Deterministic demo data for `?demo=1` — never reads live Busabase state.
// Mirrors the shape of the real videos/video-shots records this skill manages.

export const DEMO_VIDEOS = [
  {
    id: "demo-video-1",
    fields: {
      title: "视频1：Busabase 是 AI Coder 的『小白宝箱』",
      series: "aicoder",
      purpose: "讲清楚 Busabase 对「每天在 Vibe Coding、用 AI 写各种 APP」的人来说，怎么让他们更简单。",
      hook: "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
      "pain-point": "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
      concept: "Busabase = AI coder 的小白宝箱：Spaces + 审批优先的知识库工作台。",
      status: "needs_review",
      "verified-claims": '| 原草稿说法 | 代码库实际情况 |\n| --- | --- |\n| "钱包" | 实际是 Vault |',
      "hyperframe-path": "",
      "final-video-url": "",
      owner: "kelly",
    },
  },
  {
    id: "demo-video-2",
    fields: {
      title: "视频2：Busabase 作为多 Agent / 多 APP 的 Single Source of Truth",
      series: "aicoder",
      purpose: "解决多 Agent 各自为政的数据割裂感。",
      hook: "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
      "pain-point": "Agent 巨多，但各自为政，像极了公司里每个部门之间的墙。",
      concept: "Single Source of Truth：Busabase 给 AI Agent 群提供这样一个中心。",
      status: "approved",
      "verified-claims": "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| 跨 Agent 共享 | 合理，中心化数据库 |",
      "hyperframe-path": "videos/busabase-cloud/single-source-of-truth",
      "final-video-url": "",
      owner: "kelly",
    },
  },
] as const;

export const DEMO_SHOTS = [
  {
    id: "demo-shot-1-1",
    fields: {
      title: "视频1 · 镜头1",
      video: "demo-video-1",
      "shot-number": 1,
      timecode: "0:00-0:05",
      scene: "黑屏文字 / 提问式钩子",
      "code-reference": "—",
      "script-line": "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
      note: "钩子，纯提问",
      "recording-status": "recorded",
    },
  },
  {
    id: "demo-shot-1-2",
    fields: {
      title: "视频1 · 镜头2",
      video: "demo-video-1",
      "shot-number": 2,
      timecode: "0:05-0:15",
      scene: "痛点场景快剪：一堆代码文件滚动 + 手忙脚乱配置数据库",
      "code-reference": "—",
      "script-line": "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
      note: "开场控制在 10~15 秒内",
      "recording-status": "pending",
    },
  },
  {
    id: "demo-shot-1-3",
    fields: {
      title: "视频1 · 镜头3",
      video: "demo-video-1",
      "shot-number": 3,
      timecode: "0:15-0:20",
      scene: "产品揭晓：Busabase Logo",
      "code-reference": "—",
      "script-line": "这时候，就需要 Busabase：一个专门给 AI coder 用的小白宝箱。",
      note: "",
      "recording-status": "needs_reshoot",
    },
  },
  {
    id: "demo-shot-2-1",
    fields: {
      title: "视频2 · 镜头1",
      video: "demo-video-2",
      "shot-number": 1,
      timecode: "0:00-0:15",
      scene: "黑屏文字 / 多个 Agent 图标 + APP 图标快闪",
      "code-reference": "—",
      "script-line": "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
      note: "开场痛点",
      "recording-status": "recorded",
    },
  },
  {
    id: "demo-shot-2-2",
    fields: {
      title: "视频2 · 镜头6",
      video: "demo-video-2",
      "shot-number": 6,
      timecode: "1:10-1:30",
      scene: "终端里敲 /busabase，展示 SKILL.md 的 Connect 流程",
      "code-reference": ".agents/skills/busabase/SKILL.md",
      "script-line": "用一个 skill，/busabase，把 Agent 接入一个 Busabase 工作区。",
      note: "真实存在的 Connect 步骤",
      "recording-status": "recorded",
    },
  },
] as const;
