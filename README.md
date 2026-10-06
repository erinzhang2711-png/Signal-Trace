# SignalTrace「证见」

一个面向个人投研者的投资事件证据 Agent MVP。它不预测涨跌、不提供买卖建议；它的作用是把事件结论、版本变化和原始证据放在同一个可追溯工作台中。

## 演示场景

本项目使用 **海光信息拟换股吸收合并中科曙光** 的公开历史材料，数据快照截点为 **2025-09-06**。用户可查看停牌、预案、投资者说明会和进展公告如何改变事件状态，也可运行一次 iFinD MCP 历史监测。

核心闭环：触发监测 → Single Agent 选择受限 iFinD 工具 → 读取证据 → 生成更新草案 → 规则校验 → 用户确认 → 新版本、时间线与站内通知。

## Agent 与 MCP 如何协作

这不是 Multi-agent 系统，而是一个**受约束的 Single Agent**：模型仅负责决定在给定的四个只读业务工具中查询哪些资料，以及基于返回结果提出草案。每次运行至多 4 次调用，重复工具会被拒绝。

| 业务工具 | 底层 iFinD MCP 工具 | 用途 |
| --- | --- | --- |
| `search_event_notices` | `search_notice` | 优先核验公告与程序状态 |
| `search_related_news` | `search_news` | 补充新闻传播与不同观点 |
| `get_disclosed_event_context` | `get_stock_events` | 核对两家公司的公开披露事件 |
| `get_historical_market_context` | `get_stock_performance` | 展示固定窗口的同期市场背景，不判断因果 |

服务端执行 MCP 调用，浏览器不接触任何凭证。模型不能自行决定来源权重、修改状态或写入版本；公告优先、缺少原始链接、冲突、工具失败和调用上限均由产品规则处理。用户导入含直达来源的材料后，才可点击确认并写入本地版本。

停止条件：无新事实则输出“无状态变化”；来源不足/冲突则转“待人工核验”；工具失败或未调用证据工具则失败退出；达到 4 次调用后停止继续检索。

## 设计原则

- **证据优先**：每条结论附带来源、发布时间、抓取时间、原文短引与来源等级。
- **模型不裁决**：模型只做提取、归并和解释；来源等级、证据不足拦截与状态更新由规则控制。
- **先提议、后确认**：任何新线索都不会直接写入正式结论。
- **不静默补全**：缺来源、缺日期、缺原文摘录、AI 调用失败或行情数据缺失时，界面明确展示降级状态。

## 数据来源与口径

- [海光信息交易预案](https://star.sse.com.cn/disclosure/listedinfo/announcement/c/new/2025-06-10/688041_20250610_0BJR.pdf)
- [中科曙光公司公告页](https://www.sugon.com/investor/affiche)
- [中科曙光 2025-09-06 进展公告镜像](https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=11435914&stockid=603019)

首版使用项目内固定样例，确保评审可复现。可选 iFinD MCP 连接提供公告、新闻、事件与日频历史行情检索；实际验证中，公告检索返回的是标题、日期与片段，不一定附原始公告 URL。因此 Agent 会保留 iFinD 工具轨迹，并将缺原始链接的草案拦截为人工核验，而不是伪造可点击来源。

## 本地运行

```bash
npm install
cp .env.local.example .env.local
# 在 .env.local 填入 OpenAI 与 iFinD 凭证；不要提交该文件
npm run dev
```

打开 `http://localhost:3000`。未配置 Key 时，导入页面会明确提示，而不会伪造模型结果。

## 环境变量

| 名称 | 必需 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 是（Agent 规划与草案） | 仅由服务端 Route Handler 使用 |
| `OPENAI_MODEL` | 否 | 默认为 `gpt-5-mini`，需支持 Structured Outputs |
| `IFIND_MCP_TOKEN` | 是（iFinD 监测） | 仅由服务端 MCP 客户端使用 |
| `IFIND_NEWS_MCP_URL` | 是（iFinD 监测） | 新闻公告 MCP 的 Streamable HTTP 地址 |
| `IFIND_STOCK_MCP_URL` | 是（iFinD 监测） | A股数据 MCP 的 Streamable HTTP 地址 |

## 测试与部署

```bash
npm run check
npm run test
npm run build
```

部署到 Vercel 后，在 Project Settings → Environment Variables 配置上述 `OPENAI_*` 与 `IFIND_*` 变量；不要将任何 Key、token 放入客户端变量或 GitHub 仓库。

## 已知边界与未做事项

- 监测的是固定历史区间，不是实时盯盘；定时触发、账号体系、云端持久化和真实推送尚未实现。
- 导入内容在浏览器本地存储中保存，刷新后可恢复，但不跨设备同步。
- 仅覆盖一个固定历史事件；全市场监控、自动事件聚类和后台调度是后续能力。
- 该产品仅做信息证据治理，不构成证券投资咨询或交易建议。

## AI 使用与验证记录

见 [docs/AI_USAGE_AND_VALIDATION.md](docs/AI_USAGE_AND_VALIDATION.md)，测试说明见 [docs/TESTING.md](docs/TESTING.md)。
