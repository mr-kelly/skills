# Kelly Compliance · 云安全与合规准备台

将 SaaS 云安全基线、SOC 2 就绪控制、真实期间证据、缺口责任与到期风险接受放在同一工作台。不需要 AWS 凭据即可从现有报告或手工证据索引开始。

安装：`npx busabase-cli@0.99.1 install ./skills/kelly-compliance`，在该目录设置选中的 Busabase 连接后运行 `node scripts/setup.mjs --apply`。包括八类原生 Base、表格 View、指南、手册、私有 Drive 与可运行 AirApp。

逐项复核不同证据维度，指定负责人和到期日，再用匹配的新证据复测关闭。快照不等于期间运行，备份成功不等于恢复演练，风险接受不等于检查通过。本机只运行有限 AWS 读取配方；页面不接收密钥，不启用服务，不自动整改。

结果是准备材料，不是审计意见或认证。详见 [SKILL.md](SKILL.md)、[输入](references/imports.md)、[有限 AWS 读取](references/aws.md)和[来源](references/sources.md)。`?demo=1` 为明确标记的合成演示。
