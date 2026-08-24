// Deterministic demo data for `?demo=1` — never reads live Busabase state.
// Ported verbatim (same ids, same titles, same bilingual copy) from the
// retired app/server/demo.ts's DEMO_VIDEOS/DEMO_SHOTS, run through
// video-model.js's normalize functions so the shape matches exactly what
// busabase-provider.js produces from real records.
import { buildState, normalizeShotRow, normalizeVideoRow } from "../video-model.js?v=0.1.0";

const RAW_DEMO_VIDEOS = [
  {
    __recordId: "demo-video-1",
    title: "视频1：Busabase 是 AI Coder 的『小白宝箱』",
    series: "aicoder",
    purpose: "讲清楚 Busabase 对「每天在 Vibe Coding、用 AI 写各种 APP」的人来说，怎么让他们更简单。",
    hook: "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
    pain_point: "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
    concept: "Busabase = AI coder 的小白宝箱：Spaces + 审批优先的知识库工作台。",
    status: "needs_review",
    verified_claims: '| 原草稿说法 | 代码库实际情况 |\n| --- | --- |\n| "钱包" | 实际是 Vault |',
    hyperframe_path: "",
    final_video_url: "",
    owner: "kelly",
  },
  {
    __recordId: "demo-video-2",
    title: "视频2：Busabase 作为多 Agent / 多 APP 的 Single Source of Truth",
    series: "aicoder",
    purpose: "解决多 Agent 各自为政的数据割裂感。",
    hook: "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
    pain_point: "Agent 巨多，但各自为政，像极了公司里每个部门之间的墙。",
    concept: "Single Source of Truth：Busabase 给 AI Agent 群提供这样一个中心。",
    status: "approved",
    verified_claims: "| 原草稿说法 | 核实结果 |\n| --- | --- |\n| 跨 Agent 共享 | 合理，中心化数据库 |",
    hyperframe_path: "videos/busabase-cloud/single-source-of-truth",
    final_video_url: "",
    owner: "kelly",
  },
];

const RAW_DEMO_SHOTS = [
  {
    __recordId: "demo-shot-1-1",
    title: "视频1 · 镜头1",
    video: "demo-video-1",
    shot_number: 1,
    timecode: "0:00-0:05",
    scene: "黑屏文字 / 提问式钩子",
    code_reference: "—",
    script_line: "你是不是也每天在 Vibe Coding，用 AI 写各种各样的 APP？",
    note: "钩子，纯提问",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-1-2",
    title: "视频1 · 镜头2",
    video: "demo-video-1",
    shot_number: 2,
    timecode: "0:05-0:15",
    scene: "痛点场景快剪：一堆代码文件滚动 + 手忙脚乱配置数据库",
    code_reference: "—",
    script_line: "代码 AI 一会儿就写完了，UI 你甚至都不用看。可一到要自己搭一个数据库，反而比写代码本身还麻烦。",
    note: "开场控制在 10~15 秒内",
    recording_status: "pending",
  },
  {
    __recordId: "demo-shot-1-3",
    title: "视频1 · 镜头3",
    video: "demo-video-1",
    shot_number: 3,
    timecode: "0:15-0:20",
    scene: "产品揭晓：Busabase Logo",
    code_reference: "—",
    script_line: "这时候，就需要 Busabase：一个专门给 AI coder 用的小白宝箱。",
    note: "",
    recording_status: "needs_reshoot",
  },
  {
    __recordId: "demo-shot-2-1",
    title: "视频2 · 镜头1",
    video: "demo-video-2",
    shot_number: 1,
    timecode: "0:00-0:15",
    scene: "黑屏文字 / 多个 Agent 图标 + APP 图标快闪",
    code_reference: "—",
    script_line: "你会不会觉得，用了很多 Agent，也做了很多 APP，却总有一种数据割裂感？",
    note: "开场痛点",
    recording_status: "recorded",
  },
  {
    __recordId: "demo-shot-2-2",
    title: "视频2 · 镜头6",
    video: "demo-video-2",
    shot_number: 6,
    timecode: "1:10-1:30",
    scene: "终端里敲 /busabase，展示 SKILL.md 的 Connect 流程",
    code_reference: ".agents/skills/busabase/SKILL.md",
    script_line: "用一个 skill，/busabase，把 Agent 接入一个 Busabase 工作区。",
    note: "真实存在的 Connect 步骤",
    recording_status: "recorded",
  },
];

export const demoProvider = {
  kind: "demo",

  async getState() {
    const videos = RAW_DEMO_VIDEOS.map(normalizeVideoRow);
    const shots = RAW_DEMO_SHOTS.map(normalizeShotRow);
    return {
      ...buildState(videos, shots, { demo: true }),
      data_provider: "demo",
      onboarding: { completed: true, config_version: "demo" },
    };
  },

  async provisionResources() {
    throw new Error("Demo mode is read-only.");
  },
};
