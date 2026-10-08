# 架构说明

## 目标与边界

SignalTrace 的目标不是预测股价，而是把持续演化的投资事件整理为可追溯证据时间线。核心风险是：模型把搜索摘要、媒体报道或不相关公告误升格为正式事实。因此架构把“发现材料”和“批准事实”拆开。

```text
Browser
  │  ResearchTask
  ▼
Next.js Route Handler: /api/monitor
  │
  ├─ LLM Planner ── selects at most four read-only iFinD business tools
  │                    │
  │                    ▼
  ├─ iFinD MCP adapter (lib/ifind.ts)
  │                    │ normalized EvidenceItem candidates
  │                    ▼
  ├─ Evidence gate + timeline grouping
  │                    │ unresolved candidates
  │                    ▼
  ├─ Exa authority resolver (lib/authority-resolver.ts)
  │     exchange / CNINFO / SZSE first, then conservative company IR fallback
  │                    │
  ▼                    ▼
Formal evidence timeline       Candidate queue / manual follow-up
```

## 模块契约

### 1. Agent 编排：`app/api/monitor/route.ts`

- 解析研究任务，加载模型运行时。
- 允许模型在 4 个 iFinD 业务工具中规划调用；服务端执行工具且拒绝重复与超限调用。
- 合并模型与 MCP 提取的候选，调用权威原文解析器，返回 `AgentRun`。
- 不负责来源升格规则本身，避免把业务治理藏进提示词。

### 2. 数据接入：`lib/ifind.ts`

- 将业务工具映射为 iFinD MCP 调用。
- 只从 MCP 返回内容提取标题、日期、片段和已有链接。
- 缺少链接时使用空值，绝不编造 URL。

### 3. 权威原文解析：`lib/authority-resolver.ts`

- 先在 `sse.com.cn`、`cninfo.com.cn`、`szse.cn` 搜索。
- 仅在交易所未命中时，才接受带 IR 路径特征的公司页面候选。
- 用 `getContents` 读取候选原文；标题、日期和至少一段可读正文同时匹配才自动核验。
- Exa 的搜索结果不是证据；命中的原文 URL 与正文才是。

### 4. 证据治理：`lib/evidence.ts`

- 将来源分为交易所/公司公告、公司投资者关系、媒体报道、用户导入。
- 对“已完成”“已否认”等强状态要求更高来源等级。
- 媒体、传闻、缺原文或同一事件不确定的材料不能改写当前状态。

### 5. 表达层：`lib/timeline.ts` 与 `app/research/page.tsx`

- 时间线阶段、标题和来源数量从 `EvidenceItem` 归并而来。
- 每个节点显示发生、披露、抓取、更新时间、来源和原文链接。
- “已自动核验”与“待补权威原文”是不同状态，避免把候选线索伪装为事实。

## 为什么是受控 Single Agent

这是一个受控 Single Agent，而不是多 Agent 编排。模型只负责检索顺序、材料归并与解释；来源等级、状态升级、调用上限和写入条件由确定性代码控制。

这样设计的权衡是：牺牲一部分开放搜索自由度，换取更可解释的工具轨迹、较低的错误升格风险和更容易审计的状态变化。若未来加入长期监测、重试、人工任务队列和持久化状态，可将同一状态与节点迁移到 LangGraph；目前不为了框架名称增加运行复杂度。
