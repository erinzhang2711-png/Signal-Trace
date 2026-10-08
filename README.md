# SignalTrace「证见」

## 演示场景

默认首页从一条研究任务开始：输入公司/标的、事件关键词与历史截点，Agent 再调用 iFinD MCP 进行有限检索。所有任务（包括海光信息与中科曙光）都走同一条研究流程，不会跳转到内置案例页面。

核心闭环：定义研究任务 → Single Agent 选择受限 iFinD 工具 → 候选材料收件箱 → 用户补充权威原文 → 生成更新草案 → 规则校验 → 用户确认 → 新版本、时间线与站内通知。

## Agent 与 MCP 如何协作

这不是 Multi-agent 系统，而是一个**受约束的 Single Agent**：模型仅负责决定在给定的四个只读业务工具中查询哪些资料，以及基于返回结果提出草案。用户任务会被传给工具调用层生成查询参数；每次运行至多 4 次调用，重复工具会被拒绝。

| 业务工具 | 底层 iFinD MCP 工具 | 用途 |
| --- | --- | --- |
| `search_event_notices` | `search_notice` | 优先核验公告与程序状态 |
| `search_related_news` | `search_news` | 补充新闻传播与不同观点 |
| `get_disclosed_event_context` | `get_stock_events` | 核对两家公司的公开披露事件 |
| `get_historical_market_context` | `get_stock_performance` | 展示固定窗口的同期市场背景，不判断因果 |

服务端执行 MCP 调用，浏览器不接触任何凭证。模型不能自行决定来源权重、修改状态或写入版本；公告优先、缺少原始链接、冲突、工具失败和调用上限均由产品规则处理。候选材料若缺少原文，只能停留在收件箱；用户补充可直达来源后，才可点击确认并建立正式事件或写入本地版本。

停止条件：无新事实则输出“无状态变化”；来源不足/冲突则转“待人工核验”；工具失败或未调用证据工具则失败退出；达到 4 次调用后停止继续检索。

### 面试讲法：LangChain 语义映射（不新增框架依赖）

运行逻辑保持现状，但可以用 LangChain 的语言清楚解释这套受控架构：

```text
ResearchTask
  → Planner（模型选择下一只未用工具）
  → Tool executor（服务端 iFinD MCP）
  → Evidence normalizer（统一日期、短引、来源与链接）
  → Evidence gate（同一事件 / 事实属性 / 来源资格）
  → Candidate timeline（阶段归并草案）
  → Human approval（补原文、确认后才写正式版本）
```

| LangChain 概念 | SignalTrace 对应实现 | 为什么这样设计 |
| --- | --- | --- |
| Agent / Planner | `app/api/monitor/route.ts` 的受限工具规划 | 只决定检索顺序，不能改状态或来源等级 |
| Tools | 四个 iFinD MCP 业务工具 | 只读、最多 4 次、同一工具不可重复 |
| State | `AgentRun`、`EvidenceItem`、`TimelineGroup` | 每一步可回放，候选和正式版本分开 |
| Guardrails | `lib/evidence.ts` 的规则校验 | 缺原文、媒体线索或冲突不能升级 |
| Human-in-the-loop | 候选核验面板与确认按钮 | 人补原文并确认，才创建正式事件版本 |

面试时可以说：**“我采用 LangChain 风格的 Planner–Tools–State–Human approval 分层，但没有为了包装而引入 LangChain 依赖。这样保留了工具轨迹和人工确认的可审计性，也避免框架重写给演示带来新的故障面。”**

## Agent 状态机与决策边界

这是一个受约束的单 Agent 循环：模型只能从四个业务工具中选择下一步，服务端才真正执行 MCP 调用并回传结果。模型不可读取凭证、不可写入版本、不可自行提高来源等级。

```text
研究任务 → 选择一个未调用的工具 → 服务端执行并记录轨迹 → 模型决定继续或输出草案
                                      ↑                         │
                                      └──── 最多 4 次，禁止重复 ──┘

草案 → 规则层裁决 → 待人工核验 / 无状态变化 / 待用户确认 → 用户确认 → 正式事件版本
```

模型需要判断：材料是否属于同一事件、属于事实/观点/推测/传闻、是否存在足以改变状态的新事实、是否冲突、以及是否要求人工复核。规则层会额外强制以下条件：

