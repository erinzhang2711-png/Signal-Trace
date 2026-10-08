# SignalTrace「证见」

一个面向投资事件研究的证据时间线原型。它把公告、新闻和市场背景整理为**可追溯的候选材料**，优先寻找交易所、巨潮资讯或公司 IR 原文；只有来源、时间和事件匹配的材料，才能进入正式证据时间线。

> 产品只做信息证据治理与研究过程记录，不提供买卖建议、收益承诺或价格预测。

## 核心流程

```text
研究任务
  → Single Agent 规划 iFinD 检索
  → iFinD MCP 返回公告 / 新闻 / 事件 / 行情候选
  → 规则过滤与同一事件归并
  → Exa 查找并读取权威原文
  → 正式证据时间线 或 候选人工核验
```

1. 用户输入公司、事件关键词与历史截点；所有任务走同一条研究路径。
2. 受限 Single Agent 最多调用 4 个只读 iFinD MCP 工具，同一工具不可重复调用。
3. 服务端统一候选材料的日期、短引、来源与链接，并过滤不相关材料。
4. 对缺少权威链接的候选，Exa 优先在上交所、深交所、巨潮资讯中检索；未命中时才尝试公司 IR 页面。
5. 只有官方域名、标题、披露日期和可读原文正文同时匹配的材料，才自动标记为“已自动核验”并写入证据时间线。
6. 媒体转载、无直达原文或原文无法匹配的材料只保留为候选，供用户补充或人工核验。

详细模块边界见 [架构说明](docs/ARCHITECTURE.md)，测试和验证范围见 [测试说明](docs/TESTING.md)。

## 架构与职责

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 页面与交互 | `app/page.tsx`、`app/research/page.tsx` | 收集研究任务、展示时间线、来源链接与降级状态 |
| 编排入口 | `app/api/monitor/route.ts` | 受控 Agent 循环、调用上限、汇总运行记录 |
| iFinD 适配 | `lib/ifind.ts` | MCP 调用、候选提取、行情解析与任务相关性过滤 |
| 权威原文补链 | `lib/authority-resolver.ts` | Exa 检索、官方来源判定、标题/日期/正文核对 |
| 证据治理 | `lib/evidence.ts` | 来源分级、正式状态升级规则、候选隔离 |
| 时间线 | `lib/timeline.ts` | 阶段归并与来源可追溯展示 |
| 类型与测试 | `lib/types.ts`、`lib/*.test.ts` | 共享数据契约与规则回归测试 |

## 证据规则

| 材料类型 | 是否自动进入正式证据时间线 | 后续动作 |
| --- | --- | --- |
| 交易所 / 巨潮 / 深交所原文，且标题、日期、正文匹配 | 是 | 标记“已自动核验” |
| 公司 IR 原文，且标题、日期、正文匹配 | 是 | 标记“已自动核验” |
| iFinD 返回但没有原文链接 | 否 | Exa 自动补链；失败则保留候选 |
| 媒体、研报观点、传闻 | 否 | 仅作线索，需人工补权威原文 |
| 冲突、非同一事件、非事实材料 | 否 | 不改写当前事件状态 |

Exa 只负责发现与读取潜在原文链接，**不是证据来源本身**。系统不会伪造 URL、日期、短引或“已完成”结论。

## 本地运行

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

打开 `http://localhost:3000`。密钥只放在 `.env.local` 或 Vercel 的服务端环境变量中，绝不提交到仓库或暴露为 `NEXT_PUBLIC_*` 变量。

## 环境变量

任选一种模型提供方；两组模型变量不要同时配置。

| 名称 | 必需 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI 路径需要 | 服务端模型调用 |
| `OPENAI_MODEL` | 否 | 默认为 `gpt-5-mini`，需支持 Structured Outputs |
| `ZHIPU_API_KEY` | 智谱路径需要 | 服务端模型调用 |
| `ZHIPU_MODEL` | 否 | 需支持 Chat Completions、工具调用与 JSON 输出 |
| `IFIND_MCP_TOKEN` | iFinD 监测需要 | iFinD MCP 服务端鉴权 |
| `IFIND_NEWS_MCP_URL` | iFinD 监测需要 | 新闻公告 MCP 地址 |
| `IFIND_STOCK_MCP_URL` | iFinD 监测需要 | A 股数据 MCP 地址 |
| `EXA_API_KEY` | 权威原文自动补链需要 | 服务端 Exa SDK；只发现、读取并核对原文 |

部署到 Vercel 时，在 **Project Settings → Environment Variables** 配置对应变量；Production、Preview 和 Development 环境按需要分别设置。

## 验证命令

```bash
npm run test    # 规则与适配层单元测试
npm run check   # TypeScript 类型检查
npm run build   # Next.js 生产构建
```

这些命令验证的是代码路径和构建，不等于已验证真实 iFinD、Exa、模型账号和 Vercel 生产环境。完整范围、手动验收清单和未覆盖项见 [测试说明](docs/TESTING.md)。

## 已知边界

- 当前是按用户触发的历史研究，不包含定时监测、账号体系、云端持久化或推送。
- Exa 与 iFinD 的真实调用依赖各自的有效服务端凭证、额度与网络可用性；未配置或失败时系统应明确降级，而非生成虚假证据。
- 公司 IR 域名的自动识别比交易所域名更保守；匹配不足时材料保持候选。
- 尚未建立人工标注基准集，因此不宣称“全市场召回率”或“模型准确率”。评估设计见 [测试说明](docs/TESTING.md)。
