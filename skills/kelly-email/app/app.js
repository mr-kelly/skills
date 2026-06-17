let state = { items: [], counts: {}, batch: null, lock: { locked: false } };
let mode = "all";
let selectedId = null;
const checked = new Set();
let refreshTimer = null;
let lockTimer = null;
const LANGUAGE_STORAGE_KEY = "kelly-email.uiLanguage";
let languageMode = localStorage.getItem(LANGUAGE_STORAGE_KEY) || "auto";
let uiLanguage = "en";

const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    "brand.subtitle": "File-only approval desk",
    "filter.all": "All",
    "filter.all.tooltip": "Everything in the current local batch.",
    "filter.needs_review": "Needs Review",
    "filter.needs_review.tooltip": "Messages that need your note or another /kelly-email pass. No mailbox action will run yet.",
    "filter.to_approve": "To approve",
    "filter.to_approve.tooltip": "/kelly-email has a clear suggested plan, usually archive or mark read, and is waiting for your approval.",
    "filter.approved": "Approved",
    "filter.approved.tooltip": "You approved an action. /kelly-email can execute it after the final safety check.",
    "filter.done": "Done",
    "filter.done.tooltip": "Already executed or explicitly marked as no action.",
    "filter.blocked": "Blocked",
    "filter.blocked.tooltip": "Execution was blocked by a safety rule or error and needs another look.",
    "help.title": "Help & Settings",
    "help.open.tooltip": "Open guide, account settings, file paths, and configuration locations.",
    "help.close": "Close help",
    "help.tabs_aria": "Help and settings tabs",
    "common.close": "Close",
    "search.placeholder": "Search sender, subject, summary",
    "lock.title": "Locked",
    "lock.default": "The local files are locked for a moment.",
    "lock.processing": "/kelly-email is processing this batch. Editing is paused.",
    "list.select": "Select",
    "list.items": "{count} items",
    "list.setup_required": "Setup required",
    "list.no_items": "No batch items",
    "list.selected": "{count} selected",
    "empty.select_message": "Select a message",
    "batch.none": "No batch loaded",
    "batch.info": "Batch {id} · {count} items · {date}",
    "tab.guide": "Guide",
    "tab.files": "Files",
    "tab.accounts": "Accounts",
    "tab.profile": "Profile",
    "tab.style": "Style",
    "tab.knowledge": "Knowledge",
    "tab.language": "Language",
    "tab.config": "Config",
    "guide.how_title": "How It Works",
    "guide.how_body": "<code>/kelly-email</code> reads mail and writes a local batch. This app only edits local review files. After you approve items here, ask <code>/kelly-email</code> to execute approved decisions.",
    "guide.workflow_title": "Workflow",
    "guide.step1": "Ask <code>/kelly-email</code> to generate a review batch.",
    "guide.step2": "Review messages here and approve, request a draft, or leave a note.",
    "guide.step3": "Ask <code>/kelly-email</code> to execute approved decisions.",
    "files.title": "Local Files",
    "files.data_reader": "Data reader",
    "files.batch_file": "Batch file",
    "files.decision_file": "Decision file",
    "files.config_source": "Config source",
    "files.not_loaded": "Not loaded",
    "files.no_batch": "No batch file",
    "files.no_decisions": "No decisions file",
    "files.no_config": "No config file",
    "files.onboarding": "Onboarding required",
    "accounts.title": "Email Accounts",
    "accounts.none": "No accounts loaded",
    "profile.title": "User Profile & Brands",
    "profile.none": "No profile loaded",
    "style.title": "Reply Style",
    "style.none": "No style loaded",
    "knowledge.title": "Knowledge Base",
    "knowledge.none": "No knowledge base loaded",
    "language.title": "Language",
    "language.auto": "Auto",
    "language.english": "English",
    "language.chinese": "Chinese",
    "language.summary.auto": "Auto follows your browser language. Current UI: {language}.",
    "language.summary.fixed": "The UI is fixed to {language}.",
    "language.current.en": "English",
    "language.current.zh-CN": "Chinese",
    "language.saved": "Language updated",
    "config.title": "Configuration",
    "config.recommended": "Recommended user-wide files:",
    "config.alternative": "Alternative local files:",
    "config.reader": "The data reader is currently local config. Later it can be swapped for Supabase, Postgres, or pusa-cloud without changing the approval UI contract.",
    "config.yaml": "YAML stores accounts, aliases, identities, user profile, brands, official URLs, knowledge sources, style, CTA URLs, and risk keywords. Secrets stay in env files and are referenced by variable name.",
    "action.approve_plan": "Approve plan",
    "action.needs_review": "Needs review",
    "action.no_action": "No action",
    "action.draft_reply": "Draft reply",
    "action.approve_archive": "Approve archive",
    "action.approve_read": "Approve mark read",
    "action.approve_send": "Approve send",
    "action.save_note": "Save note",
    "bulk.approve.tooltip": "Approve each selected item's current plan in the local file. /kelly-email still applies the final safety gate before touching email.",
    "bulk.review.tooltip": "Send the selected messages back to /kelly-email for human review. No mailbox action will be taken.",
    "bulk.no_action.tooltip": "Record that no action should be taken for the selected messages in this batch.",
    "detail.approve.tooltip": "Approve the suggested plan for this message. This only writes a local decision; /kelly-email still checks safety before execution.",
    "detail.draft.tooltip": "Ask /kelly-email to draft a reply using your Review note. This does not send email.",
    "detail.archive.tooltip": "Approve moving this message out of Inbox into Archive when /kelly-email executes approved decisions.",
    "detail.read.tooltip": "Approve marking this message as read while keeping it in the mailbox folder.",
    "detail.send.tooltip": "Approve sending the edited draft as a reply. /kelly-email will still require safe threading and final send handling.",
    "detail.review.tooltip": "Keep this message for human review. No mailbox action will be taken.",
    "detail.no_action.tooltip": "Record no action for this message in the local decision file.",
    "detail.save.tooltip": "Save this note to the local batch file. It does not touch email.",
    "detail.suggested_reply": "Suggested reply",
    "detail.suggested_reply.placeholder": "Suggested reply for this thread. Edit it, then approve send if it is ready.",
    "detail.html_email": "HTML email",
    "detail.no_html": "No HTML version in this message.",
    "detail.attachments": "Attachments",
    "detail.no_attachments": "No attachments",
    "detail.review_note": "Review note",
    "detail.comment.placeholder": "Type one instruction for /kelly-email. Example: ask Casper; ok to archive; draft a short reply; this is paid invoice, leave unread.",
    "detail.original_text": "Original text",
    "detail.review": "Review",
    "detail.from": "From",
    "detail.to": "To",
    "detail.date": "Date",
    "detail.status": "Status",
    "detail.next": "Next",
    "detail.suggestion": "Suggestion",
    "detail.background": "Background",
    "detail.why_review": "Why review",
    "detail.recommendation": "Recommended next step",
    "attachment.open": "Open",
    "unknown.sender": "(unknown)",
    "unknown.subject": "(no subject)",
    "badge.new": "new",
    "badge.other": "other",
    "badge.review_requested": "review requested",
    "badge.approved_draft": "approved: draft reply",
    "badge.approved_mark_read": "approved: mark read",
    "badge.approved_send": "approved: send",
    "badge.approved_action": "approved: {action}",
    "badge.no_action": "no action",
    "badge.executed": "executed: {action}",
    "badge.blocked": "blocked",
    "badge.suggested": "suggested: {action}",
    "action_label.archive": "archive",
    "action_label.mark_read": "mark read",
    "action_label.send_reply": "send reply",
    "action_label.draft_reply": "draft reply",
    "action_label.keep_unread": "keep unread",
    "action_label.review": "needs review",
    "review.background.default": "{from} sent \"{subject}\". {summary}",
    "review.why.default": "Needs a human decision before mailbox changes.",
    "review.recommend.default": "Read the message, then write your instruction in Review note. If it is safe cleanup, approve archive.",
    "review.recommend.money": "Confirm whether this needs finance/payment handling. If no action is needed, approve archive; otherwise write what I should do next.",
    "review.recommend.course": "Review the student's submission or feedback first. Add a note if you want me to summarize or draft a reply.",
    "review.recommend.security": "Check whether this involves account, privacy, security, or permission changes before approving cleanup.",
    "review.recommend.partnership": "Decide whether this is worth pursuing. You can ask me to draft a short reply, forward internally, or archive.",
    "review.recommend.customer": "Decide whether the sender needs a reply. Write the reply direction here and choose Draft reply.",
    "review.recommend.attachments": "Review the attachment context before cleanup. Ask me to summarize or reply if needed.",
    "onboarding.add_secrets": "Add missing secrets",
    "onboarding.setup": "Set up Kelly Email",
    "onboarding.default_message": "Configure email accounts before generating a mail batch.",
    "onboarding.copy": "Copy {path}",
    "onboarding.save_as": "Save it as {path}",
    "onboarding.fill": "Fill mailboxes, identities, user profile, brands, official URLs, style, and knowledge sources.",
    "onboarding.env": "Put IMAP/SMTP secret values in {path}",
    "onboarding.test": "Ask /kelly-email to test config, then generate a batch.",
    "settings.not_configured": "Not configured",
    "settings.no_urls": "No URLs configured",
    "settings.no_description": "No description",
    "settings.brands": "Brands",
    "settings.no_brands": "No brands configured",
    "settings.operator": "Operator",
    "settings.name": "Name",
    "settings.role": "Role",
    "settings.company": "Company",
    "settings.reply_as": "Reply as",
    "settings.no_languages": "No languages configured",
    "settings.no_bio": "No public bio configured",
    "settings.no_contacts": "No contact methods configured",
    "settings.voice": "Voice",
    "settings.preset": "Preset",
    "settings.language": "Language",
    "settings.tone": "Tone",
    "settings.audience": "Audience",
    "settings.max_words": "Max words",
    "settings.quote": "Quote",
    "settings.short_quote": "Short quote on reply",
    "settings.no_quote": "No quote by default",
    "settings.signature": "Signature",
    "settings.signoff": "Signoff",
    "settings.no_paragraph": "No paragraph style configured",
    "settings.reply_rules": "Reply Rules",
    "settings.no_reply_rules": "No reply rules configured",
    "settings.cta_urls": "CTA URLs",
    "settings.official_urls": "Official URLs",
    "settings.policy": "Policy",
    "settings.enabled": "Enabled",
    "settings.yes": "Yes",
    "settings.no": "No",
    "settings.no_usage": "No usage guidance configured",
    "settings.no_facts": "No product facts configured",
    "settings.do_not_say": "Do Not Say",
    "settings.no_forbidden": "No forbidden claims configured",
    "settings.sources": "Sources",
    "settings.no_sources": "No knowledge sources configured",
    "settings.url": "URL",
    "settings.path": "Path",
    "settings.no_usage_tags": "No usage tags",
    "account.add_title": "Add or change accounts with /kelly-email",
    "account.add_body": "Tell the agent what mailbox, aliases, identity, folders, and provider you want. Keep passwords in the env file only.",
    "account.secrets_missing": "Secrets missing",
    "account.setup_required": "Email setup required",
    "account.no_accounts": "No accounts configured",
    "account.not_set": "not set",
    "account.imap_ready": "IMAP ready",
    "account.imap_missing": "IMAP missing",
    "account.smtp_ready": "SMTP ready",
    "account.smtp_missing": "SMTP missing",
    "toast.select_one": "Select at least one message",
    "toast.saved_count": "Saved local decision for {count} item(s)",
    "toast.saved_detail": "Saved to local batch file"
  },
  "zh-CN": {
    "brand.subtitle": "本地审批台",
    "filter.all": "全部",
    "filter.all.tooltip": "当前本地批次里的所有项目。",
    "filter.needs_review": "需查看",
    "filter.needs_review.tooltip": "需要你的备注或再让 /kelly-email 处理一次的邮件；现在不会执行邮箱操作。",
    "filter.to_approve": "待批准",
    "filter.to_approve.tooltip": "/kelly-email 已有明确建议，通常是归档或标为已读，正在等你批准。",
    "filter.approved": "已批准",
    "filter.approved.tooltip": "你已批准操作。/kelly-email 会在最终安全检查后执行。",
    "filter.done": "完成",
    "filter.done.tooltip": "已经执行，或明确记录为无需操作。",
    "filter.blocked": "受阻",
    "filter.blocked.tooltip": "执行被安全规则或错误拦住，需要再看一下。",
    "help.title": "帮助与设置",
    "help.open.tooltip": "打开使用说明、账号设置、文件路径和配置位置。",
    "help.close": "关闭帮助",
    "help.tabs_aria": "帮助与设置标签",
    "common.close": "关闭",
    "search.placeholder": "搜索发件人、主题、摘要",
    "lock.title": "已锁定",
    "lock.default": "本地文件暂时被锁定。",
    "lock.processing": "/kelly-email 正在处理这个批次，暂时不能编辑。",
    "list.select": "选择",
    "list.items": "{count} 项",
    "list.setup_required": "需要设置",
    "list.no_items": "没有批次项目",
    "list.selected": "已选择 {count} 项",
    "empty.select_message": "选择一封邮件",
    "batch.none": "未加载批次",
    "batch.info": "批次 {id} · {count} 项 · {date}",
    "tab.guide": "指南",
    "tab.files": "文件",
    "tab.accounts": "账号",
    "tab.profile": "资料",
    "tab.style": "风格",
    "tab.knowledge": "知识库",
    "tab.language": "语言",
    "tab.config": "配置",
    "guide.how_title": "工作方式",
    "guide.how_body": "<code>/kelly-email</code> 读取邮件并写入本地批次。这个应用只编辑本地审核文件。你在这里批准后，再让 <code>/kelly-email</code> 执行已批准的决定。",
    "guide.workflow_title": "流程",
    "guide.step1": "让 <code>/kelly-email</code> 生成审核批次。",
    "guide.step2": "在这里查看邮件、批准、请求草稿或留下备注。",
    "guide.step3": "让 <code>/kelly-email</code> 执行已批准的决定。",
    "files.title": "本地文件",
    "files.data_reader": "数据读取器",
    "files.batch_file": "批次文件",
    "files.decision_file": "决定文件",
    "files.config_source": "配置来源",
    "files.not_loaded": "未加载",
    "files.no_batch": "没有批次文件",
    "files.no_decisions": "没有决定文件",
    "files.no_config": "没有配置文件",
    "files.onboarding": "需要先设置",
    "accounts.title": "邮箱账号",
    "accounts.none": "未加载账号",
    "profile.title": "用户资料与品牌",
    "profile.none": "未加载资料",
    "style.title": "回复风格",
    "style.none": "未加载风格",
    "knowledge.title": "知识库",
    "knowledge.none": "未加载知识库",
    "language.title": "语言",
    "language.auto": "自动",
    "language.english": "English",
    "language.chinese": "中文",
    "language.summary.auto": "自动模式会跟随浏览器语言。当前界面：{language}。",
    "language.summary.fixed": "界面已固定为：{language}。",
    "language.current.en": "English",
    "language.current.zh-CN": "中文",
    "language.saved": "语言已更新",
    "config.title": "配置",
    "config.recommended": "推荐的用户级文件：",
    "config.alternative": "可选的本地文件：",
    "config.reader": "当前数据读取器使用本地配置。以后可以切换到 Supabase、Postgres 或 pusa-cloud，而不改变审批 UI 的文件契约。",
    "config.yaml": "YAML 保存账号、别名、身份、用户资料、品牌、官方链接、知识来源、风格、CTA 链接和风险关键词。密钥只放在 env 文件里，并通过变量名引用。",
    "action.approve_plan": "批准方案",
    "action.needs_review": "需查看",
    "action.no_action": "无需操作",
    "action.draft_reply": "起草回复",
    "action.approve_archive": "批准归档",
    "action.approve_read": "批准标已读",
    "action.approve_send": "批准发送",
    "action.save_note": "保存备注",
    "bulk.approve.tooltip": "批准所选项目当前的方案，只写入本地文件。/kelly-email 真正碰邮箱前仍会做最终安全检查。",
    "bulk.review.tooltip": "把所选邮件交回 /kelly-email 等待人工查看；不会执行邮箱操作。",
    "bulk.no_action.tooltip": "在这个批次里记录所选邮件无需操作。",
    "detail.approve.tooltip": "批准这封邮件的建议方案。这只写入本地决定；/kelly-email 执行前仍会做安全检查。",
    "detail.draft.tooltip": "让 /kelly-email 按你的审核备注起草回复；不会发送邮件。",
    "detail.archive.tooltip": "批准 /kelly-email 执行时把这封邮件移出收件箱并归档。",
    "detail.read.tooltip": "批准把这封邮件标为已读，同时保留在当前邮箱文件夹。",
    "detail.send.tooltip": "批准发送编辑后的回复。/kelly-email 仍会检查邮件线程和最终发送安全。",
    "detail.review.tooltip": "保留这封邮件供人工查看；不会执行邮箱操作。",
    "detail.no_action.tooltip": "在本地决定文件里记录这封邮件无需操作。",
    "detail.save.tooltip": "把备注保存到本地批次文件；不会碰邮箱。",
    "detail.suggested_reply": "建议回复",
    "detail.suggested_reply.placeholder": "这条邮件线程的建议回复。可以编辑，确认后再批准发送。",
    "detail.html_email": "HTML 邮件",
    "detail.no_html": "这封邮件没有 HTML 版本。",
    "detail.attachments": "附件",
    "detail.no_attachments": "没有附件",
    "detail.review_note": "审核备注",
    "detail.comment.placeholder": "写一条给 /kelly-email 的指令。例如：问 Casper；可以归档；起草简短回复；这是已付款发票，保持未读。",
    "detail.original_text": "原始文本",
    "detail.review": "审核",
    "detail.from": "发件人",
    "detail.to": "收件人",
    "detail.date": "日期",
    "detail.status": "状态",
    "detail.next": "下一步",
    "detail.suggestion": "建议",
    "detail.background": "背景",
    "detail.why_review": "为什么需查看",
    "detail.recommendation": "建议下一步",
    "attachment.open": "打开",
    "unknown.sender": "（未知）",
    "unknown.subject": "（无主题）",
    "badge.new": "新",
    "badge.other": "其他",
    "badge.review_requested": "已请求查看",
    "badge.approved_draft": "已批准：起草回复",
    "badge.approved_mark_read": "已批准：标已读",
    "badge.approved_send": "已批准：发送",
    "badge.approved_action": "已批准：{action}",
    "badge.no_action": "无需操作",
    "badge.executed": "已执行：{action}",
    "badge.blocked": "受阻",
    "badge.suggested": "建议：{action}",
    "action_label.archive": "归档",
    "action_label.mark_read": "标为已读",
    "action_label.send_reply": "发送回复",
    "action_label.draft_reply": "起草回复",
    "action_label.keep_unread": "保持未读",
    "action_label.review": "需查看",
    "review.background.default": "{from} 发来 “{subject}”。{summary}",
    "review.why.default": "在更改邮箱前需要人工决定。",
    "review.recommend.default": "先阅读邮件，然后在审核备注里写你的指令。如果只是安全清理，可以批准归档。",
    "review.recommend.money": "确认是否需要财务或付款处理。如果不需要操作，可以批准归档；否则写下下一步。",
    "review.recommend.course": "先查看学生提交或反馈。需要我总结或起草回复的话，在备注里写明。",
    "review.recommend.security": "批准清理前，先确认是否涉及账号、隐私、安全或权限变更。",
    "review.recommend.partnership": "决定是否值得继续推进。你可以让我起草简短回复、内部转发或归档。",
    "review.recommend.customer": "判断发件人是否需要回复。把回复方向写在这里，然后选择起草回复。",
    "review.recommend.attachments": "清理前先查看附件上下文。需要我总结或回复的话，在备注里说明。",
    "onboarding.add_secrets": "补充缺少的密钥",
    "onboarding.setup": "设置 Kelly Email",
    "onboarding.default_message": "生成邮件批次前，需要先配置邮箱账号。",
    "onboarding.copy": "复制 {path}",
    "onboarding.save_as": "保存为 {path}",
    "onboarding.fill": "填写邮箱、身份、用户资料、品牌、官方链接、风格和知识来源。",
    "onboarding.env": "把 IMAP/SMTP 密钥值放进 {path}",
    "onboarding.test": "让 /kelly-email 测试配置，然后生成批次。",
    "settings.not_configured": "未配置",
    "settings.no_urls": "未配置链接",
    "settings.no_description": "没有描述",
    "settings.brands": "品牌",
    "settings.no_brands": "未配置品牌",
    "settings.operator": "操作者",
    "settings.name": "姓名",
    "settings.role": "角色",
    "settings.company": "公司",
    "settings.reply_as": "默认回复身份",
    "settings.no_languages": "未配置语言",
    "settings.no_bio": "未配置公开简介",
    "settings.no_contacts": "未配置联系方式",
    "settings.voice": "语气",
    "settings.preset": "预设",
    "settings.language": "语言",
    "settings.tone": "语气",
    "settings.audience": "受众",
    "settings.max_words": "最多字数",
    "settings.quote": "引用",
    "settings.short_quote": "回复时短引用",
    "settings.no_quote": "默认不引用",
    "settings.signature": "签名",
    "settings.signoff": "结尾语",
    "settings.no_paragraph": "未配置段落风格",
    "settings.reply_rules": "回复规则",
    "settings.no_reply_rules": "未配置回复规则",
    "settings.cta_urls": "CTA 链接",
    "settings.official_urls": "官方链接",
    "settings.policy": "策略",
    "settings.enabled": "启用",
    "settings.yes": "是",
    "settings.no": "否",
    "settings.no_usage": "未配置使用说明",
    "settings.no_facts": "未配置产品事实",
    "settings.do_not_say": "不要说",
    "settings.no_forbidden": "未配置禁用表述",
    "settings.sources": "来源",
    "settings.no_sources": "未配置知识来源",
    "settings.url": "链接",
    "settings.path": "路径",
    "settings.no_usage_tags": "未配置用途标签",
    "account.add_title": "用 /kelly-email 添加或修改账号",
    "account.add_body": "告诉 Agent 邮箱、别名、身份、文件夹和服务商即可。密码只放在 env 文件里。",
    "account.secrets_missing": "缺少密钥",
    "account.setup_required": "需要设置邮箱",
    "account.no_accounts": "未配置账号",
    "account.not_set": "未设置",
    "account.imap_ready": "IMAP 已就绪",
    "account.imap_missing": "IMAP 缺失",
    "account.smtp_ready": "SMTP 已就绪",
    "account.smtp_missing": "SMTP 缺失",
    "toast.select_one": "请至少选择一封邮件",
    "toast.saved_count": "已为 {count} 项保存本地决定",
    "toast.saved_detail": "已保存到本地批次文件"
  }
};

