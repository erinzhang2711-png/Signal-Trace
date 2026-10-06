export type ContentKind = "事实" | "观点" | "推测" | "传闻";
export type SourceTier = "交易所/公司公告" | "公司投资者关系" | "媒体报道" | "用户导入";
export type EventState = "筹划中" | "预案披露" | "持续推进" | "待人工核验" | "已否认" | "已完成";

export type EvidenceItem = {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  sourceLabel?: string;
  sourceTier: SourceTier;
  contentKind: ContentKind;
  occurredAt: string;
  disclosedAt: string;
  capturedAt: string;
  updatedAt: string;
  quote: string;
  summary: string;
  impact: string;
  statusEffect?: EventState;
};

export type EventVersion = {
  id: string;
  createdAt: string;
  state: EventState;
  conclusion: string;
  changeReason: string;
  evidenceIds: string[];
};

export type ImportedMaterial = {
  title: string;
  publisher: string;
  sourceUrl: string;
  disclosedAt: string;
  body: string;
};

export type AgentProposal = {
  eventMatch: "同一事件" | "可能相关" | "无法确认";
  contentKind: ContentKind;
  proposedState: EventState;
  confidence: "高" | "中" | "低";
  claim: string;
  quote: string;
  conflict: string | null;
  rationale: string;
  requiresReview: boolean;
  suggestedConclusion: string;
};

export type AgentToolName =
  | "search_event_notices"
  | "search_related_news"
  | "get_disclosed_event_context"
  | "get_historical_market_context";

export type AgentRunStatus = "运行中" | "待用户确认" | "无状态变化" | "待人工核验" | "失败";

export type AgentToolTrace = {
  tool: AgentToolName;
  source: "iFinD 新闻公告 MCP" | "iFinD A股数据 MCP";
  status: "完成" | "失败" | "跳过";
  capturedAt: string;
  summary: string;
  excerpt?: string;
};

export type AgentRun = {
  id: string;
  status: AgentRunStatus;
  startedAt: string;
  endedAt: string;
  stopReason: string;
  toolCalls: AgentToolTrace[];
  proposal: AgentProposal | null;
  evidence?: EvidenceItem[];
};

export type ResearchTask = {
  companyQuery: string;
  eventQuery: string;
  cutoffDate: string;
};
