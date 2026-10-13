# Busabase 资源与字段

唯一的声明在 `content/kelly-dog-walk-app/app/js/config.js`；`scripts/sync-content.mjs` 从它生成
`content/*/base.json` 和 `references/native-views.json`。下面是给人看的版本。

## 文件夹「遛狗不淋雨」（`resourceKey: app-root`）

| resourceKey | 类型 | 名称 | Agent 权限 |
| --- | --- | --- | --- |
| `walk-playbook` | 技能 | 遛狗手册 | 可提交变更（限制访问） |
| `judge-rules` | 文档 | 裁判规则 | 只读（限制访问） |
| `decisions` | 数据表 | 每天的决定 | 可写入 |
| `weather` | 数据表 | 天气数据 | 可写入 |
| `kelly-dog-walk-app` | AirApp | 遛狗日历 | 只读 |
| `kelly-dog-walk` | 技能 | kelly-dog-walk（做事规矩） | 只读 |

安装只给技能、数据表、AirApp 和文件夹打 `appId`/`resourceKey` 标记；裁判规则文档没有，`setup.mjs --apply` 补上。
补上之前，脚本按包里的 slug `judge-rules` 认它。

## 每天的决定（`decisions`）

一天一城一行，按「日期 + 城市」更新，不重复。

| slug | 名称 | 类型 | 说明 |
| --- | --- | --- | --- |
| `date` | 日期 | date | `YYYY-MM-DD`，日历视图按它排 |
| `city` | 城市 | text | 例：上海 |
| `walk-hour` | 遛狗钟点 | number | 0–23 |
| `rule-applied` | 依据规则 | longtext | 规则卡给出的那句话，例：`18 点预报降水概率 87% ≥ 50%，换到 8 点（降水概率 20%）` |
| `forecast-precip-prob` | 当时预报降水概率 % | number | 那个钟点、决定当时的预报 |
| `forecast-temp` | 当时预报气温 °C | number | 同上 |
| `actual-precip-mm` | 实际降水 mm | number | 那个钟点的实际降水；待判时为空 |
| `actual-temp` | 实际气温 °C | number | 同上 |
| `verdict` | 结论 | select | `没淋` `淋雨` `太热` `不方便` `待判`（选项 id = 名称）；看板按它分列 |
| `playbook-version` | 手册版本 | text | `v1` … |
| `month` | 月份 | text | `YYYY-MM`，回放和遛狗日历按它取一个月 |

视图（`setup.mjs --apply` 创建）：「遛狗日历」calendar，按 `date`；「按结论看板」kanban，按 `verdict`。

## 天气数据（`weather`）

一城一天一钟点一行（6–22 点），按「城市 + 日期 + 钟点」更新。

| slug | 名称 | 类型 |
| --- | --- | --- |
| `city` | 城市 | text |
| `date` | 日期 | date |
| `hour` | 钟点 | number |
| `forecast-precip-prob` | 预报降水概率 % | number |
| `forecast-temp` | 预报气温 °C | number |
| `actual-precip-mm` | 实际降水 mm | number |
| `actual-temp` | 实际气温 °C | number |

数据源：预报 = `historical-forecast-api.open-meteo.com`（历史）或 `api.open-meteo.com`（今天）；
实际 = `archive-api.open-meteo.com`。本地缓存在 `~/.cache/kelly-dog-walk/open-meteo/`（`KELLY_DOG_WALK_CACHE` 可改），
只缓存已经结束、数据完整的月份。录好的课程数据在 `references/open-meteo/`。