function template(value, params = {}) {
  return String(value || "").replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
}

function t(key, params = {}) {
  return template(I18N[uiLanguage]?.[key] || I18N.en[key] || key, params);
}

function browserLanguage() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return languages.some((lang) => String(lang).toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}

function resolveLanguage() {
  if (!["auto", "en", "zh-CN"].includes(languageMode)) languageMode = "auto";
  return languageMode === "auto" ? browserLanguage() : languageMode;
}

function applyTranslations() {
  uiLanguage = resolveLanguage();
  document.documentElement.lang = uiLanguage === "zh-CN" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-tooltip]").forEach((node) => {
    const text = t(node.dataset.i18nTooltip);
    node.dataset.tooltip = text;
    node.title = text;
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('input[name="uiLanguage"]').forEach((input) => {
    input.checked = input.value === languageMode;
  });
  renderLanguageSummary();
}

function renderLanguageSummary() {
  const node = $("languageSummary");
  if (!node) return;
  const current = t(`language.current.${uiLanguage}`);
  node.textContent = languageMode === "auto"
    ? t("language.summary.auto", { language: current })
    : t("language.summary.fixed", { language: current });
}

function setLanguageMode(value) {
  languageMode = ["auto", "en", "zh-CN"].includes(value) ? value : "auto";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, languageMode);
  applyTranslations();
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
  toast(t("language.saved"));
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function api(path, body = null) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortSender(value) {
  return (value || "").replace(/".*?"/g, "").replace(/\s+/g, " ").trim() || t("unknown.sender");
}

