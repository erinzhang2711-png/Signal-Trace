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
  reviewOutcome?: "支持当前结论" | "待人工核验" | "已保留候选" | "更正旧结论" | "已过期";
};

export type MarketReaction = {
  evidenceId: string;
  status: "停牌中" | "已观察" | "待补充";
  windowLabel: string;
  stockMoves: Array<{ label: string; returnPct: number; note?: string }>;
  benchmark?: { label: string; returnPct: number };
  followThrough?: string;
  observation: string;
  caveat: string;
  sources: Array<{ label: string; url?: string }>;
};

export type VersionKind = "首次披露" | "更新" | "更正" | "否认";

export type EventVersion = {
  id: string;
  createdAt: string;
  state: EventState;
  conclusion: string;
  changeReason: string;
  evidenceIds: string[];
  kind?: VersionKind;
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

export type MarketPoint = {
  date: string;
  close: number;
  changePct?: number;
  volume?: number;
  amount?: number;
};

export type MarketSeries = {
  sourceLabel: string;
  securityName?: string;
  securityCode?: string;
  points: MarketPoint[];
  nonTradingDates?: string[];
  capturedAt: string;
};

export type TimelineStage = "筹划与首次披露" | "方案审议" | "监管审核" | "交易实施" | "完成后整合" | "后续进展";

export type TimelineGroup = {
  id: string;
  stage: TimelineStage;
  dateLabel: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  sourceCount: number;
  representativeEvidenceId: string;
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
  marketSeries?: MarketSeries;
  eventName?: string;
  timelineGroups?: TimelineGroup[];
};

export type ResearchTask = {
  companyQuery: string;
  eventQuery: string;
  cutoffDate: string;
};
