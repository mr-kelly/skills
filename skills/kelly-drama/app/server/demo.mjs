// Demo mode: deterministic mock data for documentation and screenshots.
// `/api/state?demo=<scene>&lang=en|zh` returns this payload instead of real
// project state. Demo mode never reads or writes anything under app/.data.

const DEMO_UPDATED_AT = "2026-06-30T09:30:00.000Z";

export function isDemoQuery(query = {}) {
  return Boolean(query.demo);
}

export function demoNotice(query = {}) {
  return isZh(query)
    ? "演示模式：只读示例数据，不会写入任何项目文件。"
    : "Demo mode: read-only sample data. Nothing is written to project files.";
}

export function demoImageConfigPayload() {
  return {
    base_url: "https://demo.invalid/v1",
    model: "gpt-image-2",
    size: "1024x1024",
    has_api_key: false,
    api_key_preview: "",
    demo: true,
  };
}

export function demoStatePayload(query = {}) {
  const scenario = String(query.demo || "overview");
  const zh = isZh(query);
  const project = demoProject(zh);
  return {
    demo: true,
    demo_scenario: scenario,
    app: "kelly-drama",
    project,
    projects: [{
      id: project.project_id,
      title: project.series.title,
      genre: project.series.genre,
      format: project.series.format,
    }],
    active_project_id: project.project_id,
    paths: {
      project_path: "demo://kelly-drama/project.json",
      tasks_path: "demo://kelly-drama/agent_tasks.json",
      report_path: "demo://kelly-drama/execution_report.json",
    },
    counts: {
      characters: countBy(project.characters),
      episodes: countBy(project.episodes),
      shots: countBy(project.shots),
      tasks: countBy(project.tasks),
    },
    totals: {
      characters: project.characters.length,
      relationships: project.relationships.length,
      episodes: project.episodes.length,
      shots: project.shots.length,
      tasks: project.tasks.length,
    },
    completeness: completeness(project),
    attention: attention(project),
    lock: { locked: false },
  };
}

// Synthetic placeholder assets served under /generated/demo/*. Everything is
// generated in memory — no project image files are ever referenced.
export function demoAsset(pathname) {
  const name = String(pathname || "").replace(/^\/generated\/demo\//, "");
  if (!name || name.includes("/") || name.includes("..")) return null;
  if (name.endsWith(".svg")) {
    return { type: "image/svg+xml", body: Buffer.from(placeholderSvg(name.replace(/\.svg$/, ""))) };
  }
  return null;
}

function isZh(query = {}) {
  return String(query.lang || "").toLowerCase().startsWith("zh");
}

function hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100000;
  return hash;
}

