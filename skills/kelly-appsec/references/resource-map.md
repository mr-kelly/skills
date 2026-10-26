# 资源与状态

| Base | 用途 | 核心范围 |
| --- | --- | --- |
| projects | 项目、负责人、范围、当前部署版本、环境、Origin 与完成配置 | 本工作台独立资源 |
| endpoints | OpenAPI / 源码 / 人工盘点的接口 | project-reference + source-revision |
| rules | 身份、预期状态、对象/字段断言、业务依据及正向基线 | project + endpoint + revision |
| runs | 本机任务请求、规则 head 快照、claim、heartbeat、取消与复测引用 | project + revision + environment + origin + scope |
| checks | 每条规则每次执行的观察与结果，保留 attempt | project + run + endpoint + rule + revision |
| findings | 自动分析、人工复核理由、负责人及修复版本 | project + run + check |
| evidence | 脱敏摘录、来源、采集时间、SHA 与本机原件引用 | project + run + check + revision |

每个关系同时保存精确文本引用，交互使用服务端 valueFilters；读取后再次核对真实 relation。每次每类最多一页 50 条；加载更多显式继续，汇总使用 count/groupBy。原生表格 View 保留审阅入口。设置是 projects 中的原生字段，没有另建隐藏数据库。

run: requested → running → completed / partial / failed / cancelled。failed/partial 仅在本机 --resume 和当前独立授权通过后继续。活跃 claim 120 秒内不可接管。请求预算记录在请求发送之前；错误也消耗请求预算。不自动重试。取消在当前请求返回后停止后续请求。

check: running → completed / failed；result 为 satisfied / violated / inconclusive / unverified。HTTP 状态与结果独立。历史 completed 仅能在相同不可变规则 head、端点与项目/版本所有权内复用；待复核旧证据不能伪装成新请求。

finding.verdict：needs-review / confirmed-vulnerability / explained-benign / needs-investigation。提交理由才改变人工结论。remediation：open → ready-for-retest → verified-fixed / reopened。已修复只适用于声明的修复版本、原规则及其正向基线。

导出分别报告“已存在记录是否全部翻页读取”和“原请求规则是否全部获得可归属的结论”。必须逐条对账任务 rule-snapshot，显示未执行、失败、不确定、已变更或无法读取的规则；最新一次失败不能被较早成功掩盖。新任务的快照保存原规则标题、身份、业务依据、方法/路径及端点 head，供规则后续修改或删除时解释原请求。旧任务仅有 ID/head 时，只能使用同 head、同项目/版本的现有描述，并明确恢复不了的缺口。浏览器报告仅限已加载记录；本机导出对政策指纹校验后才计入已核验覆盖。
