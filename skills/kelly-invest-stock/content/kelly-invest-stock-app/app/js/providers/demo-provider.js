const record = (id, baseKey, fields) => ({ id, baseKey, fields });

const SNAPSHOT_AT = "2026-08-05 14:31 CST";
const CSI300_RETURN = 0.037;
const stageOverrides = new Map();
const approvalRecords = [];

const strategySeeds = [
  {
    id: "strategy-buffett",
    key: "buffett-quality-value",
    name: "巴菲特式·优质价值",
    family: "价值 / 护城河",
    stage: "L3",
    confidence: 84,
    nav: 1148000,
    cash: 224000,
    drawdown: -0.082,
    thesis: "用合理价格持有现金流稳定、资本回报率高且护城河可解释的企业。",
    selection: "优先品牌、成本或网络优势明确的公司；要求自由现金流可持续，避免依赖短期估值扩张。",
    invalidation: "护城河被削弱、资本配置持续恶化，或盈利质量无法支持长期复利假设。",
    rebalance: "半年",
    positions: [
      ["600519", "贵州茅台", 200, 1420, 1500],
      ["600036", "招商银行", 5000, 36, 40],
      ["601088", "中国神华", 5000, 42, 40],
      ["600900", "长江电力", 8000, 25, 28],
    ],
  },
  {
    id: "strategy-munger",
    key: "munger-great-business",
    name: "查理·芒格式·伟大公司",
    family: "集中 / 商业质量",
    stage: "L2",
    confidence: 80,
    nav: 1105000,
    cash: 10000,
    drawdown: -0.096,
    thesis: "少而精地持有商业模式简单、议价能力强、可长期再投资的伟大公司。",
    selection: "组合保持集中；要求管理层理性、单位经济清晰、长期增长不依赖高杠杆。",
    invalidation: "商业质量判断错误，或买入价格使未来十年回报显著低于基准。",
    rebalance: "年度",
    positions: [
      ["000333", "美的集团", 6000, 68, 75],
      ["603288", "海天味业", 8000, 45, 42],
      ["600276", "恒瑞医药", 6000, 48, 51.5],
    ],
  },
  {
    id: "strategy-duan",
    key: "duan-business-model",
    name: "段永平式·商业模式",
    family: "本分 / 长坡厚雪",
    stage: "L2",
    confidence: 77,
    nav: 1082000,
    cash: 188000,
    drawdown: -0.103,
    thesis: "先看懂生意如何长期赚钱，再用足够安全的价格等待价值兑现。",
    selection: "关注用户价值、竞争格局和企业文化；只纳入能用朴素语言解释盈利来源的公司。",
    invalidation: "核心用户价值下降、竞争优势不可持续，或管理层长期偏离股东价值。",
    rebalance: "半年",
    positions: [
      ["600519", "贵州茅台", 200, 1450, 1500],
      ["601318", "中国平安", 8000, 50, 55],
      ["002027", "分众传媒", 20000, 7.1, 7.7],
    ],
  },
  {
    id: "strategy-lynch",
    key: "lynch-growth-at-price",
    name: "彼得·林奇式·成长合理价",
    family: "成长 / GARP",
    stage: "L1",
    confidence: 72,
    nav: 1056000,
    cash: 211000,
    drawdown: -0.121,
    thesis: "从日常可观察的业务变化中寻找盈利增长尚未被充分定价的公司。",
    selection: "增长必须能落到门店、用户或利润；PEG 与资产负债表共同约束买入价格。",
    invalidation: "增长只剩叙事、利润兑现持续落后，或估值已透支多年正常增长。",
    rebalance: "季度",
    positions: [
      ["603345", "安井食品", 3000, 84, 90],
      ["300033", "同花顺", 1500, 185, 200],
      ["300896", "爱美客", 1000, 290, 275],
    ],
  },
  {
    id: "strategy-marks",
    key: "marks-cycle-contrarian",
    name: "霍华德·马克斯式·周期逆向",
    family: "周期 / 风险控制",
    stage: "L1",
    confidence: 68,
    nav: 1024000,
    cash: 154000,
    drawdown: -0.074,
    thesis: "在市场情绪和风险溢价极端时逆向配置，把避免永久损失放在追逐涨幅之前。",
    selection: "跟踪信用利差、估值分位和市场共识；仓位随赔率而不是情绪变化。",
    invalidation: "周期判断没有估值保护，或下行风险被错误归类为短期波动。",
    rebalance: "月度",
    positions: [
      ["601088", "中国神华", 5000, 38, 40],
      ["601225", "陕西煤业", 10000, 26, 24],
      ["601006", "大秦铁路", 50000, 8.2, 8.6],
    ],
  },
  {
    id: "strategy-fisher",
    key: "fisher-long-growth",
    name: "菲利普·费雪式·长期成长",
    family: "成长 / 深度调研",
    stage: "L3",
    confidence: 75,
    nav: 1079000,
    cash: 149000,
    drawdown: -0.134,
    thesis: "持有研发能力、销售组织和长期成长空间同时优秀的公司，减少无效换手。",
    selection: "验证产品壁垒、研发效率与管理层诚信；增长空间需显著大于当前收入体量。",
    invalidation: "研发投入不能转化为产品优势，或组织能力无法支撑下一阶段增长。",
    rebalance: "半年",
    positions: [
      ["300750", "宁德时代", 2000, 235, 260],
      ["300308", "中际旭创", 1000, 145, 160],
      ["300760", "迈瑞医疗", 1000, 270, 250],
    ],
  },
  {
    id: "strategy-graham",
    key: "graham-margin-safety",
    name: "格雷厄姆式·安全边际",
    family: "深度价值 / 分散",
    stage: "L1",
    confidence: 61,
    nav: 985000,
    cash: 195000,
    drawdown: -0.158,
    thesis: "用可量化的资产与盈利保护构建分散组合，让价格折扣承担主要安全垫。",
    selection: "低估值必须有资产负债表支撑；分散持有，避免把便宜误判为质量。",
    invalidation: "账面价值持续缩水、债务侵蚀安全边际，或价值陷阱比例长期过高。",
    rebalance: "季度",
    positions: [
      ["600104", "上汽集团", 20000, 15, 16],
      ["600019", "宝钢股份", 30000, 7.4, 7],
      ["601668", "中国建筑", 40000, 6.2, 6.5],
    ],
  },
  {
    id: "strategy-lilu",
    key: "lilu-owner-mindset",
    name: "李录式·所有者思维",
    family: "价值 / 长期持有",
    stage: "L1",
    confidence: 79,
    nav: 1123000,
    cash: 148000,
    drawdown: -0.088,
    thesis: "把股票当作企业所有权，在可理解、可预测且资本配置优秀的生意上集中下注。",
    selection: "要求长期竞争优势、保守财务结构和可信管理层；只在明显低于内在价值时建仓。",
    invalidation: "企业经济特征发生结构性变化，或所有者收益长期偏离原始假设。",
    rebalance: "年度",
    positions: [
      ["002594", "比亚迪", 2000, 275, 300],
      ["601658", "邮储银行", 30000, 5.2, 5.5],
      ["600309", "万华化学", 3000, 75, 70],
    ],
  },
  {
    id: "strategy-templeton",
    key: "templeton-global-contrarian",
    name: "约翰·邓普顿式·全球逆向",
    family: "全球价值 / 极度悲观",
    stage: "L1",
    confidence: 66,
    nav: 1037000,
    cash: 187000,
    drawdown: -0.146,
    thesis: "在全球市场的极度悲观区域寻找价格显著低于长期盈利能力的优质企业。",
    selection: "跨市场比较估值、资产负债表与行业情绪；优先选择坏消息已充分反映但生存能力清晰的公司。",
    invalidation: "低估来自永久性竞争衰退，或公司财务结构无法熬过基本面修复周期。",
    rebalance: "季度",
    positions: [
      ["601899", "紫金矿业", 20000, 18, 20],
      ["600690", "海尔智家", 10000, 28, 26],
      ["600887", "伊利股份", 8000, 25, 23.75],
    ],
  },
  {
    id: "strategy-soros",
    key: "soros-reflexive-trend",
    name: "乔治·索罗斯式·反身性趋势",
    family: "趋势 / 预期反馈",
    stage: "L2",
    confidence: 70,
    nav: 1064000,
    cash: 194000,
    drawdown: -0.118,
    thesis: "捕捉基本面与市场预期相互强化的趋势，并在反馈链条反转前主动退出。",
    selection: "要求价格趋势、盈利预期和资金行为同向；仓位随假设验证加减，不把观点当作永久信仰。",
    invalidation: "价格与基本面反馈脱钩、催化被证伪，或趋势反转后仍无法及时减仓。",
    rebalance: "月度",
    positions: [
      ["603019", "中科曙光", 2000, 55, 60],
      ["300059", "东方财富", 10000, 22, 25],
      ["002371", "北方华创", 1000, 460, 500],
    ],
  },
];