function sizeLabel(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImage(att) {
  return (att.content_type || "").startsWith("image/");
}

function isPdf(att) {
  return att.content_type === "application/pdf" || /\.pdf$/i.test(att.filename || "");
}

function attachmentHtml(att) {
  const meta = `${escapeHtml(att.content_type || "file")} ${sizeLabel(att.size)}`;
  const url = att.url ? escapeHtml(att.url) : "";
  const link = url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHtml(t("attachment.open"))}</a>` : "";
  const preview = url && isImage(att)
    ? `<img class="attachment-preview-image" src="${url}" alt="${escapeHtml(att.filename)}" />`
    : url && isPdf(att)
      ? `<iframe class="attachment-preview-pdf" src="${url}" title="${escapeHtml(att.filename)}"></iframe>`
      : "";
  return `
    <div class="attachment">
      <div class="attachment-head">
        <strong>${escapeHtml(att.filename)}</strong>
        <span class="muted">${meta}</span>
        ${link}
      </div>
      ${preview}
    </div>`;
}

function badge(text, extra = "") {
  return `<span class="badge ${extra}">${escapeHtml(text)}</span>`;
}

function actionLabel(action) {
  const labels = {
    archive: t("action_label.archive"),
    mark_read: t("action_label.mark_read"),
    send_reply: t("action_label.send_reply"),
    draft_reply: t("action_label.draft_reply"),
    keep_unread: t("action_label.keep_unread"),
    review: t("action_label.review"),
  };
  return labels[action] || action || t("action_label.review");
}

function planBadge(item) {
  const action = item.proposed_action || "review";
  if (action === "review") return badge(t("action_label.review"), "review");
  return badge(t("badge.suggested", { action: actionLabel(action) }));
}

function tooltipAttr(text) {
  return `class="has-tooltip" data-tooltip="${escapeHtml(text)}" title="${escapeHtml(text)}"`;
}

function countFor(name) {
  if (name === "all") return state.total_cached || 0;
  return state.counts[name] || 0;
}

function renderCounts() {
  ["all", "needs_review", "to_approve", "approved", "done", "blocked"].forEach((name) => {
    const el = $(`count-${name}`);
    if (el) el.textContent = countFor(name);
  });
}

function renderBulkActions() {
  const bar = $("bulkActions");
  const selected = $("selectedCount");
  if (!bar || !selected) return;
  const count = checked.size;
  bar.classList.toggle("is-hidden", count === 0);
  selected.textContent = t("list.selected", { count });
}

function accountsCardsHtml() {
  const payload = state.email_accounts || {};
  const onboarding = payload.onboarding || {};
  const accounts = payload.accounts || [];
  const promptCard = `
    <article class="account-help-card">
      <div>
        <strong>${escapeHtml(t("account.add_title"))}</strong>
        <p>${escapeHtml(t("account.add_body"))}</p>
      </div>
      <pre><code>/kelly-email 帮我增加一个 email account：邮箱是 name@example.com，IMAP/SMTP 是 example.com，alias 有 support@example.com，用 Support 身份回复。请更新本地 config，但不要让我在聊天里贴密码。

/kelly-email 给 main 账号增加 alias：hello@example.com，并新增一个 outbound identity：display name 是 Founder，send_as 是 founder@example.com。

/kelly-email 测试当前 email account 配置，告诉我缺哪些 env secret。</code></pre>
    </article>
  `;
  if (!onboarding.configured) {
    const missing = (onboarding.missing_env || []).map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`).join("");
    return `
      ${promptCard}
      <div class="onboarding-card compact">
        <strong>${onboarding.state === "missing_secrets" ? escapeHtml(t("account.secrets_missing")) : escapeHtml(t("account.setup_required"))}</strong>
        <p>${escapeHtml(onboarding.message || t("onboarding.default_message"))}</p>
        ${missing ? `<div class="account-envs">${missing}</div>` : ""}
      </div>
    `;
  }
  if (!accounts.length) {
    return `${promptCard}<div class="muted">${escapeHtml(t("account.no_accounts"))}</div>`;
  }
  const accountCards = accounts.map((account) => {
    const aliases = (account.aliases || []).map((alias) => `<span>${escapeHtml(alias)}</span>`).join("");
    const identities = (account.identities || []).map((identity) => `
      <div class="account-identity">
        <span>${escapeHtml(identity.display_name || identity.identity_id)}</span>
        <code>${escapeHtml(identity.send_as_email)}</code>
      </div>
    `).join("");
    const imapOk = account.imap_env_configured ? "ok" : "warn";
    const smtpOk = account.smtp_env_configured ? "ok" : "warn";
    return `
      <article class="account-card">
        <div class="account-card-head">
          <div>
            <strong>${escapeHtml(account.display_name)}</strong>
            <small>${escapeHtml(account.primary_email || account.mailbox_id)}</small>
          </div>
          <div class="account-envs">
            <span class="env-pill ${imapOk}" title="${escapeHtml(account.imap_password_env)}">${escapeHtml(account.imap_env_configured ? t("account.imap_ready") : t("account.imap_missing"))}</span>
            <span class="env-pill ${smtpOk}" title="${escapeHtml(account.smtp_password_env)}">${escapeHtml(account.smtp_env_configured ? t("account.smtp_ready") : t("account.smtp_missing"))}</span>
          </div>
        </div>
        <div class="account-detail">
          <div class="account-row"><span>IMAP</span><code>${escapeHtml(account.imap_host)}</code></div>
          <div class="account-row"><span>SMTP</span><code>${escapeHtml(account.smtp_host || t("account.not_set"))}</code></div>
          ${aliases ? `<div class="alias-list">${aliases}</div>` : ""}
          ${identities ? `<div class="identity-list">${identities}</div>` : ""}
        </div>
      </article>
    `;
  }).join("");
  return `${promptCard}${accountCards}`;
}

