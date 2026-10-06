import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import type { AgentToolName, AgentToolTrace, EvidenceItem, ResearchTask, SourceTier } from "@/lib/types";

type McpTarget = "stock" | "news";
type McpCall = { target: McpTarget; tool: string; arguments: Record<string, string | number> };

function historyStart(cutoffDate: string) {
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  return cutoff.toISOString().slice(0, 10);
}

function toolCallsFor(task: ResearchTask): Record<AgentToolName, McpCall> {
  const start = historyStart(task.cutoffDate);
  const query = `${task.companyQuery} ${task.eventQuery}`.trim();
  return {
  search_event_notices: {
    target: "news",
    tool: "search_notice",
    arguments: {
      query: `${query} 公告 进展`,
      time_start: start,
      time_end: task.cutoffDate,
      size: 5,
    },
  },
  search_related_news: {
    target: "news",
    tool: "search_news",
    arguments: {
      query,
      time_start: start,
      time_end: task.cutoffDate,
      size: 5,
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
    arguments: { query: `${task.companyQuery} 在${start}至${task.cutoffDate}的收盘价、涨跌幅、成交额日频历史行情，仅作同期市场背景` },
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
  return candidates.flatMap((candidate) => {
    try {
      return [JSON.parse(candidate) as unknown];
    } catch {
      return [];
    }
  });
}

function collectRecords(value: unknown, records: UnknownRecord[] = []): UnknownRecord[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecords(item, records));
  } else if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    if (recordValue(record, TITLE_KEYS) && recordValue(record, DATE_KEYS)) records.push(record);
    Object.values(record).forEach((item) => collectRecords(item, records));
  }
  return records;
}

function relevanceTerms(task: ResearchTask) {
  const specificTerms = task.eventQuery
    .replace(/并购|收购|吸收合并|合并|重组|换股|交易|事项|进展/g, " ")
    .split(/[\s、，,；;·×xX]+/)
    .filter((term) => term.length >= 2);
  if (specificTerms.length > 0) return [...new Set(specificTerms)];
  return task.eventQuery.split(/[\s、，,；;·×xX]+/).filter((term) => term.length >= 2);
}

function isRelevant(task: ResearchTask, text: string) {
  const terms = relevanceTerms(task);
  return text.includes(task.companyQuery) && terms.length > 0 && terms.every((term) => text.includes(term));
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
    const terms = relevanceTerms(task);
    const hasLocalSignal = excerpt.includes(task.companyQuery) || terms.some((term) => excerpt.includes(term));
    if (!disclosedAt || disclosedAt > task.cutoffDate || seenDates.has(disclosedAt) || !hasLocalSignal) return [];
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
    if (!title || !disclosedAt || disclosedAt > task.cutoffDate || !isRelevant(task, combined)) return [];

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

export async function runIFindTool(tool: AgentToolName, task: ResearchTask): Promise<{ trace: AgentToolTrace; output: string; candidates: EvidenceItem[] }> {
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
    return { trace: { tool, source, status: "完成", capturedAt, summary: `${call.tool} 已返回 ${output.length} 字符的可审阅结果；代码提取 ${candidates.length} 条候选材料。`, excerpt: resultExcerpt(output) }, output, candidates };
  } catch {
    return { trace: { tool, source, status: "失败", capturedAt, summary: "MCP 调用失败；本次不会据此生成正式结论。" }, output: "工具调用失败，未取得数据。", candidates: [] };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export const AGENT_TOOL_NAMES = ["search_event_notices", "search_related_news", "get_disclosed_event_context", "get_historical_market_context"] as AgentToolName[];