const strategyRecords = strategySeeds.map((seed, index) =>
  record(seed.id, "strategies", {
    name: seed.name,
    key: seed.key,
    family: seed.family,
    status: seed.stage,
    thesis: seed.thesis,
    selection_rule: seed.selection,
    invalidation_rule: seed.invalidation,
    rebalance: seed.rebalance,
    benchmark: "沪深300",
    confidence: seed.confidence,
    next_review_at: `2026-08-${String(8 + index).padStart(2, "0")}`,
  }),
);

const accountRecords = strategySeeds.map((seed) =>
  record(`account-${seed.key}`, "ledger-accounts", {
    name: `${seed.name}虚拟账本`,
    strategy_key: seed.key,
    nominal_capital: 1000000,
    nav: seed.nav,
    cash: seed.cash,
    benchmark_return: CSI300_RETURN,
    max_drawdown: seed.drawdown,
    updated_at: SNAPSHOT_AT,
    baseline_date: "2026-07-01",
  }),
);

const positionRecords = strategySeeds.flatMap((seed) =>
  seed.positions.map(([code, name, quantity, entryPrice, latestPrice]) => {
    const marketValue = Number((quantity * latestPrice).toFixed(2));
    return record(`position-${seed.key}-${code.toLowerCase().replaceAll(".", "-")}`, "ledger-positions", {
      name,
      strategy_key: seed.key,
      code,
      quantity,
      entry_price: entryPrice,
      latest_price: latestPrice,
      market_value: marketValue,
      weight: Number((marketValue / seed.nav).toFixed(4)),
      price_source: "固定课堂快照（演示）",
      price_as_of: SNAPSHOT_AT,
    });
  }),
);

