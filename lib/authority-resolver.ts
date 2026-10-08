import Exa from "exa-js";

import { sourceTierFromPublisher } from "./evidence";
import type { AgentToolTrace, EvidenceItem, ResearchTask, SourceTier } from "./types";

const EXCHANGE_DOMAINS = ["sse.com.cn", "cninfo.com.cn", "szse.cn"];

type SearchResult = {
  url?: string;
  title?: string;
  highlights?: string[];
  text?: string;
};

type AuthoritySearchClient = {
  search: (query: string, options: Record<string, unknown>) => Promise<{ results?: SearchResult[] }>;
  getContents: (urls: string[], options: Record<string, unknown>) => Promise<{ results?: SearchResult[] }>;
};

export type AuthorityResolution = {
  evidence: EvidenceItem[];
  trace: AgentToolTrace;
};

function officialTier(url: string): SourceTier | null {
  const tier = sourceTierFromPublisher("", url);
  return tier === "交易所/公司公告" || tier === "公司投资者关系" ? tier : null;
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function searchText(result: SearchResult) {
  return [result.title, result.text, ...(result.highlights ?? [])].filter(Boolean).join(" ");
}

function titleTokens(value: string) {
  return [...new Set(value.match(/[\u4e00-\u9fff]{2,}|[A-Za-z0-9]{2,}/g) ?? [])].map((token) => token.toLowerCase());
}

function matchesCandidate(item: EvidenceItem, result: SearchResult) {
  const content = searchText(result).toLowerCase();
  const tokens = titleTokens(item.title);
  const matches = tokens.filter((token) => content.includes(token)).length;
  const dateMatches = content.includes(item.disclosedAt.replaceAll("-", "")) || content.includes(item.disclosedAt);
  return matches >= Math.min(2, tokens.length) && (dateMatches || matches >= Math.min(4, tokens.length));
}

function originalQuote(result: SearchResult) {
  const content = [result.text, ...(result.highlights ?? [])]
    .filter((value): value is string => typeof value === "string" && value.trim().length >= 30)
    .map((value) => value.replace(/\s+/g, " ").trim())[0];
  return content ? content.slice(0, 280) : "";
}

function candidateQuery(task: ResearchTask, item: EvidenceItem) {
  return `"${item.title}" ${task.companyQuery} ${task.eventQuery} ${item.disclosedAt} 公告`;
}

function authorityPublisher(url: string, tier: SourceTier) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.endsWith("sse.com.cn")) return "上海证券交易所披露";
  if (host.endsWith("cninfo.com.cn")) return "巨潮资讯披露";
  if (host.endsWith("szse.cn")) return "深圳证券交易所披露";
  return tier === "公司投资者关系" ? "公司投资者关系原文" : "权威公告原文";
}

async function findAuthoritySource(client: AuthoritySearchClient, task: ResearchTask, item: EvidenceItem) {
  const query = candidateQuery(task, item);
  const exchangeSearch = await client.search(query, {
    numResults: 5,
    includeDomains: EXCHANGE_DOMAINS,
    contents: { highlights: true, text: true },
  });
  const exchangeCandidate = (exchangeSearch.results ?? []).find((result) => isHttpsUrl(result.url) && officialTier(result.url) === "交易所/公司公告" && matchesCandidate(item, result));
  const broadSearch = exchangeCandidate ? { results: [exchangeCandidate] } : await client.search(query, {
    numResults: 5,
    contents: { highlights: true, text: true },
  });
  const result = (broadSearch.results ?? []).find((value) => isHttpsUrl(value.url) && Boolean(officialTier(value.url)) && matchesCandidate(item, value));
  if (!result?.url) return null;

  const original = await client.getContents([result.url], { text: true, highlights: true });
  const originalResult = original.results?.[0];
  const quote = originalResult ? originalQuote(originalResult) : "";
  if (!originalResult || !quote || !matchesCandidate(item, originalResult)) return null;
  const tier = officialTier(result.url);
  return tier ? { url: result.url, tier, quote } : null;
}

export async function resolveAuthoritySources(
  task: ResearchTask,
  evidence: EvidenceItem[],
  options: { client?: AuthoritySearchClient; apiKey?: string } = {},
): Promise<AuthorityResolution> {
  const capturedAt = new Date().toISOString();
  const apiKey = options.apiKey ?? process.env.EXA_API_KEY;
  if (!options.client && !apiKey) {
    return { evidence, trace: { tool: "resolve_authority_sources", source: "Exa 权威原文检索", status: "跳过", capturedAt, summary: "未配置 EXA_API_KEY，未执行权威原文自动补链。" } };
  }

  const client = options.client ?? new Exa(apiKey!) as unknown as AuthoritySearchClient;
  let resolved = 0;
  const output: EvidenceItem[] = [];
  for (const item of evidence) {
    if (officialTier(item.sourceUrl)) {
      output.push(item);
      continue;
    }
    try {
      const authority = await findAuthoritySource(client, task, item);
      if (!authority) {
        output.push(item);
        continue;
      }
      resolved += 1;
      output.push({ ...item, publisher: authorityPublisher(authority.url, authority.tier), sourceUrl: authority.url, sourceLabel: "Exa 已核验匹配的权威原文", sourceTier: authority.tier, quote: authority.quote, reviewOutcome: "已自动核验", updatedAt: capturedAt });
    } catch {
      output.push(item);
    }
  }

  return {
    evidence: output,
    trace: {
      tool: "resolve_authority_sources",
      source: "Exa 权威原文检索",
      status: "完成",
      capturedAt,
      summary: resolved ? `已为 ${resolved} 条候选材料匹配并核验权威原文，已自动写入证据时间线。` : "未找到可同时匹配标题、日期、正文与官方域名的权威原文；候选材料保持原状。",
    },
  };
}
