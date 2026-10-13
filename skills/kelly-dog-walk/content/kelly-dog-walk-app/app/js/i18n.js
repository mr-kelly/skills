// UI chrome in two languages. Data — the playbook's own words, a rule's 依据 sentence — is shown in
// the language it was written in; only the demo story ships an English rendering of its timeline.

const zh = {
  htmlLang: "zh-CN",
  brand: "遛狗日历",
  brandSub: "遛狗不淋雨 · 只读",
  navCalendar: "日历",
  navTimeline: "手册时间线",
  navHelp: "帮助与设置",
  menu: "展开或收起侧栏",
  close: "关闭",
  modeDemo: "演示 · 上海 2026 真实天气回放",
  modeLive: "Busabase · 只读",
  attentionEyebrow: "这个月",
  attentionWet: (n) => `淋雨 ${n} 次`,
  attentionMeta: (v, j) => `手册 ${v} · 裁判规则 ${j}`,
  approvalsWhere: "改手册在 Busabase 的变更请求里审批，这里没有审批按钮。",
  approvalsPending: (n) => (n ? `${n} 个手册变更等你审批` : "没有等你审批的手册变更"),
  verdict: { 没淋: "没淋", 淋雨: "淋雨", 太热: "太热", 不方便: "不方便", 待判: "待判" },
  verdictShort: { 没淋: "没淋", 淋雨: "淋雨", 太热: "太热", 不方便: "不方便", 待判: "待判" },
  verdictHint: {
    没淋: "那个钟点没下雨、不烫脚、主人方便",
    淋雨: "那个钟点实际降水 ≥ 0.2 mm",
    太热: "那个钟点实际气温 ≥ 32°C",
    不方便: "不在主人的方便时段",
    待判: "实际天气还没出来",
  },
  legend: "图例",
  monthName: (month) => `${Number(month.slice(5))} 月`,
  monthLong: (month) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`,
  monthFrom: (month) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月起`,
  weekdays: ["一", "二", "三", "四", "五", "六", "日"],
  weekdayLong: ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  calendarEyebrow: (month, versions, judge) =>
    `${zh.monthLong(month)} · 遛狗手册 ${versions.join(" / ") || "—"} · 裁判规则 ${judge || "—"}`,
  calendarHeadline: (month, wet) =>
    wet ? `${zh.monthName(month)}淋了 ${wet} 次雨。` : `${zh.monthName(month)}一次雨都没淋。`,
  hourUnit: "点",
  hourLabel: (hour) => `${hour} 点`,
  metricWet: "淋雨",
  metricHot: "太热",
  metricOff: "不方便",
  ofDays: (n) => `/ ${n} 天`,
  compareTitle: (baseline) => `和一直用 ${baseline} 比`,
  seriesCurrent: (versions) => `当月手册 ${versions.join(" / ")}`,
  seriesCurrentShort: (versions) => `手册 ${versions.join(" / ")}`,
  seriesBaselineShort: (baseline) => `一直 ${baseline}`,
  seriesBaseline: (baseline, hour) => `一直用 ${baseline}（每天 ${hour} 点）`,
  compareMissing: "天气数据里没有这个月默认钟点的记录，没法对照。",
  compareCoverage: (covered, days) => `对照只覆盖 ${covered} / ${days} 天`,
  chartTip: (series, metric, n) => `${series}：${metric} ${n} 次`,
  dayDetailEmpty: "点日历上的一天，看 Agent 当时为什么选这个钟点。",
  dayTitle: (date, weekday) =>
    `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日 · ${zh.weekdayLong[weekday]}`,
  dayHour: "遛狗钟点",
  dayReason: "依据规则",
  dayProb: "当时预报降水概率",
  dayFtemp: "当时预报气温",
  dayRain: "实际降水",
  dayTemp: "实际气温",
  dayVerdict: "结论",
  dayVersion: "手册版本",
  alsoFlags: "同一天还算：",
  timelineEyebrow: "遛狗手册 · 版本时间线",
  timelineHeadline: (first, current) =>
    first && current && first !== current ? `手册从 ${first} 走到了 ${current}。` : `手册现在是 ${current || "—"}。`,
  timelineLede: "每一版都是 Agent 提的变更请求，主人合并才生效。数字是同一个月的真实天气回放。",
  versionCurrent: "现在用的",
  versionRetired: "已退休",
  versionWhy: "为什么",
  versionMonth: (month) => `${zh.monthName(month)}的结果`,
  closedTitle: "没合并的提议",
  judgeChangeTitle: (from, to) => `裁判规则 ${from} → ${to}`,
  retiredReason: "退休原因",
  totalsTitle: (n) => `${n} 个月合计`,
  totalsCurrent: "当时的手册",
  noData: "「每天的决定」里还没有记录。让 Agent 回放一个月，或者等它跑完今天的决定。",
  helpTitle: "帮助与设置",
  helpWhatTitle: "这是什么",
  helpWhat:
    "Agent 每天替主人决定几点遛狗，裁判是真实天气：那个钟点到底下没下雨。这个日历只读，展示每天的钟点、裁判的结论、每个月的汇总，以及遛狗手册一版一版是怎么变过来的。",
  helpApproveTitle: "在哪里审批",
  helpApprove:
    "Agent 只能给「遛狗手册」提变更请求。去 Busabase 打开那个变更请求，看证据表，合并才算数。裁判规则对 Agent 只读，只有主人能改。",
  helpDataTitle: "数据",
  helpDataDemo:
    "演示数据：上海（31.23, 121.47）2026 年 6–9 月的 Open-Meteo 真实天气，按当时在用的手册回放。不读也不写 Busabase。",
  helpDataLive: (folder, city) => `Busabase 文件夹「${folder}」· 城市 ${city || "—"} · 只读，不写任何东西。`,
  helpJudge: (j) =>
    `裁判规则 ${j.version}：淋雨 ≥ ${j.wetMm} mm，太热 ≥ ${j.hotC}°C，主人方便时段 ${j.ownerHours.join("、")} 点${j.guardrails ? `，护栏 太热 ${j.guardrails.hot} 次、不方便 ${j.guardrails.off} 次` : "，没有护栏"}。`,
  helpStyleTitle: "风格",
  helpLangTitle: "语言",
  loading: "正在读取遛狗日历…",
  errorTitle: "遛狗日历暂时读不到数据",
  retry: "重新读取",
  families: {
    "ink-paper": "墨与纸",
    "rose-ochre": "玫瑰与赭石",
    "mauve-plum": "紫灰与梅色",
    "coral-amber": "珊瑚与琥珀",
    "sage-clay": "鼠尾草与陶土",
    "ink-blush": "墨与胭脂",
    graphite: "石墨",
  },
};