function placeholderSvg(label) {
  const hue = hashCode(label) % 360;
  const text = label.replace(/[-_]+/g, " ").toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="hsl(${hue}, 32%, 24%)"/>
  <rect x="24" y="24" width="1232" height="672" fill="none" stroke="hsl(${hue}, 40%, 62%)" stroke-width="4" stroke-dasharray="18 14"/>
  <text x="640" y="345" text-anchor="middle" font-family="system-ui, sans-serif" font-size="56" fill="hsl(${hue}, 45%, 86%)">${text}</text>
  <text x="640" y="415" text-anchor="middle" font-family="system-ui, sans-serif" font-size="30" fill="hsl(${hue}, 30%, 68%)">DEMO PLACEHOLDER</text>
</svg>`;
}

function countBy(items, field = "status") {
  const counts = {};
  for (const item of items || []) {
    const key = item?.[field] || "draft";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function completeness(project) {
  return {
    characters_missing_views: project.characters.filter((c) => {
      const v = c.visual || {};
      return !v.front || !v.side || !v.back;
    }).length,
    relationships_missing_evidence: project.relationships.filter((r) => !(r.evidence || []).length).length,
    episodes_missing_cliffhanger: project.episodes.filter((e) => !e.cliffhanger).length,
    shots_missing_prompt: project.shots.filter((s) => !s.prompt || !s.negative_prompt).length,
  };
}

function attention(project) {
  const all = [...project.tasks, ...project.characters, ...project.episodes, ...project.shots];
  return {
    needs_review: all.filter((item) => ["needs_review", "changes_requested"].includes(item.status)).length,
    approved: all.filter((item) => item.status === "approved").length,
    blocked: project.tasks.filter((task) => task.status === "blocked").length,
  };
}

function demoProject(zh) {
  const L = (en, zhText) => (zh ? zhText : en);
  const series = {
    title: L("Walking Against the Light", "逆光而行"),
    genre: L("revenge romance / urban vertical drama", "都市复仇情感 / 竖屏短剧"),
    platform: L("vertical mobile 9:16", "竖屏手机 9:16"),
    format: L("12 episodes × 2 minutes", "12 集 × 每集 2 分钟"),
    tone: L("Taut, glossy, emotionally loaded; every episode ends on a hook.", "紧凑、精致、情绪浓烈；每集结尾必留钩子。"),
    audience: L("Short-drama viewers who love substitute-bride revenge arcs.", "喜欢替嫁复仇线的短剧观众。"),
    logline: L(
      "Forced to marry in her half-sister's place, a disinherited heiress uses the contract marriage to dismantle the family that erased her mother.",
      "被逼替姐出嫁的落魄千金，借一纸契约婚姻，一步步扳倒当年抹去她母亲的整个家族。"
    ),
    hook_rules: [
      L("Open every episode inside a conflict already in motion.", "每集开场必须已经身处冲突之中。"),
      L("A secret is revealed or a debt is called in every episode.", "每集必须揭开一个秘密或收回一笔旧账。"),
      L("End on a reversal the audience can quote in one line.", "结尾反转要能用一句话转述。"),
    ],
    world_rules: [
      L("The Lin family fortune legally belongs to Lin Wan's late mother.", "林家财产在法律上属于林晚已故的母亲。"),
      L("Gu Chenzhou never breaks a signed contract.", "顾沉舟从不违背签过字的契约。"),
      L("Every scheme leaves a paper trail somebody keeps.", "每一个阴谋都会留下有人保存的字据。"),
    ],
    visual_bible: {
      format_note: L(
        "Vertical 9:16 with tight singles and over-the-shoulder frames built for phone screens.",
        "竖屏 9:16，以适配手机的近景单人镜头与过肩镜头为主。"
      ),
      realism_target: L(
        "Live-action premium feel: real skin texture, practical lighting, city-night palette of amber and steel blue.",
        "真人实拍质感：真实皮肤纹理、实用光源、琥珀与钢蓝的城市夜色调。"
      ),
      color_palette: L("amber / steel blue / porcelain white", "琥珀 / 钢蓝 / 瓷白"),
      background_reference_assets: [
        { title: L("Lin family mansion hall", "林家老宅大厅"), path: "/generated/demo/bible-mansion-hall.svg" },
        { title: L("Harbor-view CEO office", "临港总裁办公室"), path: "/generated/demo/bible-ceo-office.svg" },
      ],
    },
  };

  const characters = [
    character("char-lin-wan", L("Lin Wan", "林晚"), L("protagonist / substitute bride", "女主 / 替嫁新娘"), "approved", {
      identity: L("Disinherited eldest daughter, works as a restoration artist.", "被除名的林家长女，职业是文物修复师。"),
      motivation: L("Reclaim her mother's name and the estate stolen from her.", "夺回母亲的名誉和被侵吞的遗产。"),
      wound: L("Watched her mother signed out of the family ledger at twelve.", "十二岁那年亲眼看着母亲被从家族账册中除名。"),
      secret: L("She holds the original will her father thinks was burned.", "她手里有父亲以为已烧毁的遗嘱原件。"),
      arc: L("From invisible substitute to the one holding every contract.", "从无人在意的替身，到握住所有契约的人。"),
      voice: L("Quiet, precise, devastating when she finally raises her voice.", "安静、精准，一旦提高声音便一击致命。"),
    }, {
      front: L("Slender, porcelain complexion, collarbone-length black hair, wine-red lips.", "身形清瘦，肤色冷白，锁骨黑发，酒红唇色。"),
      side: L("Straight nose bridge, small jade earring, always upright posture.", "鼻梁挺直，佩小玉耳钉，站姿始终笔直。"),
      back: L("Thin scar behind the left shoulder, hair usually half tied.", "左肩后有细疤，头发常半束。"),
      wardrobe: L("Ivory silk blouse, tailored black trousers, her mother's jade bracelet.", "米白真丝衬衫、黑色西裤、母亲留下的玉镯。"),
      anchors: [L("jade bracelet never leaves her wrist", "玉镯从不离腕"), L("wine-red lips in every scene", "每场戏都是酒红唇色")],
      forbidden_drift: [L("no heavy jewelry", "不佩戴夸张首饰"), L("never in pastel colors", "不穿马卡龙色")],
    }, "/generated/demo/char-lin-wan.svg", {
      type: L("warm mezzo, low and steady", "低而稳的暖中音"),
      pace: L("measured, deliberate pauses", "语速克制，停顿有意"),
      accent: L("neutral Mandarin", "标准普通话"),
      signature: L("drops to a whisper before the counterattack", "反击前先降为耳语"),
    }),
    character("char-gu-chenzhou", L("Gu Chenzhou", "顾沉舟"), L("male lead / cold-blooded CEO", "男主 / 冷面总裁"), "approved", {
      identity: L("Chairman of Chenzhou Capital, the Lin family's largest creditor.", "沉舟资本董事长，林家最大的债主。"),
      motivation: L("Repay a debt he owes to Lin Wan's mother from twenty years ago.", "偿还二十年前欠林晚母亲的一份恩情。"),
      wound: L("His own family was ruined by the same ledger trick.", "自家当年也毁于同一套账册把戏。"),
      secret: L("He engineered the substitute marriage on purpose.", "替嫁婚事本就是他一手促成。"),
      arc: L("From creditor with a plan to partner who risks the plan for her.", "从按计划行事的债主，到为她赌上计划的同盟。"),
      voice: L("Clipped sentences, zero small talk, dry humor at knife's edge.", "句子极短，从不寒暄，刀锋边缘的冷幽默。"),
    }, {
      front: L("Tall, sharp jawline, rimless glasses, charcoal three-piece suit.", "身材高大，下颌线利落，无框眼镜，炭灰三件套西装。"),
      side: L("Faint scar through right eyebrow, mechanical watch on left wrist.", "右眉有淡疤，左腕戴机械表。"),
      back: L("Broad shoulders, coat always draped, never worn through the sleeves.", "肩宽背直，大衣永远披着从不穿袖。"),
      wardrobe: L("Charcoal suits, black overcoat, vintage mechanical watch.", "炭灰西装、黑色大衣、古董机械表。"),
      anchors: [L("rimless glasses", "无框眼镜"), L("mechanical watch on left wrist", "左腕机械表")],
      forbidden_drift: [L("no casual wear before episode 10", "第 10 集前不穿便装")],
    }, "/generated/demo/char-gu-chenzhou.svg", {
      type: L("low baritone", "低沉男中音"),
      pace: L("slow, weighted", "缓慢有分量"),
      accent: L("neutral Mandarin", "标准普通话"),
      signature: L("one-beat pause before verdicts", "宣判式台词前停一拍"),
    }),
    character("char-su-man", L("Su Man", "苏曼"), L("antagonist / scheming half-sister", "反派 / 心机继姐"), "needs_review", {
      identity: L("The favored daughter who fled the wedding and kept the dowry.", "逃婚却私吞聘礼的受宠继女。"),
      motivation: L("Keep the inheritance and marry into the Zhao family instead.", "保住继承权，转而嫁入赵家。"),
      wound: L("Knows she was only ever loved as the 'better' daughter.", "深知自己被爱只因是'更好'的那个女儿。"),
      secret: L("She forged the signature that erased Lin Wan's mother.", "抹去林晚母亲的签名是她伪造的。"),
      arc: L("Every cover-up costs her one ally until none remain.", "每一次遮掩都失去一个盟友，直到众叛亲离。"),
      voice: L("Sweet in public, glass-sharp in private.", "人前甜腻，人后如碎玻璃般尖利。"),
    }, {
      front: L("Soft curls, peach makeup, designer dresses a size too loud.", "柔软卷发，蜜桃系妆容，用力过猛的名牌裙装。"),
      side: L("Diamond ear studs, phone always in hand.", "钻石耳钉，手机不离手。"),
      back: "",
      wardrobe: L("Pastel designer dresses, oversized sunglasses.", "马卡龙色名牌裙、超大墨镜。"),
      anchors: [L("diamond ear studs", "钻石耳钉")],
      forbidden_drift: [],
    }, "", null),
    character("char-lin-guodong", L("Lin Guodong", "林国栋"), L("patriarch / compromised father", "家主 / 妥协的父亲"), "approved", {
      identity: L("Head of the Lin family, publicly respectable, privately in debt.", "林家家主，人前体面，人后负债。"),
      motivation: L("Protect the family name at any daughter's expense.", "不惜牺牲任何一个女儿也要保全家族名声。"),
      wound: L("He signed the erasure himself and has never slept well since.", "除名文件是他亲手签的，从此夜不能寐。"),
      secret: L("The company has been insolvent for three years.", "公司实际已资不抵债三年。"),
      arc: L("From untouchable patriarch to the man begging his erased daughter.", "从高高在上的家主，到向被除名的女儿低头的人。"),
      voice: L("Booming in the boardroom, hollow at home.", "会议室里声如洪钟，家里空洞无力。"),
    }, {
      front: L("Silver temples, heavy brows, tailored grey suits.", "两鬓斑白，浓眉，灰色定制西装。"),
      side: L("Jade thumb ring, reading glasses on a chain.", "玉扳指，挂链老花镜。"),
      back: L("Slight stoop he hides in public.", "人前刻意掩饰的微驼背。"),
      wardrobe: L("Grey suits, jade thumb ring.", "灰西装、玉扳指。"),
      anchors: [L("jade thumb ring", "玉扳指")],
      forbidden_drift: [],
    }, "", null),
    character("char-qin-yue", L("Qin Yue", "秦悦"), L("ally / lawyer best friend", "盟友 / 律师闺蜜"), "draft", {
      identity: L("Corporate lawyer, Lin Wan's only friend from art school.", "公司法律师，林晚美院时代唯一的朋友。"),
      motivation: L("Win the one case her firm refused to touch.", "打赢事务所拒接的那一桩案子。"),
      wound: "",
      secret: "",
      arc: L("From cautious counsel to the one who files the suit.", "从谨慎的顾问，到亲手递交诉状的人。"),
      voice: L("Fast, funny, allergic to euphemism.", "语速快、毒舌、讨厌拐弯抹角。"),
    }, {
      front: L("Short bob, red-framed glasses, trench coat.", "齐颚短发，红框眼镜，风衣。"),
      side: "",
      back: "",
      wardrobe: L("Trench coat, document bag.", "风衣、公文包。"),
      anchors: [],
      forbidden_drift: [],
    }, "", null),
    character("char-shen-huilan", L("Shen Huilan", "沈慧兰"), L("the erased mother (flashbacks)", "被抹去的母亲（闪回）"), "approved", {
      identity: L("Founder of the original Lin workshop, died 'in debt' — on paper.", "林家工坊真正的创始人，账面上'负债而终'。"),
      motivation: L("In flashbacks: keep the workshop and her daughter together.", "闪回中：守住工坊，也守住女儿。"),
      wound: "",
      secret: L("Registered the trademark under Lin Wan's name before she died.", "临终前把商标注册在了林晚名下。"),
      arc: L("Her handwriting resurfaces episode by episode until it convicts.", "她的笔迹逐集重现，直到成为定罪的证据。"),
      voice: L("Warm, unhurried; heard mostly in voice-over.", "温暖从容，多以画外音出现。"),
    }, {
      front: L("Qipao-era elegance, hair in a low bun, ink-stained fingertips.", "旗袍式端庄，低发髻，指尖常沾墨渍。"),
      side: L("Same jade bracelet Lin Wan now wears.", "戴着林晚如今那只玉镯。"),
      back: "",
      wardrobe: L("Muted qipao, workshop apron.", "素色旗袍、工坊围裙。"),
      anchors: [L("jade bracelet", "玉镯")],
      forbidden_drift: [],
    }, "", null),
    character("char-zhao-ming", L("Zhao Ming", "赵铭"), L("rival investor / Su Man's fiancé", "对手投资人 / 苏曼未婚夫"), "needs_review", {
      identity: L("Second-generation money hunting the Lin family's land deeds.", "盯上林家地契的富二代资本玩家。"),
      motivation: L("Swallow the Lin estate before Gu Chenzhou does.", "抢在顾沉舟之前吞下林家资产。"),
      wound: "",
      secret: L("His fund's audit is faked — and Qin Yue has noticed.", "他基金的审计造假——已被秦悦察觉。"),
      arc: L("Overplays every hand until the fake audit surfaces.", "步步冒进，直到假审计曝光。"),
      voice: L("Loud charm, toasts everyone, trusts no one.", "热络张扬，逢人敬酒，无人可信。"),
    }, {
      front: L("Slicked hair, tan, unbuttoned collar, gold lighter.", "油头，古铜肤色，敞领衬衫，金色打火机。"),
      side: "",
      back: "",
      wardrobe: L("Flashy suits, gold lighter.", "浮夸西装、金打火机。"),
      anchors: [L("gold lighter", "金打火机")],
      forbidden_drift: [],
    }, "", null),
  ];

  const relationships = [
    relationship("rel-linwan-guchenzhou", "char-lin-wan", "char-gu-chenzhou", L("contract spouses", "契约夫妻"),
      L("A model business marriage in front of the cameras.", "镜头前的模范商业联姻。"),
      L("He chose her, not the sister the family offered.", "他要娶的本来就是她，而不是家族推出来的姐姐。"),
      L("He holds the debt; she holds the will — the leverage keeps flipping.", "他握着债权，她握着遗嘱，主动权不断易手。"),
      L("simmering", "暗流升温"),
      L("Neither will admit the contract stopped being the point.", "谁都不肯承认这段婚姻早已不只是契约。"),
      [L("Ep 1: he corrects the officiant — 'the name is Lin Wan.'", "第1集：他纠正司仪——'新娘的名字是林晚。'"), L("Ep 3: he keeps her mother's photo in his safe.", "第3集：他的保险柜里存着她母亲的照片。")]),
    relationship("rel-linwan-suman", "char-lin-wan", "char-su-man", L("half-sisters, blood rivals", "同父异母的宿敌姐妹"),
      L("Polite sisters at every family banquet.", "家宴上客客气气的好姐妹。"),
      L("Su Man forged the signature that destroyed Lin Wan's mother.", "毁掉林晚母亲的伪造签名出自苏曼之手。"),
      L("Su Man holds the family's favor; Lin Wan holds the paper trail.", "苏曼占着宠爱，林晚握着字据。"),
      L("ice cold", "冰点"),
      L("The dowry Su Man kept is the first debt Lin Wan calls in.", "苏曼私吞的聘礼，是林晚讨回的第一笔账。"),
      [L("Ep 2: the dowry transfer record surfaces.", "第2集：聘礼转账记录曝光。")]),
    relationship("rel-linwan-linguodong", "char-lin-wan", "char-lin-guodong", L("estranged father and daughter", "决裂的父女"),
      L("A father who 'generously' took the disgraced daughter back in.", "'宽宏大量'收留落魄女儿的父亲。"),
      L("He signed her mother's erasure with his own hand.", "当年的除名文件是他亲手签署。"),
      L("He thinks he grants mercy; she is auditing his ledger.", "他自以为在施舍，她其实在查他的账。"),
      L("frozen politeness", "冷淡客套"),
      L("The insolvent company needs the trademark registered in her name.", "资不抵债的公司离不开注册在她名下的商标。"),
      [L("Ep 5: the ledger shows three years of losses.", "第5集：账本显示连亏三年。")]),
    relationship("rel-suman-zhaoming", "char-su-man", "char-zhao-ming", L("engaged co-conspirators", "同谋未婚夫妻"),
      L("The season's most photographed engagement.", "本季曝光度最高的订婚。"),
      L("Each plans to discard the other after the estate transfers.", "两人都打算在资产到手后甩掉对方。"),
      L("His money against her inside access — neither trusts the split.", "他出钱、她递内线，分赃方案彼此都不信。"),
      L("performative warmth", "表演式甜蜜"),
      L("The fake audit could sink them both.", "一份假审计足以拖垮两人。"),
      [L("Ep 8: Zhao Ming's transfer to Su Man bounces.", "第8集：赵铭给苏曼的转账被退回。")]),
    relationship("rel-guchenzhou-zhaoming", "char-gu-chenzhou", "char-zhao-ming", L("rival bidders", "竞购对手"),
      L("Cordial rivals who toast at the same banquets.", "同席碰杯的体面对手。"),
      L("Gu leaked the land-deed rumor to bait Zhao into overreach.", "地契传闻是顾沉舟放出的饵，引赵铭冒进。"),
      L("Gu sets the board; Zhao keeps volunteering to be a piece.", "顾沉舟布局，赵铭抢着当棋子。"),
      L("predatory calm", "捕猎般的平静"),
      L("Both bid for the Lin estate — only one bid is real.", "两人同时竞购林家资产——只有一方是真出价。"),
      [L("Ep 7: Gu withdraws his bid at the exact ceiling Zhao can't afford.", "第7集：顾沉舟在赵铭承受极限处撤价。")]),
    relationship("rel-qinyue-linwan", "char-qin-yue", "char-lin-wan", L("best friends, counsel and client", "闺蜜兼律师与委托人"),
      L("College best friends who meet for noodles every Friday.", "每周五约面馆的大学闺蜜。"),
      L("Qin Yue's firm quietly represents the Lin family too.", "秦悦的事务所同时悄悄代理着林家。"),
      L("Lin Wan brings the evidence; Qin Yue decides what survives in court.", "林晚提供证据，秦悦决定哪些能上法庭。"),
      L("fiercely loyal", "过命交情"),
      L("Taking the case means Qin Yue burns her career bridge.", "接下这案子，秦悦等于烧掉自己的职业后路。"),
      [L("Ep 6: Qin Yue resigns with the case files in her bag.", "第6集：秦悦带着案卷辞职。")]),
  ];

  const episodes = [
    episode(1, "ep-001", L("The Substitute Bride", "替嫁"), "approved",
      L("Su Man flees the wedding; the Lin family shoves Lin Wan into the dress, but at the altar Gu Chenzhou reads out the name he actually wrote into the contract: Lin Wan.", "苏曼临阵逃婚，林家把婚纱塞给林晚顶替；礼堂上顾沉舟却念出契约里本来写着的名字——林晚。"),
      L("A substitute bride discovers the groom asked for her by name.", "替嫁的新娘发现，新郎点名要的就是她。"),
      L("Signing the register, Gu Chenzhou whispers: 'Your mother sent me.'", "签字时顾沉舟低声说：'是你母亲让我来的。'"),
      [
        beat("b-001-1", L("Cold open: the dress", "冷开场：婚纱"), L("Lin Wan is zipped into a stranger's wedding dress mid-argument.", "争吵声中，林晚被强行套上不属于她的婚纱。"), L("Family vs. Lin Wan: no consent, no time.", "家族逼迫 vs 林晚：没有同意，也没有时间。")),
        beat("b-001-2", L("The altar swap", "礼堂换人"), L("Guests whisper as the veil lifts on the wrong sister.", "头纱掀起，来宾哗然——新娘换了人。"), L("Public humiliation flips into public leverage.", "公开羞辱瞬间变成公开筹码。")),
        beat("b-001-3", L("The name in the contract", "契约上的名字"), L("Gu Chenzhou corrects the officiant without raising his voice.", "顾沉舟没有提高音量，只纠正了司仪一个名字。"), L("The family's plan was never their plan.", "家族的算计从头到尾不在他的剧本里。")),
      ]),
    episode(2, "ep-002", L("A Paper Marriage", "一纸契约"), "approved",
      L("The newlyweds negotiate house rules like a merger; Lin Wan trades obedience clauses for one thing — access to the family archive.", "新婚夫妻像谈并购一样谈家规；林晚用'听话条款'只换一样东西——进入家族档案室的权限。"),
      L("The marriage contract becomes her first weapon.", "婚姻契约成了她的第一件武器。"),
      L("In the archive she finds her mother's ledger page — torn out.", "档案室里，母亲那页账册——被撕掉了。"),
      []),
    episode(3, "ep-003", L("The Old Photograph", "旧照重现"), "approved",
      L("A photo in Gu Chenzhou's safe shows his father and Shen Huilan outside the original workshop; Lin Wan realizes the debt runs the other way.", "顾沉舟保险柜里的旧照拍着他父亲与沈慧兰站在老工坊门口；林晚意识到，欠债的另有其人。"),
      L("The creditor turns out to be the debtor.", "债主原来才是欠债的人。"),
      L("Su Man photographs them leaving the archive together.", "苏曼拍下两人一同走出档案室的照片。"),
      []),
    episode(4, "ep-004", L("Banquet Ambush", "宴会风波"), "needs_review",
      L("At the family banquet Su Man plays the leaked photo as a scandal; Lin Wan answers by returning the dowry — publicly, to the cent.", "家宴上苏曼用照片做局造谣；林晚当众连本带息退还聘礼，一分不差。"),
      L("A trap sprung in public is repaid in public.", "当众设局，就当众还击。"),
      L("The transfer slip shows the dowry account was Su Man's private card.", "转账单显示聘礼收款账户是苏曼的私人卡。"),
      []),
    episode(5, "ep-005", L("The Ledger", "账本疑云"), "needs_review",
      L("Qin Yue traces three years of fake profits; Lin Guodong quietly asks his erased daughter for a loan.", "秦悦追出连续三年的假利润；林国栋放下身段，向被他除名的女儿开口借钱。"),
      L("The empire is a shell — and the shell needs her.", "帝国只剩空壳，而空壳离不开她。"),
      L("The trademark the company lives on is registered to Lin Wan.", "公司赖以生存的商标，注册人是林晚。"),
      []),
    episode(6, "ep-006", L("Mother's File", "母亲的病历"), "needs_review",
      L("The hospital file shows Shen Huilan's final signature was made two days after her death — the forgery has a date.", "病历显示沈慧兰的'最后签名'落款在她去世两天后——伪造有了时间戳。"),
      L("The forgery finally has a fingerprint.", "伪造终于露出指纹。"),
      L("Qin Yue resigns from her firm with the case files in her bag.", "秦悦带着案卷从事务所辞职。"),
      []),
    episode(7, "ep-007", L("Turning the Tables", "反将一军"), "draft",
      L("Gu Chenzhou floats a fake bid ceiling; Zhao Ming leverages everything to beat it and mortgages Su Man's dowry to do so.", "顾沉舟放出假竞价上限；赵铭加满杠杆迎战，甚至抵押了苏曼的聘礼。"),
      L("The rival digs his own hole with borrowed money.", "对手用借来的钱给自己挖坑。"),
      L("Gu withdraws the bid at the exact number Zhao cannot pay.", "顾沉舟在赵铭付不起的那个数字上撤了价。"),
      []),
    episode(8, "ep-008", L("The Alliance Cracks", "联盟破裂"), "draft",
      L("Zhao Ming's transfer to Su Man bounces; each starts shredding documents that incriminate the other.", "赵铭给苏曼的转账被退回；两人开始互相销毁能咬死对方的文件。"),
      L("Thieves audit each other first.", "分赃不均，先查的是同伙。"),
      L("Su Man mails the forged-signature original — to protect herself.", "苏曼为自保寄出了伪造签名的原件。"),
      []),
    episode(9, "ep-009", L("Unmasked", "身份揭穿"), "draft",
      L("The mailed original lands with Qin Yue; Lin Guodong learns his 'obedient' daughter has been building a case for eight episodes.", "原件寄到了秦悦手上；林国栋这才发现'听话'的女儿已经收集了八集的证据。"),
      L("The quiet daughter was the auditor all along.", "最安静的女儿才是查账的人。"),
      L("Lin Wan calls a shareholders' meeting in her mother's name.", "林晚以母亲之名召开股东会。"),
      []),
    episode(10, "ep-010", L("Proxy War", "股权之战"), "draft",
      L("At the shareholders' meeting, Gu Chenzhou converts debt to shares and hands the votes to Lin Wan.", "股东会上顾沉舟债转股，将投票权全部交给林晚。"),
      L("The creditor spends his leverage on her side of the table.", "债主把全部筹码押在她那一侧。"),
      L("Lin Guodong votes with his daughter — against Su Man.", "林国栋投了女儿一票——反对苏曼。"),
      []),
    episode(11, "ep-011", L("The Last Testimony", "最后的证词"), "draft",
      L("In court the forged date, the bounced transfer, and the fake audit converge; Su Man's own protection letter convicts her.", "庭审上伪造日期、退回转账与假审计三线汇合；苏曼寄出的自保信成了定罪证据。"),
      L("Every cover-up testifies for the prosecution.", "每一次遮掩都成了控方证词。"),
      L("The verdict names Shen Huilan the workshop's rightful founder.", "判决书认定沈慧兰才是工坊的合法创始人。"),
      []),
    episode(12, "ep-012", L("Into the Light", "逆光而行"), "draft",
      L("Lin Wan reopens the workshop under her mother's name; Gu Chenzhou brings a new contract — one page, no clauses, just a question.", "林晚以母亲之名重开工坊；顾沉舟带来一份新契约——只有一页，没有条款，只有一个问题。"),
      L("The revenge ends; the choice begins.", "复仇结束，选择开始。"),
      "",
      []),
  ];

  const shots = [
    shot("shot-001-01", "ep-001", "b-001-1", L("The zipper", "拉链"), "approved", 6,
      L("Extreme close-up: a zipper drags up the back of a borrowed wedding dress, fabric straining.", "大特写：借来的婚纱背后拉链被强行拉起，布料紧绷。"),
      L("extreme close-up", "大特写"), L("slow push-in", "缓慢推近"),
      L("Lin family dressing room, morning", "林家更衣室，清晨"), L("hard window light, cold", "冷硬窗光"),
      L("Hands force the zipper; Lin Wan's breath catches; the jade bracelet knocks against the mirror.", "有人强行拉上拉链；林晚呼吸一滞；玉镯磕在镜面上。"),
      "/generated/demo/shot-001-01.svg"),
    shot("shot-001-02", "ep-001", "b-001-1", L("Mirror argument", "镜中争执"), "approved", 8,
      L("Over-the-shoulder into the mirror: three family members argue behind Lin Wan's still face.", "过肩镜头拍镜面：林晚面无表情，身后三个家人争执不休。"),
      L("medium close-up", "中近景"), L("locked off", "固定机位"),
      L("Lin family dressing room, morning", "林家更衣室，清晨"), L("mixed practicals, mirror bounce", "混合实用光，镜面反射"),
      L("The argument peaks; Lin Wan slowly puts on the veil herself, silencing the room.", "争吵到顶点；林晚自己缓缓戴上头纱，全场安静。"),
      "/generated/demo/shot-001-02.svg"),
    shot("shot-001-03", "ep-001", "b-001-2", L("Veil lift", "掀纱"), "approved", 8,
      L("Low angle from the aisle: the veil lifts, guests' phones rise in the background bokeh.", "红毯低机位：头纱掀起，背景虚化中来宾手机纷纷举起。"),
      L("close-up", "特写"), L("slow tilt up", "缓慢上摇"),
      L("Hotel wedding hall, noon", "酒店礼堂，正午"), L("warm key from chandeliers", "枝形吊灯暖主光"),
      L("The veil rises; a beat of collective silence, then a wave of whispers.", "头纱升起；片刻死寂，随后耳语如潮。"),
      "/generated/demo/shot-001-03.svg"),
    shot("shot-001-04", "ep-001", "b-001-3", L("The correction", "纠正"), "approved", 5,
      L("Tight two-shot at the altar: Gu Chenzhou leans toward the officiant's microphone.", "礼台紧凑双人镜头：顾沉舟俯身靠近司仪话筒。"),
      L("two-shot", "双人镜头"), L("none", "无运动"),
      L("Hotel wedding hall, noon", "酒店礼堂，正午"), L("spotlight, cool rim", "追光加冷轮廓光"),
      L("He corrects one word — the bride's name — and steps back as if nothing happened.", "他只纠正了一个词——新娘的名字——随后若无其事退回原位。"),
      "/generated/demo/shot-001-04.svg",
      {
        srt: [
          { time: "00:00:01,000 --> 00:00:03,400", text: L("Gu Chenzhou: The name is Lin Wan.", "顾沉舟：新娘的名字，是林晚。") },
        ],
        audio: {
          dialogue: [{ speaker: L("Gu Chenzhou", "顾沉舟"), tone: L("flat, final", "平静而不容置疑"), line: L("The name is Lin Wan.", "新娘的名字，是林晚。") }],
          ambient: L("hall murmur dies down", "礼堂私语渐息"),
          music: L("strings hold a suspended chord", "弦乐悬停和弦"),
          sfx: [L("microphone feedback tick", "话筒轻微啸叫")],
        },
      }),
    shot("shot-001-05", "ep-001", "b-001-3", L("Signature", "签字"), "needs_review", 6,
      L("Insert: pen signs 'Lin Wan' on the register; the jade bracelet rests beside the line.", "插入镜头：钢笔在登记册上签下'林晚'，玉镯正搁在签名栏旁。"),
      L("insert", "插入特写"), L("rack focus to bracelet", "焦点移向玉镯"),
      L("Registry table, wedding hall", "礼堂登记台"), L("soft top light", "柔和顶光"),
      L("The pen pauses over the surname, then commits; a whispered line lands off-screen.", "笔尖在姓氏上停顿，随后落笔；画外传来一句耳语。"),
      "/generated/demo/shot-001-05.svg"),
    shot("shot-001-06", "ep-001", "b-001-3", L("Cliffhanger look", "结尾对视"), "draft", 4,
      L("Split-lit close-up: Lin Wan turns, half her face in shadow, eyes fixed past camera.", "阴阳光特写：林晚转头，半张脸没入阴影，目光越过镜头。"),
      L("close-up", "特写"), L("slow push-in", "缓慢推近"),
      L("Wedding hall exit", "礼堂出口"), L("split key, amber vs steel blue", "琥珀与钢蓝的阴阳光"),
      L("Her expression shifts from shock to calculation as the episode cuts to black.", "她的神情从震惊转为盘算，画面切黑。"),
      ""),
    shot("shot-002-01", "ep-002", "", L("Terms across the table", "隔桌谈判"), "approved", 10,
      L("Wide symmetrical frame: the newlyweds at opposite ends of a twelve-seat dining table, one contract between them.", "对称大全景：新婚夫妻分坐十二人长桌两端，中间只有一份契约。"),
      L("wide shot", "大全景"), L("slow dolly right", "缓慢右移"),
      L("Gu residence dining room, night", "顾宅餐厅，夜"), L("single pendant lamp, pools of dark", "单吊灯，四周暗部"),
      L("Pages slide down the table like a chess move; each clause is initialed without a word.", "契约像棋子般沿长桌推过去；每一条款无言签署。"),
      "/generated/demo/shot-002-01.svg"),
    shot("shot-002-02", "ep-002", "", L("One condition", "唯一条件"), "approved", 5,
      L("Close-up on Lin Wan's hand crossing out a clause and writing one word: archive.", "特写：林晚划掉一条条款，写下两个字：档案。"),
      L("insert", "插入特写"), L("locked off", "固定机位"),
      L("Gu residence dining room, night", "顾宅餐厅，夜"), L("pendant key, warm", "吊灯暖主光"),
      L("The pen strikes through obedience; the replacement word is short and non-negotiable.", "笔尖划掉'服从'，替换的词很短，且没有商量余地。"),
      "/generated/demo/shot-002-02.svg"),
    shot("shot-002-03", "ep-002", "", L("Archive door", "档案室之门"), "needs_review", 8,
      L("Tracking shot behind Lin Wan as a brass-and-oak archive door swings open into darkness.", "跟拍林晚背影：铜饰橡木档案门缓缓打开，门内一片深暗。"),
      L("medium shot", "中景"), L("steadicam follow", "斯坦尼康跟随"),
      L("Lin family archive corridor", "林家档案室走廊"), L("practical sconces, deep shadow", "壁灯实用光，深阴影"),
      L("Dust drifts in the doorway light; she steps in without hesitation.", "门口光柱里尘埃浮动；她毫不迟疑地走进去。"),
      ""),
    shot("shot-002-04", "ep-002", "", L("Torn page", "撕去的一页"), "draft", 6,
      L("Overhead insert: fingers find the ledger year 2008 — the page is a torn stub.", "俯拍插入：手指翻到账册 2008 年——那一页只剩撕痕。"),
      L("overhead insert", "俯拍特写"), L("slow push-in", "缓慢推近"),
      L("Lin family archive, night", "林家档案室，夜"), L("flashlight beam only", "仅手电光"),
      L("Her fingertip traces the torn edge; somewhere behind her, a floorboard creaks.", "指尖抚过撕痕；身后某处地板轻响。"),
      ""),
    shot("shot-003-01", "ep-003", "", L("The safe", "保险柜"), "approved", 8,
      L("Medium shot: Gu Chenzhou opens a wall safe; inside, one photograph faces outward.", "中景：顾沉舟打开墙内保险柜，唯一一张照片正面朝外。"),
      L("medium shot", "中景"), L("slow arc left", "缓慢左弧移"),
      L("Gu's study, night", "顾沉舟书房，夜"), L("desk lamp, cool moonlight fill", "台灯加冷月光补光"),
      L("He hesitates, then hands her the photo instead of hiding it.", "他犹豫片刻，没有藏起照片，而是递给了她。"),
      "/generated/demo/shot-003-01.svg"),
    shot("shot-003-02", "ep-003", "", L("Workshop 1998", "1998 的工坊"), "needs_review", 12,
      L("Flashback wide: a young Shen Huilan and Gu's father outside the original workshop, warm film grain.", "闪回大全景：年轻的沈慧兰与顾父站在老工坊门前，暖调胶片颗粒。"),
      L("wide shot", "大全景"), L("slow zoom out", "缓慢变焦拉远"),
      L("Old workshop street, 1998, dusk", "老工坊街道，1998，黄昏"), L("golden hour, film emulation", "黄金时刻，胶片质感"),
      L("The signboard is raised; the same jade bracelet catches the last light.", "招牌升起；那只玉镯映着最后一缕天光。"),
      ""),
  ];

  const tasks = [
    {
      id: "task-review-ep004",
      kind: "episode",
      target_id: "ep-004",
      status: "needs_review",
      title: L("Review Ep 4 banquet reversal pacing", "复核第4集宴会反转节奏"),
      note: L("The dowry-return beat may land too early; confirm against hook rules.", "退还聘礼的桥段可能出现过早，请对照钩子规则确认。"),
    },
    {
      id: "task-suman-card",
      kind: "character",
      target_id: "char-su-man",
      status: "changes_requested",
      title: L("Rework Su Man's three-view notes", "修改苏曼三视图描述"),
      note: L("Back view missing; wardrobe drifts from the pastel rule set for her.", "背面视图缺失；服装与她的马卡龙色设定不一致。"),
    },
    {
      id: "task-ep001-videos",
      kind: "shot",
      target_id: "shot-001-06",
      status: "approved",
      title: L("Ep 1 storyboard image pass", "第1集分镜图打样"),
      note: L("Six shots boarded; cliffhanger close-up approved for generation.", "六个镜头已出板；结尾特写已批准进入生成。"),
    },
  ];

  return {
    project_id: "kelly-drama-demo",
    updated_at: DEMO_UPDATED_AT,
    projects: [],
    library: {},
    series,
    characters,
    relationships,
    episodes,
    shots,
    tasks,
  };
}

function character(id, name, role, status, card, visual, referenceImage, voiceProfile) {
  return {
    id,
    name,
    role,
    status,
    actor_profile: card.identity,
    character_card: card,
    visual,
    reference_card: referenceImage
      ? { image_asset: referenceImage, status: "generated", purpose: "" }
      : { status: "ready_to_generate", purpose: "" },
    ...(voiceProfile ? { voice_profile: voiceProfile } : {}),
  };
}

function relationship(id, from, to, type, publicStatus, hiddenTruth, powerDynamic, temperature, conflict, evidence) {
  return {
    id,
    from,
    to,
    type,
    public_status: publicStatus,
    hidden_truth: hiddenTruth,
    power_dynamic: powerDynamic,
    emotional_temperature: temperature,
    conflict,
    evidence,
  };
}

function episode(number, id, title, status, summary, promise, cliffhanger, beats) {
  return { id, number, title, status, summary, promise, cliffhanger, a_plot: "", b_plot: "", beats };
}

function beat(id, label, hook, conflict) {
  return { id, label, hook, conflict };
}

function shot(id, episodeId, beatId, title, status, durationSeconds, composition, shotSize, cameraMovement, setting, lighting, action, imageAsset, extra = {}) {
  return {
    id,
    episode_id: episodeId,
    beat_id: beatId,
    title,
    status,
    duration_seconds: durationSeconds,
    duration_preset: `${durationSeconds}s`,
    composition,
    shot_size: shotSize,
    camera_movement: cameraMovement,
    setting,
    lighting,
    action,
    prompt: `${composition} ${lighting}`.trim(),
    video_prompt: action,
    negative_prompt: "on-screen text, captions, watermark, plastic skin, malformed hands",
    characters: [],
    ...(imageAsset
      ? {
          image_asset: imageAsset,
          image_generated_at: DEMO_UPDATED_AT,
          image_generation: { mode: "text-to-image", model: "gpt-image-2" },
        }
      : {}),
    ...extra,
  };
}
