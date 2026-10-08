import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import type { AgentToolName, AgentToolTrace, EvidenceItem, MarketPoint, MarketSeries, ResearchTask, SourceTier } from "@/lib/types";

type McpTarget = "stock" | "news";
type McpCall = { target: McpTarget; tool: string; arguments: Record<string, string | number> };

function historyStart(_cutoffDate: string) {
  // An event lifecycle often starts years before its latest disclosure. The cutoff
  // remains the as-of boundary; retrieval itself must not silently truncate history.
  return "2000-01-01";
}

function primaryCompanyName(task: ResearchTask) {
  return (task.companyQuery.split(/[、，,]/)[0] ?? task.companyQuery).replace(/\b\d{6}\b/g, "").trim();
}

function toolCallsFor(task: ResearchTask): Record<AgentToolName, McpCall> {
  const start = historyStart(task.cutoffDate);
  const query = `${task.companyQuery} ${task.eventQuery}`.trim();
  return {
  search_event_notices: {
    target: "news",
    tool: "search_notice",
    arguments: {
      query: `${query} 筹划 预案 审议 审核 实施 完成 整合 公告`,
      time_start: start,
      time_end: task.cutoffDate,
      size: 10,
    },
  },
  search_related_news: {
    target: "news",
    tool: "search_news",
    arguments: {
      query: `${query} 时间线 进展`,
      time_start: start,
      time_end: task.cutoffDate,
      size: 10,
    },
  },
  get_disclosed_event_context: {
    target: "stock",
    tool: "get_stock_events",
    arguments: { query: `${query} ${start}至${task.cutoffDate} 公开披露事件与进展` },
  },
  get_historical_market_context: {
    target: "stock",
    tool: "get_stock_performance",
    arguments: { query: `${primaryCompanyName(task)} 在${start}至${task.cutoffDate}的收盘价、涨跌幅、成交额日频历史行情，仅作同期市场背景` },
  },
  };
}

function serverUrl(target: McpTarget) {
  return target === "news" ? process.env.IFIND_NEWS_MCP_URL : process.env.IFIND_STOCK_MCP_URL;
}

function textFromResult(content: unknown): string {
  if (!Array.isArray(content)) return "MCP 未返回可展示的文本结果。";
  const joined = content
    .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as { type?: string }).type === "text" && typeof (part as { text?: string }).text === "string"))
    .map((part) => part.text)
    .join("\n");
  return joined ? joined.slice(0, 12_000) : "MCP 未返回可展示的文本结果。";
}

function resultExcerpt(output: string) {
  if (output.startsWith("工具调用失败") || output.startsWith("工具不可用") || output.startsWith("MCP 未返回")) return "";
  return output.replace(/\s+/g, " ").trim().slice(0, 420);
}

type UnknownRecord = Record<string, unknown>;

const TITLE_KEYS = ["title", "headline", "name", "notice_title", "news_title", "标题", "公告标题", "新闻标题", "资讯标题", "公告名称"];
const DATE_KEYS = ["date", "publish_date", "pub_date", "publishdate", "publishtime", "time", "日期", "发布时间", "披露日期", "公告日期"];
const URL_KEYS = ["url", "link", "source_url", "news_url", "notice_url", "原文链接", "链接", "网址"];
const PUBLISHER_KEYS = ["source", "publisher", "media", "author", "来源", "发布方", "媒体", "资讯来源", "来源名称"];
const BODY_KEYS = ["summary", "content", "abstract", "description", "text", "正文", "摘要", "内容", "简介", "资讯内容", "公告片段内容", "内容摘要"];
const CLOSE_KEYS = ["close", "close_price", "closeprice", "收盘价", "收盘", "最新价"];
const CHANGE_KEYS = ["change_pct", "changepercent", "pct_chg", "涨跌幅", "涨跌幅%"];

