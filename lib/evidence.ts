import type { AgentProposal, EvidenceItem, EventState, ImportedMaterial, SourceTier } from "@/lib/types";

export const SOURCE_RANK: Record<SourceTier, number> = {
  "交易所/公司公告": 4,
  "公司投资者关系": 3,
  "媒体报道": 2,
  "用户导入": 1,
};

function sourceHost(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" ? url.hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function isExchangeHost(host: string) {
  return host === "sse.com.cn" || host.endsWith(".sse.com.cn") || host === "cninfo.com.cn" || host.endsWith(".cninfo.com.cn") || host === "szse.cn" || host.endsWith(".szse.cn");
}

function isInvestorRelationsUrl(sourceUrl: string, host: string) {
  try {
    const path = new URL(sourceUrl).pathname.toLowerCase();
    return host.startsWith("ir.") || host.includes("investor") || path.includes("/investor") || path.includes("/ir/");
  } catch {
    return false;
  }
}

export function sourceTierFromPublisher(publisher: string, sourceUrl: string): SourceTier {
  const host = sourceHost(sourceUrl);
  if (!host) return "用户导入";
  if (isExchangeHost(host)) return "交易所/公司公告";
  if (isInvestorRelationsUrl(sourceUrl, host)) return "公司投资者关系";
  if (publisher.trim()) return "媒体报道";
  return "用户导入";
}

export function hasMinimumEvidence(material: ImportedMaterial, proposal: AgentProposal): boolean {
  return Boolean(
    material.title.trim() &&
      material.disclosedAt &&
      material.body.trim().length >= 30 &&
      proposal.quote.trim().length >= 8 &&
      proposal.claim.trim().length >= 8,
  );
}

export function nextState(current: EventState, proposal: AgentProposal, material: ImportedMaterial): EventState {
  const tier = sourceTierFromPublisher(material.publisher, material.sourceUrl);
  const formalSource = tier === "交易所/公司公告" || tier === "公司投资者关系";
  if (!hasMinimumEvidence(material, proposal) || proposal.requiresReview || proposal.eventMatch !== "同一事件") return "待人工核验";
  if (proposal.contentKind !== "事实" || !formalSource) return "待人工核验";
  if (proposal.proposedState === "已否认" && SOURCE_RANK[tier] < SOURCE_RANK["交易所/公司公告"]) return "待人工核验";
  if (proposal.proposedState === "已完成" && SOURCE_RANK[tier] < SOURCE_RANK["交易所/公司公告"]) return "待人工核验";
  return proposal.proposedState || current;
}

export function evidenceFromImport(material: ImportedMaterial, proposal: AgentProposal, state: EventState): EvidenceItem {
  const tier = sourceTierFromPublisher(material.publisher, material.sourceUrl);
  const now = new Date().toISOString();
  return {
    id: `import-${Date.now()}`,
    title: material.title,
    publisher: material.publisher || "用户导入材料",
    sourceUrl: material.sourceUrl,
    sourceTier: tier,
    contentKind: proposal.contentKind,
    occurredAt: material.disclosedAt,
    disclosedAt: material.disclosedAt,
    capturedAt: now,
    updatedAt: now,
    quote: proposal.quote,
    summary: proposal.claim,
    impact: proposal.rationale,
    statusEffect: state,
    reviewOutcome: state === "待人工核验" ? "待人工核验" : "支持当前结论",
  };
}