const en = {
  htmlLang: "en",
  brand: "Walk calendar",
  brandSub: "No-rain dog walks · read-only",
  navCalendar: "Calendar",
  navTimeline: "Playbook timeline",
  navHelp: "Help & settings",
  menu: "Show or hide the sidebar",
  close: "Close",
  modeDemo: "Demo · Shanghai 2026 real-weather replay",
  modeLive: "Busabase · read-only",
  attentionEyebrow: "This month",
  attentionWet: (n) => `${n} wet walk${n === 1 ? "" : "s"}`,
  attentionMeta: (v, j) => `playbook ${v} · judge ${j}`,
  approvalsWhere: "Playbook changes are approved as change requests in Busabase. This app has no approve button.",
  approvalsPending: (n) =>
    n ? `${n} playbook change${n === 1 ? "" : "s"} awaiting you` : "No playbook change awaiting you",
  verdict: { 没淋: "Dry", 淋雨: "Rained", 太热: "Too hot", 不方便: "Off-hours", 待判: "Pending" },
  verdictShort: { 没淋: "Dry", 淋雨: "Rain", 太热: "Hot", 不方便: "Off-hrs", 待判: "Pending" },
  verdictHint: {
    没淋: "no rain, no hot paws, a convenient hour",
    淋雨: "actual rain ≥ 0.2 mm in that hour",
    太热: "actual temperature ≥ 32°C in that hour",
    不方便: "outside the owner's convenient hours",
    待判: "actual weather not in yet",
  },
  legend: "Legend",
  monthName: (month) =>
    new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)),
  monthLong: (month) =>
    new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    ),
  monthFrom: (month) => `From ${en.monthLong(month)}`,
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  weekdayLong: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  calendarEyebrow: (month, versions, judge) =>
    `${en.monthLong(month)} · playbook ${versions.join(" / ") || "—"} · judge ${judge || "—"}`,
  calendarHeadline: (month, wet) =>
    wet
      ? `${en.monthName(month)}: ${wet} wet walk${wet === 1 ? "" : "s"}.`
      : `${en.monthName(month)}: not one wet walk.`,
  hourUnit: ":00",
  hourLabel: (hour) => `${hour}:00`,
  metricWet: "Rained",
  metricHot: "Too hot",
  metricOff: "Off-hours",
  ofDays: (n) => `/ ${n} days`,
  compareTitle: (baseline) => `Versus staying on ${baseline}`,
  seriesCurrent: (versions) => `Playbook ${versions.join(" / ")} that month`,
  seriesCurrentShort: (versions) => `Playbook ${versions.join(" / ")}`,
  seriesBaselineShort: (baseline) => `Always ${baseline}`,
  seriesBaseline: (baseline, hour) => `Always ${baseline} (${hour}:00 daily)`,
  compareMissing: "No weather rows at the default hour for this month, so there is nothing to compare.",
  compareCoverage: (covered, days) => `The comparison covers ${covered} of ${days} days`,
  chartTip: (series, metric, n) => `${series}: ${metric} ${n}`,
  dayDetailEmpty: "Pick a day to see why the agent chose that hour.",
  dayTitle: (date, weekday) =>
    `${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} · ${en.weekdayLong[weekday]}`,
  dayHour: "Walk hour",
  dayReason: "Rule applied",
  dayProb: "Forecast chance of rain",
  dayFtemp: "Forecast temperature",
  dayRain: "Actual rain",
  dayTemp: "Actual temperature",
  dayVerdict: "Verdict",
  dayVersion: "Playbook",
  alsoFlags: "Also counted as:",
  timelineEyebrow: "Dog-walk playbook · version timeline",
  timelineHeadline: (first, current) =>
    first && current && first !== current
      ? `The playbook went from ${first} to ${current}.`
      : `The playbook is at ${current || "—"}.`,
  timelineLede:
    "Every version is a change request the agent proposed and the owner merged. The numbers replay real weather for the same month.",
  versionCurrent: "In use",
  versionRetired: "Retired",
  versionWhy: "Why",
  versionMonth: (month) => `${en.monthName(month)} result`,
  closedTitle: "Proposal not merged",
  judgeChangeTitle: (from, to) => `Judge ${from} → ${to}`,
  retiredReason: "Why retired",
  totalsTitle: (n) => `${n} months combined`,
  totalsCurrent: "Playbook in force",
  noData: "No decisions yet. Ask the agent to replay a month, or wait for today's decision.",
  helpTitle: "Help & settings",
  helpWhatTitle: "What this is",
  helpWhat:
    "An agent decides when to walk the dog each day, and the judge is real weather: did it rain at that hour. This calendar is read-only: the hour each day, the judge's verdict, monthly totals, and how the playbook changed version by version.",
  helpApproveTitle: "Where approval happens",
  helpApprove:
    "The agent can only propose changes to the playbook as change requests. Open the change request in Busabase, read its evidence table, and merge it — that is what makes it count. The judge is read-only to the agent; only the owner edits it.",
  helpDataTitle: "Data",
  helpDataDemo:
    "Demo data: Open-Meteo real weather for Shanghai (31.23, 121.47), June–September 2026, replayed with the playbook in force each month. Never reads or writes Busabase.",
  helpDataLive: (folder, city) => `Busabase folder “${folder}” · city ${city || "—"} · read-only, writes nothing.`,
  helpJudge: (j) =>
    `Judge ${j.version}: rained ≥ ${j.wetMm} mm, too hot ≥ ${j.hotC}°C, owner's hours ${j.ownerHours.join(", ")}${j.guardrails ? `; guardrails: ${j.guardrails.hot} hot, ${j.guardrails.off} off-hours` : "; no guardrails"}.`,
  helpStyleTitle: "Style",
  helpLangTitle: "Language",
  loading: "Loading the dog-walk calendar…",
  errorTitle: "The calendar cannot read its data right now",
  retry: "Try again",
  families: {
    "ink-paper": "Ink & paper",
    "rose-ochre": "Rose & ochre",
    "mauve-plum": "Mauve & plum",
    "coral-amber": "Coral & amber",
    "sage-clay": "Sage & clay",
    "ink-blush": "Ink & blush",
    graphite: "Graphite",
  },
};

/** `?lang=en|zh|zh-CN` wins; otherwise the browser's languages; Chinese is the default. */
export const resolveLanguage = (search = "", languages = []) => {
  const param = String(new URLSearchParams(search).get("lang") || "").toLowerCase();
  if (param) return param.startsWith("zh") ? "zh" : "en";
  const first = String(languages[0] || "").toLowerCase();
  return first && !first.startsWith("zh") ? "en" : "zh";
};

export const messages = { zh, en };
