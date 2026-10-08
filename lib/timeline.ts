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

function entityFromText(text: string, hint = "") {
  const scopes = [...text.split(/收购|并购/).slice(1), text];
  const entities = scopes.flatMap((scope) => scope.match(/[\u4e00-\u9fa5]{2,}(?:新能源科技|新能源|科技)?(?:股份|有限责任)?公司/g) ?? []);
  return entities.find((entity) => hint && entity.includes(hint)) ?? entities.find((entity) => !/收购|并购/.test(entity)) ?? "";
}

export function canonicalEventName(task: ResearchTask, evidence: EvidenceItem[] = []) {
  const names = companies(task.companyQuery);
  const lead = names[0] ?? task.companyQuery.trim();
  const event = task.eventQuery.trim();
  if (names.length >= 2 && /换股|吸收合并|合并/.test(event)) return `${names[0]}与${names[1]}换股吸收合并`;
  if (/收购|并购/.test(event)) {
    const targetHint = event.replace(/.*?(收购|并购)/, "").trim();
    const sourceText = evidence.map((item) => `${item.title} ${item.summary} ${item.quote}`).join(" ");
    const target = entityFromText(sourceText, targetHint);
    return `${lead}${event.includes("收购") ? "收购" : "并购"}${target ? `${target}股权案` : targetHint || "事项"}`;
  }
  return `${lead}${event ? ` · ${event}` : "重大事件"}`;
}

export function timelineStage(item: EvidenceItem): TimelineStage {
  const text = `${item.title} ${item.summary} ${item.quote}`;
  if (/(终止筹划|终止本次|终止.*(重组|合并|交易)|项目终止|不再推进|撤回.*(重组|合并|交易))/.test(text) && !/终止上市/.test(text)) return "后续进展";
  if (/更名|管理层|整合|组织架构|业务协同|首席|新任|总裁|董事长|迎新/.test(text)) return "完成后整合";
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

function milestoneKey(item: EvidenceItem, stage: TimelineStage) {
  const text = `${item.title} ${item.summary} ${item.quote}`;
  if (/(终止筹划|终止本次|终止.*(重组|合并|交易)|项目终止|不再推进|撤回.*(重组|合并|交易))/.test(text) && !/终止上市/.test(text)) return `${stage}|terminated`;
  if (/新任.*总裁|总裁.*敲定|迎新总裁|聘任.*总裁/.test(text)) return `${stage}|management-president`;
  if (/管理层|董事长|总经理|人事/.test(text)) return `${stage}|management`;
  if (/更名|证券简称|公司名称/.test(text)) return `${stage}|rename`;
  if (/换股实施|交割|终止上市|实施完成|完成.*合并/.test(text)) return `${stage}|completion`;
  if (/证监会|注册|核准|经营者集中|审核通过/.test(text)) return `${stage}|approval`;
  if (/预案|重组报告书|董事会|股东大会|股东会/.test(text)) return `${stage}|proposal`;
  // Do not merge all entries in a calendar month: adjacent disclosures may be
  // distinct milestones. Exact-date entries are the conservative dedupe boundary.
  return `${stage}|${item.disclosedAt}`;
}

export function buildTimelineGroups(evidence: EvidenceItem[]): TimelineGroup[] {
  const grouped = new Map<string, EvidenceItem[]>();
  for (const item of [...evidence].sort((left, right) => left.disclosedAt.localeCompare(right.disclosedAt))) {
    const stage = timelineStage(item);
    const key = milestoneKey(item, stage);
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
      // Candidate timelines must never turn keyword matches into a new factual
      // headline. Keep the visible title traceable to the selected material.
      title: concise(representative.title),
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
