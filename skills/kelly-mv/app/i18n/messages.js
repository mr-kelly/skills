// UI chrome catalog for Kelly MV. Domain content (song lyrics, shot prompts, cast
// notes) is never translated here — only the app's own labels. Default mode is
// "auto" (follows navigator.languages); users can pin zh/en in Help & Settings.

export const MESSAGES = {
  zh: {
    brand_subtitle: "音乐视频工作台",
    project: "项目",
    next_step: "下一步",
    needs_review: "待处理",
    shots_todo: "缺画面",
    refs_todo: "缺参考卡",
    settings: "设置",
    settings_sub: "图像 API / 语言 / 文件",
    loading: "加载中",
    close: "关闭",
    tab_image: "图像 API",
    tab_song: "创歌",
    tab_general: "通用",
    tab_files: "文件",
    language: "界面语言",
    project_file: "项目文件",
    nav_song: "Song",
    nav_concept: "概括",
    nav_cast: "角色",
    nav_storyboard: "分镜",
    // next-step labels
    step_upload_song: "上传 MP3",
    step_set_concept: "写 MV 概括",
    step_add_cast: "添加出镜角色",
    step_generate_cast_refs: "生成角色参考卡",
    step_add_shots: "添加分镜",
    step_fill_shot_images: "给分镜上图（生成或上传）",
    step_fill_shot_videos: "给分镜上视频（生成或上传）",
    step_review: "完成",
  },
  en: {
    brand_subtitle: "Music-video workbench",
    project: "Project",
    next_step: "Next step",
    needs_review: "To handle",
    shots_todo: "No image",
    refs_todo: "No ref card",
    settings: "Settings",
    settings_sub: "Image API / Language / Files",
    loading: "Loading",
    close: "Close",
    tab_image: "Image API",
    tab_song: "Song-gen",
    tab_general: "General",
    tab_files: "Files",
    language: "Language",
    project_file: "Project file",
    nav_song: "Song",
    nav_concept: "Concept",
    nav_cast: "Cast",
    nav_storyboard: "Storyboard",
    step_upload_song: "Upload an MP3",
    step_set_concept: "Write the MV concept",
    step_add_cast: "Add on-screen cast",
    step_generate_cast_refs: "Generate cast reference cards",
    step_add_shots: "Add shots",
    step_fill_shot_images: "Add shot images (generate or upload)",
    step_fill_shot_videos: "Add shot videos (generate or upload)",
    step_review: "Done",
  },
};

export function resolveLang(mode) {
  if (mode === "zh" || mode === "en") return mode;
  const langs = (typeof navigator !== "undefined" && navigator.languages) || [];
  for (const l of langs) {
    if (String(l).toLowerCase().startsWith("zh")) return "zh";
    if (String(l).toLowerCase().startsWith("en")) return "en";
  }
  return "zh";
}
