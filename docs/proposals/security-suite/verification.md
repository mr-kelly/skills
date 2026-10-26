# 安全与合规工作台交付验证

日期：2026-10-26。实现分支：`feat/appsec-compliance-workspaces`。

## 用户可见结果

- `kelly-appsec`：围绕接口、角色、对象和业务规则，查看显式权限矩阵、脱敏证据、人工判断与指定版本复测。
- `kelly-compliance`：围绕 SaaS 范围、云资源和控制要求，查看证据期间、缺口责任人、例外期限与重新验证。
- 两套分别安装为独立 Busabase Folder、原生表格 Views、手册、指南、Drive 和 AirApp。

## 验证环境

使用 Node 24.18、Busabase OSS 0.99.1、busabase-cli 0.99.1 和 busabase-sdk 0.99.1。执行器集成仅访问受控本地 API；AWS 适配器使用固定测试响应检验命令、范围、分页和失败处理。真实客户服务器、业务接口、云账户和生产数据未参与验证。

## 验收记录

| 边界 | 要证明的行为 | 状态 |
| --- | --- | --- |
| 安装 | 完整包安装、重复安装复用资源、原生 Views 和场景提示存在 | 通过 |
| API 执行 | 独立当前授权、正向基线、对象/身份断言、重定向边界、取消/恢复 | 通过 |
| 原问题复测 | 同一业务规则和断言、新修复版本、匹配原问题与正向基线 | 通过 |
| 合规证据 | 账户/区域/范围/框架版本、期间、人工复核、过期、逐项要求 | 通过 |
| 整改闭环 | 新证据重新验证，旧版本/过期证据不能关闭缺口 | 通过 |
| Busabase | 真正写入、重读、重启后持久化、AirApp 同源运行与源码一致 | 通过 |
| 响应式 UI | 桌面与手机布局、表单、记录详情、深链接、刷新与编辑 | 通过 |
| 网站和媒体 | 真实界面截图、合成数据视频、图片/视频可加载、安装入口 | 通过 |
| CI | 仓库 lint/typecheck、SDK 和 hosted detection 检查通过；全量 CI 与 Pages | 发布中 |
| Cloud OAuth | 独立凭据和专用测试 Space 的环境门控 | 未提供凭据时明确跳过 |

本地验收通过：独立 Node 跨边界测试 39/39、包内领域测试 17/17；两套应用各四种尺寸（1280×820、1280×720、390×844、360×740）的真实浏览器交互，以及两个已合并 OSS AirApp 的实际 UI 写入、SDK 回读、刷新持久化和手机布局。原生平台启动期会重建临时 iframe；最终同源会话、静态文件 MIME 与后续应用行为均验证。

两个完整包的严格检查均为零错误、零警告；网页预览验证了首页入口、完整图片加载和实际视频播放。AppSec 视频 29.63 秒，Compliance 视频 28.87 秒；均为 1440×900、30fps、H.264/yuv420p、TV range、无音轨且小于 2 MB。

## 首版能力边界

- AppSec 自动执行显式 REST 请求、身份、受控对象与返回字段断言；复杂回调、支付状态机、数据库状态与任意技术栈需要本机 Agent 按项目规则进行审阅/扩展，并不能由这套有限请求执行器自动证明。
- Compliance 的八项控制模板为就绪准备的起点，外部框架引用为示意映射；不表示完整 SOC 2 标准库、认证或专业鉴证意见。
- AWS 适配器有限读取与已有报告导入分别保留分页、权限、服务前提和预算缺口；没有验证真实 AWS 账户。
- Cloud OAuth 因缺少专用凭据明确跳过，不能用 OSS 结果代替 Cloud 验证。

## 复现命令

```sh
npm run lint
npm run typecheck
npm run audit:sdk-policy
npm run audit:hosted-detection
npm run test:app-skills:oss:kelly-appsec
npm run test:app-skills:oss:kelly-compliance
npm run test:app-skills:cloud:kelly-appsec
npm run test:app-skills:cloud:kelly-compliance
npx busabase-cli@0.99.1 check skills/kelly-appsec --strict
npx busabase-cli@0.99.1 check skills/kelly-compliance --strict
gh skill publish --dry-run
node scripts/build-site.mjs --asset-mode=pages-local
```

截图和视频均为明确标注的合成演示数据。视频展示实际运行界面和现有控件；未使用假终端日志、伪造客户结果或虚构的云扫描进度。