function accountSummaryHtml() {
  return accountsCardsHtml();
}

function valueOrMuted(value, fallback = t("settings.not_configured")) {
  return value ? escapeHtml(value) : `<span class="muted">${escapeHtml(fallback)}</span>`;
}

function listPills(values, empty = t("settings.not_configured")) {
  const rows = (values || []).filter(Boolean);
  if (!rows.length) return `<span class="muted">${escapeHtml(empty)}</span>`;
  return rows.map((value) => `<span class="settings-pill">${escapeHtml(value)}</span>`).join("");
}

function urlsHtml(urls = {}) {
  const rows = Object.entries(urls || {}).filter(([, value]) => value);
  if (!rows.length) return `<span class="muted">${escapeHtml(t("settings.no_urls"))}</span>`;
  return rows.map(([label, value]) => `
    <div class="settings-row">
      <span>${escapeHtml(label)}</span>
      <a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value)}</a>
    </div>
  `).join("");
}

function profileSettingsHtml() {
  const payload = state.email_accounts || {};
  const profile = payload.profile || {};
  const brands = payload.brands || [];
  const contacts = (profile.contact_methods || []).map((method) => `${method.label}: ${method.value}`);
  const brandHtml = brands.length
    ? brands.map((brand) => `
      <article class="settings-card">
        <div class="settings-card-title">${escapeHtml(brand.name || brand.brand_id || t("settings.brands"))}</div>
        <p>${valueOrMuted(brand.description, t("settings.no_description"))}</p>
        <div class="settings-list">
          ${urlsHtml({
            homepage: brand.homepage,
            docs: brand.docs_url,
            support: brand.support_url,
            youtube: brand.youtube_url,
          })}
        </div>
      </article>
    `).join("")
    : `<article class="settings-card"><div class="settings-card-title">${escapeHtml(t("settings.brands"))}</div><p class="muted">${escapeHtml(t("settings.no_brands"))}</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.operator"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.name"))}</span><strong>${valueOrMuted(profile.display_name)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.role"))}</span><strong>${valueOrMuted(profile.role)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.company"))}</span><strong>${valueOrMuted(profile.company)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.reply_as"))}</span><strong>${valueOrMuted(profile.default_reply_as)}</strong></div>
      <div class="settings-pill-row">${listPills(profile.languages, t("settings.no_languages"))}</div>
      <p>${valueOrMuted(profile.public_bio, t("settings.no_bio"))}</p>
      <div class="settings-pill-row">${listPills(contacts, t("settings.no_contacts"))}</div>
    </article>
    ${brandHtml}
  `;
}

