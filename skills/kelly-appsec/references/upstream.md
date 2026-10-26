# 方法来源与许可

规则设计参考 OWASP ASVS 5.0.0、OWASP API Security Top 10 2023 的对象/字段/函数授权及敏感业务流程分类。链接、观察版本与固定提交见 `upstream-sources.json`。这些分类用于指导选择审阅问题，不表示已经完成标准全部要求。

借鉴 mukul975 / Anthropic-Cybersecurity-Skills 的 API 安全测试、BOLA 和业务逻辑审阅三个技能的方法：先整理接口与身份、建立正反例和业务预期、保留具体证据、修复后复测。固定提交 54a798831d2266a3ca61ce68a7acb80b81160d57，Apache-2.0 许可原文见 `../LICENSES/Apache-2.0.txt`。本包以自己的工作流、有限执行器、UI 与多项目数据模型重新实现方法，不附带第三方扫描脚本或漏洞利用载荷。

Busabase 包格式、SDK/OAuth/原生资源模式来自 busabase/skills 的 busabase-app-creator，使用已检查的最新源与 SDK 0.99.1。Kelly Security 中的运行时、安全记录写入边界与 editorial 资产按本仓库许可复用；接口矩阵与规则/复测实现为本包自有实现。AICPA/CIS 标准正文不在本包再分发范围。
