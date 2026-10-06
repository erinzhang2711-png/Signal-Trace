import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import type { AgentToolName, AgentToolTrace, ResearchTask } from "@/lib/types";

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

export async function runIFindTool(tool: AgentToolName, task: ResearchTask): Promise<{ trace: AgentToolTrace; output: string }> {
  const call = toolCallsFor(task)[tool];
  const token = process.env.IFIND_MCP_TOKEN;
  const url = serverUrl(call.target);
  const capturedAt = new Date().toISOString();
  const source = call.target === "news" ? "iFinD 新闻公告 MCP" : "iFinD A股数据 MCP";

  if (!token || !url) {
    return { trace: { tool, source, status: "失败", capturedAt, summary: "未配置 iFinD MCP 环境变量，未查询外部数据。" }, output: "工具不可用：未配置 iFinD MCP。" };
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
    return { trace: { tool, source, status: "完成", capturedAt, summary: `${call.tool} 已返回 ${output.length} 字符的可审阅结果。` }, output };
  } catch {
    return { trace: { tool, source, status: "失败", capturedAt, summary: "MCP 调用失败；本次不会据此生成正式结论。" }, output: "工具调用失败，未取得数据。" };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export const AGENT_TOOL_NAMES = ["search_event_notices", "search_related_news", "get_disclosed_event_context", "get_historical_market_context"] as AgentToolName[];
