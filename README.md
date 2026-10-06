# SignalTrace「证见」

一个面向个人投研者的投资事件证据 Agent MVP。它不预测涨跌、不提供买卖建议；它的作用是把事件结论、版本变化和原始证据放在同一个可追溯工作台中。

## 演示场景

本项目使用 **海光信息拟换股吸收合并中科曙光** 的公开历史材料，数据快照截点为 **2025-09-06**。用户可查看停牌、预案、投资者说明会和进展公告如何改变事件状态，并通过“导入新线索”测试 Agent 的证据治理链路。

核心闭环：导入材料 → Agent 结构化提取 → 证据与风险规则校验 → 用户确认 → 新版本、时间线与站内通知。

## 设计原则

- **证据优先**：每条结论附带来源、发布时间、抓取时间、原文短引与来源等级。
- **模型不裁决**：模型只做提取、归并和解释；来源等级、证据不足拦截与状态更新由规则控制。
- **先提议、后确认**：任何新线索都不会直接写入正式结论。
- **不静默补全**：缺来源、缺日期、缺原文摘录、AI 调用失败或行情数据缺失时，界面明确展示降级状态。

## 数据来源与口径

- [海光信息交易预案](https://star.sse.com.cn/disclosure/listedinfo/announcement/c/new/2025-06-10/688041_20250610_0BJR.pdf)
- [中科曙光公司公告页](https://www.sugon.com/investor/affiche)
- [中科曙光 2025-09-06 进展公告镜像](https://money.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?id=11435914&stockid=603019)

首版使用项目内固定样例，确保评审可复现。市场反应模块只展示事件窗口与交易状态；没有可追溯行情来源时不展示价格或成交额数值。

## 本地运行

```bash
npm install
cp .env.local.example .env.local
# 在 .env.local 填入 OPENAI_API_KEY；不要提交该文件
npm run dev
```

打开 `http://localhost:3000`。未配置 Key 时，导入页面会明确提示，而不会伪造模型结果。

## 环境变量

| 名称 | 必需 | 用途 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 是（AI 分析） | 仅由服务端 Route Handler 使用 |
| `OPENAI_MODEL` | 否 | 默认为 `gpt-5-mini`，需支持 Structured Outputs |

## 测试与部署

```bash
npm run check
npm run test
npm run build
```

部署到 Vercel 后，在 Project Settings → Environment Variables 配置 `OPENAI_API_KEY`；不要将 API Key 放入客户端变量或 GitHub 仓库。

## 已知边界与未做事项

- 无实时扶摇/iFinD 数据接入、账号体系、云端持久化或真实推送。
- 导入内容在浏览器本地存储中保存，刷新后可恢复，但不跨设备同步。
- 仅覆盖一个固定历史事件；全市场监控、自动抓取和多事件聚类是后续能力。
- 该产品仅做信息证据治理，不构成证券投资咨询或交易建议。

## AI 使用与验证记录

见 [docs/AI_USAGE_AND_VALIDATION.md](docs/AI_USAGE_AND_VALIDATION.md)，测试说明见 [docs/TESTING.md](docs/TESTING.md)。