function styleSettingsHtml() {
  const payload = state.email_accounts || {};
  const style = payload.style || {};
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.voice"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.preset"))}</span><strong>${valueOrMuted(style.preset)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.language"))}</span><strong>${valueOrMuted(style.default_language, "auto")}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.tone"))}</span><strong>${valueOrMuted(style.tone)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.audience"))}</span><strong>${valueOrMuted(style.audience)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.max_words"))}</span><strong>${valueOrMuted(style.max_reply_words)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.quote"))}</span><strong>${style.include_short_quote ? escapeHtml(t("settings.short_quote")) : escapeHtml(t("settings.no_quote"))}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.signature"))}</span><strong>${valueOrMuted(style.signature_mode)}</strong></div>
      <div class="settings-row"><span>${escapeHtml(t("settings.signoff"))}</span><strong>${valueOrMuted(style.preferred_signoff)}</strong></div>
      <p>${valueOrMuted(style.paragraph_style, t("settings.no_paragraph"))}</p>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.reply_rules"))}</div>
      <div class="settings-bullets">${(style.reply_rules || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_reply_rules"))}</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.cta_urls"))}</div>
      <div class="settings-list">${urlsHtml(style.cta_urls || {})}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.official_urls"))}</div>
      <div class="settings-list">${urlsHtml(payload.official_urls || {})}</div>
    </article>
  `;
}

function knowledgeSettingsHtml() {
  const kb = state.email_accounts?.knowledge_base || {};
  const sources = kb.sources || [];
  const sourceHtml = sources.length
    ? sources.map((source) => `
      <article class="settings-card">
        <div class="settings-card-title">
          ${escapeHtml(source.title || source.source_id || "Knowledge source")}
          <span class="source-type">${escapeHtml(source.type || "source")}</span>
        </div>
        <div class="settings-list">
          ${source.url ? `<div class="settings-row"><span>${escapeHtml(t("settings.url"))}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.url)}</a></div>` : ""}
          ${source.path ? `<div class="settings-row"><span>${escapeHtml(t("settings.path"))}</span><code>${escapeHtml(source.path)}</code></div>` : ""}
          <div class="settings-pill-row">${listPills(source.use_for, t("settings.no_usage_tags"))}</div>
        </div>
      </article>
    `).join("")
    : `<article class="settings-card"><div class="settings-card-title">${escapeHtml(t("settings.sources"))}</div><p class="muted">${escapeHtml(t("settings.no_sources"))}</p></article>`;
  return `
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.policy"))}</div>
      <div class="settings-row"><span>${escapeHtml(t("settings.enabled"))}</span><strong>${kb.enabled ? escapeHtml(t("settings.yes")) : escapeHtml(t("settings.no"))}</strong></div>
      <p>${valueOrMuted(kb.usage, t("settings.no_usage"))}</p>
      <div class="settings-bullets">${(kb.facts || []).map((fact) => `<div>${escapeHtml(fact)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_facts"))}</span>`}</div>
    </article>
    <article class="settings-card">
      <div class="settings-card-title">${escapeHtml(t("settings.do_not_say"))}</div>
      <div class="settings-bullets">${(kb.do_not_say || []).map((rule) => `<div>${escapeHtml(rule)}</div>`).join("") || `<span class="muted">${escapeHtml(t("settings.no_forbidden"))}</span>`}</div>
    </article>
    ${sourceHtml}
  `;
}

function setHelpTab(name) {
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.helpTab === name);
  });
  document.querySelectorAll("[data-help-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.helpPanel === name);
  });
}

function openHelp() {
  const modal = $("helpModal");
  const batch = state.batch || {};
  const onboarding = state.email_accounts?.onboarding || {};
  $("helpBatchInfo").textContent = batch.batch_id
    ? t("batch.info", { id: batch.batch_id, count: state.total_cached || 0, date: batch.generated_at || "" })
    : t("batch.none");
  $("helpDataReader").textContent = `${state.email_accounts?.data_reader || "local"}${state.email_accounts?.data_provider ? ` · ${state.email_accounts.data_provider}` : ""}`;
  $("helpBatchPath").textContent = state.batch_path || t("files.no_batch");
  $("helpDecisionsPath").textContent = state.decisions_path || t("files.no_decisions");
  $("helpConfigPath").textContent = onboarding.configured ? state.email_accounts?.source || t("files.no_config") : t("files.onboarding");
  $("helpAccounts").innerHTML = accountSummaryHtml();
  $("helpProfile").innerHTML = profileSettingsHtml();
  $("helpStyle").innerHTML = styleSettingsHtml();
  $("helpKnowledge").innerHTML = knowledgeSettingsHtml();
  renderLanguageSummary();
  setHelpTab("guide");
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  const modal = $("helpModal");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

function isLocked() {
  return Boolean(state.lock && state.lock.locked);
}

function applyLockState() {
  const locked = isLocked();
  document.body.classList.toggle("is-locked", locked);
  const banner = $("lockBanner");
  if (banner) {
    banner.classList.toggle("is-hidden", !locked);
  }
  const message = $("lockMessage");
  if (message) {
    message.textContent = locked
      ? state.lock.message || t("lock.processing")
      : t("lock.default");
  }
  document.querySelectorAll("button, input, textarea").forEach((node) => {
    if (node.id === "searchInput") return;
    node.disabled = locked;
  });
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.matches("textarea")) return true;
  return active.matches("input") && active.id !== "searchInput";
}

function decisionLabel(item) {
  const action = item.decision?.action;
  if (!action) return "";
  if (action === "review" || action === "needs_review") return badge(t("badge.review_requested"), "review");
  if (action === "draft_reply") return badge(t("badge.approved_draft"), "decided");
  if (action === "mark_read") return badge(t("badge.approved_mark_read"), "decided");
  if (action === "send_reply") return badge(t("badge.approved_send"), "decided");
  if (action === "no_action") return badge(t("badge.no_action"), "done");
  return badge(t("badge.approved_action", { action }), "decided");
}

function executionLabel(item) {
  const execution = item.execution || {};
  if (execution.status === "executed") return badge(t("badge.executed", { action: execution.action }), "executed");
  if (execution.status === "blocked") return badge(t("badge.blocked"), "blocked");
  return "";
}

function reviewBriefFor(item) {
  const brief = item.review_brief || {};
  const background = brief.background || t("review.background.default", {
    from: item.from || t("unknown.sender"),
    subject: item.subject || t("unknown.subject"),
    summary: item.summary || "",
  });
  const why = brief.why_review || item.reason || t("review.why.default");
  let recommendation = brief.recommendation || t("review.recommend.default");
  const category = item.category || "";
  const risks = new Set(item.risk || []);
  if (!brief.recommendation) {
    if (category === "money" || risks.has("money")) {
      recommendation = t("review.recommend.money");
    } else if (category === "course_feedback") {
      recommendation = t("review.recommend.course");
    } else if (category.includes("security") || risks.has("security")) {
      recommendation = t("review.recommend.security");
    } else if (category === "partnership") {
      recommendation = t("review.recommend.partnership");
    } else if (category === "customer") {
      recommendation = t("review.recommend.customer");
    } else if ((item.attachments || []).length) {
      recommendation = t("review.recommend.attachments");
    }
  }
  return { background, why, recommendation };
}

function suggestedReplyFor(item) {
  return String(item.draft || item.suggested_reply || item.review_brief?.suggested_reply || "").trim();
}

function reviewBriefHtml(item) {
  const needs = item.status === "needs_review" || ["needs_review", "revise", "review"].includes(item.decision?.action);
  if (!needs) return "";
  const brief = reviewBriefFor(item);
  const title = item.review_ref ? `${t("detail.suggestion")} · ${item.review_ref}` : t("detail.suggestion");
  return `
    <div class="review-advice">
      <div class="review-advice-title">${escapeHtml(title)}</div>
      <dl>
        <dt>${escapeHtml(t("detail.background"))}</dt>
        <dd>${escapeHtml(brief.background)}</dd>
        <dt>${escapeHtml(t("detail.why_review"))}</dt>
        <dd>${escapeHtml(brief.why)}</dd>
        <dt>${escapeHtml(t("detail.recommendation"))}</dt>
        <dd>${escapeHtml(brief.recommendation)}</dd>
      </dl>
    </div>
  `;
}

function rowHtml(item) {
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const checkedAttr = checked.has(item.id) ? "checked" : "";
  const reviewRef = item.review_ref ? `<span class="review-ref">${escapeHtml(item.review_ref)}</span>` : "";
  return `
    <div class="message-row ${selectedId === item.id ? "selected" : ""}" data-id="${escapeHtml(item.id)}">
      <div><input type="checkbox" class="row-check" data-id="${escapeHtml(item.id)}" ${checkedAttr}></div>
      <div>
        <div class="row-top">
          <div class="sender-line">${reviewRef}<span class="sender">${escapeHtml(shortSender(item.from))}</span></div>
          <div class="date">${escapeHtml(item.uid)}</div>
        </div>
        <div class="subject">${escapeHtml(item.subject)}</div>
        <div class="summary">${escapeHtml(item.summary)}</div>
        <div class="badges">
          ${badge(item.status || t("badge.new"), item.status || "")}
          ${badge(item.category || t("badge.other"))}
          ${planBadge(item)}
          ${risks}
          ${decisionLabel(item)}
          ${executionLabel(item)}
        </div>
      </div>
    </div>`;
}

function renderList() {
  if (state.email_accounts?.onboarding && !state.email_accounts.onboarding.configured) {
    $("messageList").innerHTML = onboardingHtml();
    $("listCount").textContent = t("list.setup_required");
    return;
  }
  $("messageList").innerHTML = state.items.map(rowHtml).join("") || `<div class="empty-detail">${escapeHtml(t("list.no_items"))}</div>`;
  $("listCount").textContent = t("list.items", { count: state.items.length });
  document.querySelectorAll(".message-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (isLocked()) return;
      if (event.target.classList.contains("row-check")) return;
      selectedId = row.dataset.id;
      renderList();
      renderDetail();
    });
  });
  document.querySelectorAll(".row-check").forEach((box) => {
    box.addEventListener("change", () => {
      if (isLocked()) {
        box.checked = checked.has(box.dataset.id);
        return;
      }
      if (box.checked) checked.add(box.dataset.id);
      else checked.delete(box.dataset.id);
      renderBulkActions();
    });
  });
  renderBulkActions();
}

function onboardingHtml() {
  const onboarding = state.email_accounts?.onboarding || {};
      const missing = (onboarding.missing_env || []).map((name) => `<span class="env-pill warn">${escapeHtml(name)}</span>`).join("");
  return `
    <div class="onboarding-card">
      <strong>${onboarding.state === "missing_secrets" ? escapeHtml(t("onboarding.add_secrets")) : escapeHtml(t("onboarding.setup"))}</strong>
      <p>${escapeHtml(onboarding.message || t("onboarding.default_message"))}</p>
      <ol>
        <li>${template(escapeHtml(t("onboarding.copy")), { path: `<code>${escapeHtml(onboarding.example_config || ".agents/skills/kelly-email/config.example.yml")}</code>` })}</li>
        <li>${template(escapeHtml(t("onboarding.save_as")), { path: `<code>${escapeHtml(onboarding.recommended_config || "~/.config/kelly-email/config.yml")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.fill"))}</li>
        <li>${template(escapeHtml(t("onboarding.env")), { path: `<code>${escapeHtml(onboarding.recommended_env || "~/.config/kelly-email/.env")}</code>` })}</li>
        <li>${escapeHtml(t("onboarding.test"))}</li>
      </ol>
      ${missing ? `<div class="account-envs">${missing}</div>` : ""}
    </div>
  `;
}

function selectedItem() {
  return state.items.find((item) => item.id === selectedId);
}

function renderDetail() {
  if (state.email_accounts?.onboarding && !state.email_accounts.onboarding.configured) {
    $("detailPanel").innerHTML = onboardingHtml();
    return;
  }
  const item = selectedItem();
  if (!item) {
    $("detailPanel").innerHTML = `<div class="empty-detail">${escapeHtml(t("empty.select_message"))}</div>`;
    return;
  }
  const attachments = (item.attachments || []).map(attachmentHtml).join("");
  const htmlPreview = (item.html || "").trim()
    ? `<iframe class="html-preview" sandbox srcdoc="${escapeHtml(item.html)}"></iframe>`
    : `<div class="body-box muted">${escapeHtml(t("detail.no_html"))}</div>`;
  const risks = (item.risk || []).map((risk) => badge(risk, risk)).join("");
  const suggestedReply = suggestedReplyFor(item);
  const showDraft = Boolean(suggestedReply) || item.status === "drafted" || item.decision?.action === "send_reply";
  const draftSection = showDraft
    ? `
    <div class="section-title">${escapeHtml(t("detail.suggested_reply"))}</div>
    <textarea id="draftText" class="draft-box" placeholder="${escapeHtml(t("detail.suggested_reply.placeholder"))}">${escapeHtml(suggestedReply)}</textarea>
  `
    : `<textarea id="draftText" class="draft-box is-hidden">${escapeHtml(item.draft || "")}</textarea>`;
  const reviewMeta = item.review_ref
    ? `<strong>${escapeHtml(t("detail.review"))}</strong><div><span class="review-ref detail-review-ref">${escapeHtml(item.review_ref)}</span></div>`
    : "";
  const actionBar = `
    <div class="detail-actions detail-actions-top">
      <button id="approveProposed" class="primary has-tooltip" data-tooltip="${escapeHtml(t("detail.approve.tooltip"))}" title="${escapeHtml(t("detail.approve.tooltip"))}">${escapeHtml(t("action.approve_plan"))}</button>
      <button id="draftReply" ${tooltipAttr(t("detail.draft.tooltip"))}>${escapeHtml(t("action.draft_reply"))}</button>
      <button id="approveArchive" ${tooltipAttr(t("detail.archive.tooltip"))}>${escapeHtml(t("action.approve_archive"))}</button>
      <button id="approveRead" ${tooltipAttr(t("detail.read.tooltip"))}>${escapeHtml(t("action.approve_read"))}</button>
      <button id="approveSend" ${tooltipAttr(t("detail.send.tooltip"))}>${escapeHtml(t("action.approve_send"))}</button>
      <button id="markReview" ${tooltipAttr(t("detail.review.tooltip"))}>${escapeHtml(t("action.needs_review"))}</button>
      <button id="noAction" ${tooltipAttr(t("detail.no_action.tooltip"))}>${escapeHtml(t("action.no_action"))}</button>
    </div>
  `;
  $("detailPanel").innerHTML = `
    ${actionBar}
    <div class="detail-title">${escapeHtml(item.subject)}</div>
    <div class="detail-meta">
      ${reviewMeta}
      <strong>${escapeHtml(t("detail.from"))}</strong><div>${escapeHtml(item.from)}</div>
      <strong>${escapeHtml(t("detail.to"))}</strong><div>${escapeHtml(item.to)}</div>
      <strong>${escapeHtml(t("detail.date"))}</strong><div>${escapeHtml(item.date)}</div>
      <strong>${escapeHtml(t("detail.status"))}</strong><div>${badge(item.status, item.status)} ${badge(item.category)} ${risks} ${decisionLabel(item)} ${executionLabel(item)}</div>
      <strong>${escapeHtml(t("detail.next"))}</strong><div>${escapeHtml(actionLabel(item.proposed_action))} · ${escapeHtml(item.reason)}</div>
    </div>
    ${reviewBriefHtml(item)}
    ${draftSection}
    <div class="section-title">${escapeHtml(t("detail.html_email"))}</div>
    ${htmlPreview}
    <div class="section-title">${escapeHtml(t("detail.attachments"))}</div>
    <div class="attachment-list">${attachments || `<span class="muted">${escapeHtml(t("detail.no_attachments"))}</span>`}</div>
    <div class="section-title">${escapeHtml(t("detail.review_note"))}</div>
    <textarea id="commentText" class="comment-box" placeholder="${escapeHtml(t("detail.comment.placeholder"))}">${escapeHtml(item.user_comment || "")}</textarea>
    <div class="detail-actions">
      <button id="saveDetail" class="has-tooltip" data-tooltip="${escapeHtml(t("detail.save.tooltip"))}" title="${escapeHtml(t("detail.save.tooltip"))}">${escapeHtml(t("action.save_note"))}</button>
    </div>
    <div class="section-title">${escapeHtml(t("detail.original_text"))}</div>
    <div class="body-box">${escapeHtml(item.body)}</div>
  `;
  applyLockState();
  $("approveProposed").onclick = () => decide("approve_proposed", [item.id]);
  $("draftReply").onclick = () => decide("draft_reply", [item.id]);
  $("approveArchive").onclick = () => decide("approve_archive", [item.id]);
  $("approveRead").onclick = () => decide("approve_mark_read", [item.id]);
  $("approveSend").onclick = () => decide("approve_send", [item.id]);
  $("markReview").onclick = () => decide("needs_review", [item.id]);
  $("noAction").onclick = () => decide("no_action", [item.id]);
  $("saveDetail").onclick = async () => {
    if (isLocked()) return toast(t("lock.processing"));
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText").value,
      suggested_reply: $("draftText").value,
      comment: $("commentText").value,
    });
    toast(t("toast.saved_detail"));
    await refresh();
    selectedId = item.id;
    renderDetail();
  };
}

async function refresh() {
  if (isEditing()) return pollLock();
  const q = encodeURIComponent($("searchInput").value || "");
  state = await api(`/api/state?mode=${mode}&q=${q}`);
  renderCounts();
  renderList();
  renderDetail();
  applyLockState();
}

async function pollLock() {
  const data = await api("/api/lock");
  state.lock = data.lock || { locked: false };
  applyLockState();
}

async function decide(action, ids = null) {
  if (isLocked()) return toast(t("lock.processing"));
  const list = ids && ids.length ? ids : Array.from(checked);
  if (!list.length) return toast(t("toast.select_one"));
  const item = selectedItem();
  const comment = item && ids ? $("commentText")?.value || "" : "";
  if (item && ids) {
    await api("/api/detail", {
      id: item.id,
      draft: $("draftText")?.value || item.draft || "",
      suggested_reply: $("draftText")?.value || item.suggested_reply || "",
      comment,
    });
  }
  const data = await api("/api/decision", { ids: list, action, comment });
  list.forEach((id) => checked.delete(id));
  toast(t("toast.saved_count", { count: data.changed.length }));
  await refresh();
}

function wire() {
  $("helpButton").onclick = openHelp;
  $("closeHelp").onclick = closeHelp;
  $("helpModal").addEventListener("click", (event) => {
    if (event.target.id === "helpModal") closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("helpModal").classList.contains("is-hidden")) closeHelp();
  });
  document.querySelectorAll("[data-help-tab]").forEach((button) => {
    button.onclick = () => setHelpTab(button.dataset.helpTab);
  });
  $("approveSelected").onclick = () => decide("approve_proposed");
  $("reviewSelected").onclick = () => decide("needs_review");
  $("noActionSelected").onclick = () => decide("no_action");
  $("selectAll").onchange = (event) => {
    if (isLocked()) {
      event.target.checked = false;
      return toast(t("lock.processing"));
    }
    if (event.target.checked) state.items.forEach((item) => checked.add(item.id));
    else checked.clear();
    renderList();
    renderBulkActions();
  };
  $("searchInput").addEventListener("input", () => refresh());
  document.querySelectorAll("#filters button").forEach((button) => {
    button.onclick = async () => {
      document.querySelectorAll("#filters button").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      mode = button.dataset.mode;
      selectedId = null;
      await refresh();
    };
  });
  document.querySelectorAll('input[name="uiLanguage"]').forEach((input) => {
    input.onchange = () => setLanguageMode(input.value);
  });
}

applyTranslations();
wire();
refresh().catch((error) => toast(error.message));
lockTimer = setInterval(() => pollLock().catch((error) => toast(error.message)), 3000);
refreshTimer = setInterval(() => refresh().catch((error) => toast(error.message)), 5000);
