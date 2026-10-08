import type { EvidenceItem, ResearchTask, TimelineGroup, TimelineStage } from "@/lib/types";

const STAGE_LABELS: Record<TimelineStage, string> = {
  "筹划与首次披露": "筹划与首次披露",
  "方案审议": "方案披露与审议",
  "监管审核": "监管审核与批准",
  "交易实施": "交易实施与完成",
  "完成后整合": "完成后整合",
  "后续进展": "后续进展",
};

function companies(companyQuery: string) {
  return companyQuery
    .split(/[、，,]/)
    .map((part) => part.replace(/\b\d{6}\b/g, "").match(/[\u4e00-\u9fa5]{2,}|[A-Za-z][A-Za-z .&-]{1,}/)?.[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function canonicalEventName(task: ResearchTask) {
  const names = companies(task.companyQuery);
  const lead = names[0] ?? task.companyQuery.trim();
  const event = task.eventQuery.trim();
  if (names.length >= 2 && /换股|吸收合并|合并/.test(event)) return `${names[0]}与${names[1]}换股吸收合并`;
  if (/收购|并购/.test(event)) return `${lead}${event.includes("收购") ? "收购" : "并购"}${event.replace(/.*?(收购|并购)/, "").trim() || "事项"}`;
  return `${lead}${event ? ` · ${event}` : "重大事件"}`;
}

export function timelineStage(item: EvidenceItem): TimelineStage {
  const text = `${item.title} ${item.summary} ${item.quote}`;
  if (/更名|管理层|整合|组织架构|业务协同|首席|新任/.test(text)) return "完成后整合";
  if (/换股实施|交割|完成.*合并|实施完成|终止上市|登记完成|交割完成/.test(text)) return "交易实施";
  if (/证监会|注册|核准|经营者集中|市场监管总局|审核通过|并购重组委|交易所审核/.test(text)) return "监管审核";
  if (/预案|重组报告书|董事会|股东大会|股东会|审议通过|草案/.test(text)) return "方案审议";
  if (/筹划|停牌|首次披露|提示性公告|拟.*(收购|合并|重组)/.test(text)) return "筹划与首次披露";
  return "后续进展";
}

function concise(text: string) {
  const normalized = text.replace(/\s+/g, " ").replace(/\\[nrt]/g, " ").trim();
  const sentence = normalized.split(/[。；;]/)[0]?.trim() || normalized;
  return sentence.length > 94 ? `${sentence.slice(0, 93)}…` : sentence;
}

export function buildTimelineGroups(evidence: EvidenceItem[]): TimelineGroup[] {
  const grouped = new Map<string, EvidenceItem[]>();
  for (const item of [...evidence].sort((left, right) => left.disclosedAt.localeCompare(right.disclosedAt))) {
    const stage = timelineStage(item);
    // Same stage in the same calendar month is usually duplicate coverage of one milestone;
    // retaining different months preserves the event's lifecycle evolution.
    const key = `${stage}|${item.disclosedAt.slice(0, 7)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return [...grouped.entries()].map(([key, items]) => {
    const stage = key.split("|")[0] as TimelineStage;
    const representative = [...items].sort((left, right) => {
      const leftScore = Number(Boolean(left.sourceUrl)) + Number(left.sourceTier === "交易所/公司公告");
      const rightScore = Number(Boolean(right.sourceUrl)) + Number(right.sourceTier === "交易所/公司公告");
      return rightScore - leftScore;
    })[0];
    const first = items[0].disclosedAt;
    const last = items[items.length - 1].disclosedAt;
    return {
      id: `stage-${key}`,
      stage,
      dateLabel: first === last ? first : `${first} 至 ${last}`,
      summary: concise(representative.summary || representative.quote || representative.title),
      evidenceIds: items.map((item) => item.id),
      sourceCount: new Set(items.map((item) => item.sourceUrl || `${item.publisher}:${item.title}`)).size,
      representativeEvidenceId: representative.id,
    };
  }).sort((left, right) => left.dateLabel.localeCompare(right.dateLabel));
}

export function timelineStageLabel(stage: TimelineStage) {
  return STAGE_LABELS[stage];
}