const backtestRecords = strategySeeds.map((seed) => {
  const accountReturn = seed.nav / 1000000 - 1;
  const totalReturn = Number((accountReturn * 2.4).toFixed(4));
  const cagr = Number((Math.sqrt(Math.max(0.01, 1 + totalReturn)) - 1).toFixed(4));
  const volatility = Number((Math.abs(seed.drawdown) + 0.12).toFixed(4));
  const method = seed.key === "soros-reflexive-trend" ? "规则信号" : "静态等权（后视⚠️）";
  return record(`backtest-${seed.key}-2026-08-05`, "strategy-backtests", {
    name: `${seed.name} · 2026-08-05`,
    strategy_key: seed.key,
    report_date: "2026-08-05",
    window_start: "2024-08-05",
    window_end: "2026-08-05",
    window_label: "2年日线（前复权）",
    method,
    coverage: method === "规则信号" ? "规则序列" : `${seed.positions.length}/${seed.positions.length}`,
    benchmark: "沪深300",
    total_return: totalReturn,
    cagr,
    volatility,
    sharpe: Number(((cagr - 0.018) / volatility).toFixed(2)),
    max_drawdown: Number((seed.drawdown * 1.35).toFixed(4)),
    benchmark_return: 0.183,
    excess_return: Number((totalReturn - 0.183).toFixed(4)),
    source_note:
      method === "规则信号"
        ? "演示规则序列回测；结果为固定示例，不是实时行情。"
        : "演示静态篮子存在后视偏差，只用于波动与回撤体检，不构成 Alpha 证据。",
  });
});