- 没有可直达 HTTPS 原文、不是“同一事件”、不是事实材料、或 `requiresReview=true`：一律停留在待人工核验；
- 媒体报道只能提供候选线索，不能独立建立正式事件；
- “已完成”与“已否认”只能由交易所/公司公告支持；
- 没有执行任何证据工具、工具调用失败、或达到调用上限后仍无可靠结论：停止，不生成正式结论。

## 设计原则

- **证据优先**：每条结论附带发生、披露、抓取、更新时间、原文短引与来源等级。
- **模型不裁决**：模型只做提取、归并和解释；来源等级、证据不足拦截与状态更新由规则控制。
- **先提议、后确认**：任何新线索都不会直接写入正式结论。
- **不静默补全**：缺来源、缺日期、缺原文摘录、AI 调用失败或行情数据缺失时，界面明确展示降级状态。
- **版本不被传闻污染**：无来源传闻仅进入人工核验，不会创建正式版本或覆盖当前结论。

## 数据来源与口径

- [海光信息交易预案](https://star.sse.com.cn/disclosure/listedinfo/announcement/c/new/2025-06-10/688041_20250610_0BJR.pdf)
- [中科曙光公司公告页](https://www.sugon.com/investor/affiche)
- [中科曙光 2025-09-06 进展公告镜像](https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=11435914&stockid=603019)

iFinD MCP 连接提供公告、新闻、事件与日频历史行情检索；实际验证中，公告检索返回的是标题、日期与片段，不一定附原始公告 URL。因此 Agent 会保留 iFinD 工具轨迹，并将缺原始链接的草案拦截为人工核验，而不是伪造可点击来源。

## 本地运行

```bash
npm install
cp .env.local.example .env.local
# 在 .env.local 填入 OpenAI 或智谱，以及 iFinD 凭证；不要提交该文件
npm run dev
```

打开 `http://localhost:3000`。未配置 Key 时，导入页面会明确提示，而不会伪造模型结果。

## 环境变量

任选一种模型提供方；两组模型变量不要同时配置。iFinD 变量仅在使用泛研究监测时需要。

| 名称 | 必需 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI 路径需要 | 仅由服务端 Route Handler 使用 |
| `OPENAI_MODEL` | 否 | 默认为 `gpt-5-mini`，需支持 Structured Outputs |
| `ZHIPU_API_KEY` | 智谱路径需要 | 智谱 API Key，仅由服务端 Route Handler 使用 |
| `ZHIPU_MODEL` | 否 | 默认为 `glm-4-flash`；请使用账户已开通、支持 Chat Completions、工具调用与 JSON 输出的模型 |
| `IFIND_MCP_TOKEN` | 是（iFinD 监测） | 仅由服务端 MCP 客户端使用 |
| `IFIND_NEWS_MCP_URL` | 是（iFinD 监测） | 新闻公告 MCP 的 Streamable HTTP 地址 |
| `IFIND_STOCK_MCP_URL` | 是（iFinD 监测） | A股数据 MCP 的 Streamable HTTP 地址 |

## 测试与部署

```bash
npm run check
npm run test
npm run build
```

部署到 Vercel 后，在 Project Settings → Environment Variables 配置一组 `OPENAI_*` 或 `ZHIPU_*`，以及 `IFIND_*` 变量；不要将任何 Key、token 放入客户端变量或 GitHub 仓库。

## 已知边界与未做事项

- 监测的是固定历史区间，不是实时盯盘；定时触发、账号体系、云端持久化和真实推送尚未实现。
- 导入内容在浏览器本地存储中保存，刷新后可恢复，但不跨设备同步。
- 泛事件监测需要所选模型支持 Chat Completions、工具调用与 JSON 输出；若模型或 MCP 调用失败，应用会明确停止并提示原因，不会伪造检索结果。固定案例不依赖外部模型，仍可完整复现。
- 仅覆盖一个固定历史事件的完整版本演化；全市场自动事件聚类、后台调度，以及“更正/过期”材料的端到端交互仍是后续能力。
- 首版以固定历史案例呈现正式版本演化；传闻、观点与缺失原文的材料只会停留在候选核验队列，不会被伪造成正式版本。
- 该产品仅做信息证据治理，不构成证券投资咨询或交易建议。