function recordValue(record: UnknownRecord, keys: string[]) {
  const normalized = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase());
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function normalizeDate(value: string) {
  if (/^20\d{6}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const match = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return "";
  const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return new Date(`${normalized}T00:00:00Z`).toISOString().slice(0, 10) === normalized ? normalized : "";
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function sourceTier(publisher: string, sourceUrl: string): SourceTier {
  if (!sourceUrl) return "媒体报道";
  const value = `${publisher} ${sourceUrl}`.toLowerCase();
  if (value.includes("sse.com") || value.includes("cninfo") || value.includes("公告") || value.includes("证券交易所")) return "交易所/公司公告";
  if (value.includes("investor") || value.includes("投资者") || value.includes("ir.")) return "公司投资者关系";
  return "媒体报道";
}

function parsedDocuments(output: string): unknown[] {
  const candidates = [output, ...Array.from(output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1])];
  const documents: unknown[] = [];
  const seen = new Set<string>();
  while (candidates.length > 0) {
    const candidate = candidates.shift();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const document = JSON.parse(candidate) as unknown;
      documents.push(document);
      // iFinD commonly returns JSON in data.data as an escaped JSON string.
      // Parse only strings that look like a serialized object or array.
      const serialized = textValues(document).filter((value) => {
        const trimmed = value.trim();
        return (trimmed.startsWith("{") || trimmed.startsWith("[")) && (trimmed.endsWith("}") || trimmed.endsWith("]"));
      });
      candidates.push(...serialized);
    } catch {
      // Non-JSON strings are handled by the raw-text fallback when needed.
    }
  }
  return documents;
}

function nestedRecords(value: unknown, records: UnknownRecord[] = []): UnknownRecord[] {
  if (Array.isArray(value)) {
    value.forEach((item) => nestedRecords(item, records));
  } else if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    records.push(record);
    Object.values(record).forEach((item) => nestedRecords(item, records));
  }
  return records;
}

function collectRecords(value: unknown) {
  return nestedRecords(value).filter((record) => Boolean(recordValue(record, TITLE_KEYS) && recordValue(record, DATE_KEYS)));
}

function relevanceTerms(task: ResearchTask) {
  const specificTerms = task.eventQuery
    .replace(/并购|收购|吸收合并|合并|重组|换股|交易|事项|进展/g, " ")
    .split(/[\s、，,；;·×xX]+/)
    .filter((term) => term.length >= 2);
  if (specificTerms.length > 0) return [...new Set(specificTerms)];
  return task.eventQuery.split(/[\s、，,；;·×xX]+/).filter((term) => term.length >= 2);
}

function companyTerms(task: ResearchTask) {
  return [...new Set(task.companyQuery.match(/[\u4e00-\u9fa5]{2,}|\d{6}|[A-Za-z]{2,}/g) ?? [])];
}

function isRelevant(task: ResearchTask, text: string, title = "") {
  const companies = companyTerms(task);
  const events = relevanceTerms(task);
  const broadlyRelevant = companies.some((term) => text.includes(term)) && (events.length === 0 || events.some((term) => text.includes(term)));
  if (!broadlyRelevant) return false;
  // For a merger, a generic financing or periodic filing can repeat the merger in
  // its background section without being a lifecycle milestone. Keep only records
  // whose headline itself signals the transaction or a direct post-merger outcome.
  if (/换股|吸收合并|合并|重组/.test(task.eventQuery)) {
    const hasLifecycleHeadline = /换股|吸收合并|合并|重组|整合|更名|新任|管理层|总裁|董事长|交割|审核|审议|预案|停牌/.test(title);
    if (!hasLifecycleHeadline) return false;
    if (/债券|募集说明书|注册稿|年度报告|季度报告/.test(title) && !/换股|吸收合并|合并|重组/.test(title)) return false;
  }
  return true;
}

function toolLabel(tool: AgentToolName) {
  if (tool === "search_event_notices") return "公告检索";
  if (tool === "search_related_news") return "新闻检索";
  if (tool === "get_disclosed_event_context") return "披露事件检索";
  return "市场背景检索";
}

function fallbackEvidenceFromText(output: string, tool: AgentToolName, task: ResearchTask, capturedAt: string): EvidenceItem[] {
  if (!isRelevant(task, output)) return [];
  const seenDates = new Set<string>();
  const datePattern = /20\d{2}(?:[-/.]\d{1,2}[-/.]\d{1,2}|年\d{1,2}月\d{1,2}日)/g;
  return Array.from(output.matchAll(datePattern)).flatMap((match, index) => {
    const disclosedAt = normalizeDate(match[0]);
    const excerpt = output.slice(Math.max(0, (match.index ?? 0) - 180), (match.index ?? 0) + 300).replace(/\s+/g, " ").trim();
    if (!disclosedAt || disclosedAt > task.cutoffDate || seenDates.has(disclosedAt) || !isRelevant(task, excerpt)) return [];
    seenDates.add(disclosedAt);
    return [{
      id: `mcp-raw-${capturedAt}-${index}`,
      title: `${toolLabel(tool)}候选材料（待核验）`,
      publisher: "iFinD MCP 原始检索结果",
      sourceUrl: "",
      sourceLabel: "iFinD 原始检索片段 · 待补原文链接",
      sourceTier: "媒体报道" as const,
      contentKind: "事实" as const,
      occurredAt: disclosedAt,
      disclosedAt,
      capturedAt,
      updatedAt: capturedAt,
      quote: "",
      summary: excerpt.slice(0, 320),
      impact: "原始检索结果未提供可直达原文；仅作为候选时间线节点，不能改变正式结论。",
      statusEffect: "待人工核验" as const,
    }];
  }).slice(0, 6);
}