const reviewRecords = strategySeeds.map((seed, index) =>
  record(`review-${seed.key}-2026-08-05`, "strategy-reviews", {
    name: `${seed.name} · 课堂研究复查`,
    strategy_key: seed.key,
    review_date: `2026-08-05 ${String(14 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "45" : "15"} CST`,
    review_type: "research",
    source_note: "公司公告、定期报告与固定课堂行情快照；仅用于演示研究工作流。",
    source_as_of: "2026-08-05",
    supporting_evidence: `当前虚拟持仓仍能按“${seed.selection}”逐项复查，账户与持仓口径完整。`,
    counter_evidence: seed.invalidation,
    data_freshness: "课堂固定快照 · 已核对",
    snapshot_nav: seed.nav,
    snapshot_benchmark_return: CSI300_RETURN,
    snapshot_max_drawdown: seed.drawdown,
    decision: "继续观察",
    reason: "研究材料用于课堂审批演示，不代表投资建议。",
    reviewer: "Agent 研究员",
  }),
);

const recordsWithOverrides = () => [
  ...strategyRecords.map((strategy) => ({
    ...strategy,
    fields: {
      ...strategy.fields,
      status: stageOverrides.get(strategy.id) || strategy.fields.status,
    },
  })),
  ...accountRecords,
  ...positionRecords,
  ...backtestRecords,
  ...reviewRecords,
  ...approvalRecords,
];

const busabaseFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([slug, value]) => [slug.replaceAll("_", "-"), value]));

export const classroomSeedBatches = () => ({
  strategies: strategyRecords.map((item) => busabaseFields(item.fields)),
  "ledger-accounts": accountRecords.map((item) => busabaseFields(item.fields)),
  "ledger-positions": positionRecords.map((item) => busabaseFields(item.fields)),
  "strategy-backtests": backtestRecords.map((item) => busabaseFields(item.fields)),
  "strategy-reviews": reviewRecords.map((item) => busabaseFields(item.fields)),
});

export const demoProvider = {
  name: "demo",
  async getState() {
    return {
      provider: {
        ok: true,
        name: "demo",
        mode: "deterministic_preview",
        readOnly: true,
        stageWritable: true,
        reviewWritable: true,
        asOf: SNAPSHOT_AT,
      },
      records: recordsWithOverrides(),
      pageInfo: {},
    };
  },
  async updateStrategyStage(recordId, stage, _baseCommitId, approval = {}) {
    const strategy = strategyRecords.find((item) => item.id === recordId);
    if (!strategy) throw new Error("STRATEGY_NOT_FOUND");
    if (!["L1", "L2", "L3"].includes(stage)) throw new Error("INVALID_STAGE");
    const reason = String(approval.reason || "").trim();
    if (reason.length < 8) throw new Error("APPROVAL_REASON_REQUIRED: 请至少写 8 个字的人工理由");
    const reviewIndex = approvalRecords.length;
    approvalRecords.push(
      record(`demo-approval-${recordId}-${reviewIndex + 1}`, "strategy-reviews", {
        name: `${strategy.fields.name} ${approval.fromStage || strategy.fields.status} → ${stage}`,
        strategy_key: strategy.fields.key,
        review_date: `2026-08-05 ${reviewIndex === 0 ? "20:35" : "20:42"} CST`,
        review_type: "approval",
        snapshot_nav: approval.snapshotNav,
        snapshot_benchmark_return: approval.snapshotBenchmarkReturn,
        snapshot_max_drawdown: approval.snapshotMaxDrawdown,
        from_stage: approval.fromStage || strategy.fields.status,
        to_stage: stage,
        decision: "调整成熟度",
        reason,
        reviewer: approval.reviewer || "老板 Kelly",
        change_request_id: `demo-cr-${reviewIndex + 1}`,
      }),
    );
    stageOverrides.set(recordId, stage);
    return { persisted: true, reviewPersisted: true, transient: true };
  },
};