export function extractMcpEvidence(output: string, tool: AgentToolName, task: ResearchTask, capturedAt: string): EvidenceItem[] {
  const seen = new Set<string>();
  const structured = parsedDocuments(output).flatMap((document) => collectRecords(document)).flatMap((record, index) => {
    const title = recordValue(record, TITLE_KEYS);
    const disclosedAt = normalizeDate(recordValue(record, DATE_KEYS));
    const body = recordValue(record, BODY_KEYS);
    const combined = `${title}\n${body}`;
    if (!title || !disclosedAt || disclosedAt > task.cutoffDate || !isRelevant(task, combined, title)) return [];

    const candidateUrl = recordValue(record, URL_KEYS);
    const sourceUrl = isHttpsUrl(candidateUrl) ? candidateUrl : "";
    const publisher = recordValue(record, PUBLISHER_KEYS) || (tool === "search_event_notices" ? "iFinD 公告检索结果" : "iFinD 检索结果");
    const key = `${title}|${disclosedAt}|${sourceUrl}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `mcp-${capturedAt}-${index}`,
      title,
      publisher,
      sourceUrl,
      sourceLabel: sourceUrl ? "打开 iFinD 返回的原始链接" : "待补原文链接",
      sourceTier: sourceTier(publisher, sourceUrl),
      contentKind: "事实" as const,
      occurredAt: disclosedAt,
      disclosedAt,
      capturedAt,
      updatedAt: capturedAt,
      quote: body.slice(0, 180),
      summary: body.slice(0, 280) || "MCP 返回的候选材料，待 Agent 归并与原文核验。",
      impact: "候选证据，待 Agent 归并与原文核验。",
      statusEffect: "待人工核验" as const,
    }];
  });
  return structured.length > 0 ? structured : fallbackEvidenceFromText(output, tool, task, capturedAt);
}

function numberValue(record: UnknownRecord, keys: string[]) {
  const value = recordValue(record, keys).replace(/[,，%]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chineseNumber(value: string) {
  const match = value.replace(/[,，]/g, "").trim().match(/^(-?[\d.]+)\s*(万|亿)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return number * (match[2] === "亿" ? 100_000_000 : match[2] === "万" ? 10_000 : 1);
}

function textValues(value: unknown, values: string[] = []) {
  if (typeof value === "string") values.push(value);
  else if (Array.isArray(value)) value.forEach((item) => textValues(item, values));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => textValues(item, values));
  return values;
}

function marketPointsFromMarkdown(output: string, task: ResearchTask) {
  const documents = parsedDocuments(output);
  const texts = [...textValues(documents), output];
  const points: MarketPoint[] = [];
  const nonTradingDates: string[] = [];
  const seen = new Set<string>();
  let securityName = "";
  let securityCode = "";

  for (const text of texts) {
    const lines = text.split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => line.includes("|日期|") && line.includes("|收盘价|"));
    if (headerIndex < 0) continue;
    const headers = lines[headerIndex].split("|").map((cell) => cell.trim()).filter(Boolean);
    const dateIndex = headers.findIndex((header) => header === "日期");
    const closeIndex = headers.findIndex((header) => header === "收盘价");
    const nameIndex = headers.findIndex((header) => header === "证券简称");
    const codeIndex = headers.findIndex((header) => header === "证券代码");
    const changeIndex = headers.findIndex((header) => header.startsWith("涨跌幅"));
    const volumeIndex = headers.findIndex((header) => header === "成交量");
    const amountIndex = headers.findIndex((header) => header.startsWith("成交额"));
    if (dateIndex < 0 || closeIndex < 0) continue;

    for (const line of lines.slice(headerIndex + 2)) {
      if (!line.trim().startsWith("|")) break;
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      const date = normalizeDate(cells[dateIndex] ?? "");
      const close = chineseNumber(cells[closeIndex] ?? "");
      if (!date || date > task.cutoffDate || close === null || close <= 0 || seen.has(date)) continue;
      const changePct = changeIndex >= 0 ? chineseNumber(cells[changeIndex] ?? "") : null;
      const volume = volumeIndex >= 0 ? chineseNumber(cells[volumeIndex] ?? "") : null;
      const amount = amountIndex >= 0 ? chineseNumber(cells[amountIndex] ?? "") : null;
      // iFinD may list weekends and suspension dates with a carried-forward close
      // but no return, volume, or amount. They are not tradable market observations.
      if (changePct === null && volume === null && amount === null) {
        nonTradingDates.push(date);
        continue;
      }
      seen.add(date);
      securityName ||= nameIndex >= 0 ? cells[nameIndex] ?? "" : "";
      securityCode ||= codeIndex >= 0 ? cells[codeIndex] ?? "" : "";
      points.push({ date, close, ...(changePct === null ? {} : { changePct }), ...(volume === null ? {} : { volume }), ...(amount === null ? {} : { amount }) });
    }
  }
  return { points, nonTradingDates: [...new Set(nonTradingDates)], securityName, securityCode };
}

export function extractMarketSeries(output: string, task: ResearchTask, capturedAt: string): MarketSeries | undefined {
  const seen = new Set<string>();
  const structuredPoints = parsedDocuments(output).flatMap((document) => nestedRecords(document)).flatMap((record): MarketPoint[] => {
    const date = normalizeDate(recordValue(record, DATE_KEYS));
    const close = numberValue(record, CLOSE_KEYS);
    if (!date || date > task.cutoffDate || close === null || close <= 0 || seen.has(date)) return [];
    seen.add(date);
    const changePct = numberValue(record, CHANGE_KEYS);
    return [{ date, close, ...(changePct === null ? {} : { changePct }) }];
  }).sort((left, right) => left.date.localeCompare(right.date)).slice(-90);

  const markdown = marketPointsFromMarkdown(output, task);
  const points = structuredPoints.length >= 2 ? structuredPoints : markdown.points.sort((left, right) => left.date.localeCompare(right.date));
  const expected = primaryCompanyName(task);
  if (markdown.securityName && expected && !markdown.securityName.includes(expected) && !expected.includes(markdown.securityName)) return undefined;
  return points.length >= 2 ? { sourceLabel: "iFinD A股数据 MCP · 日频历史行情", ...(markdown.securityName ? { securityName: markdown.securityName } : {}), ...(markdown.securityCode ? { securityCode: markdown.securityCode } : {}), points, ...(markdown.nonTradingDates.length ? { nonTradingDates: markdown.nonTradingDates } : {}), capturedAt } : undefined;
}

export async function runIFindTool(tool: AgentToolName, task: ResearchTask): Promise<{ trace: AgentToolTrace; output: string; candidates: EvidenceItem[]; marketSeries?: MarketSeries }> {
  const call = toolCallsFor(task)[tool];
  const token = process.env.IFIND_MCP_TOKEN;
  const url = serverUrl(call.target);
  const capturedAt = new Date().toISOString();
  const source = call.target === "news" ? "iFinD 新闻公告 MCP" : "iFinD A股数据 MCP";

  if (!token || !url) {
    return { trace: { tool, source, status: "失败", capturedAt, summary: "未配置 iFinD MCP 环境变量，未查询外部数据。" }, output: "工具不可用：未配置 iFinD MCP。", candidates: [] };
  }

  const client = new Client({ name: "signaltrace-monitor", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: token } },
    onInsufficientScope: "throw",
  });

  try {
    await client.connect(transport, { timeout: 15_000 });
    const result = await client.callTool({ name: call.tool, arguments: call.arguments }, { timeout: 15_000 });
    const output = textFromResult(result.content);
    const candidates = extractMcpEvidence(output, tool, task, capturedAt);
    const marketSeries = tool === "get_historical_market_context" ? extractMarketSeries(output, task, capturedAt) : undefined;
    const marketSummary = marketSeries ? `；提取 ${marketSeries.points.length} 个日频行情点` : "";
    return { trace: { tool, source, status: "完成", capturedAt, summary: `${call.tool} 已返回 ${output.length} 字符的可审阅结果；代码提取 ${candidates.length} 条候选材料${marketSummary}。`, excerpt: resultExcerpt(output) }, output, candidates, marketSeries };
  } catch {
    return { trace: { tool, source, status: "失败", capturedAt, summary: "MCP 调用失败；本次不会据此生成正式结论。" }, output: "工具调用失败，未取得数据。", candidates: [] };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export const AGENT_TOOL_NAMES = ["search_event_notices", "search_related_news", "get_disclosed_event_context", "get_historical_market_context"] as AgentToolName[];
