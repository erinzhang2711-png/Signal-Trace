import type { AgentProposal, EvidenceItem, EventState, ImportedMaterial, SourceTier } from "@/lib/types";

export const SOURCE_RANK: Record<SourceTier, number> = {
  "交易所/公司公告": 4,
  "公司投资者关系": 3,
  "媒体报道": 2,
  "用户导入": 1,
};

export function sourceTierFromPublisher(publisher: string, sourceUrl: string): SourceTier {
  const value = `${publisher} ${sourceUrl}`.toLowerCase();
  if (value.includes("sse.com") || value.includes("cninfo") || value.includes("公告") || value.includes("证券交易所")) {
    return "交易所/公司公告";
  }
  if (value.includes("investor") || value.includes("投资者") || value.includes("ir")) return "公司投资者关系";
  if (sourceUrl.startsWith("http")) return "媒体报道";
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
  if (!hasMinimumEvidence(material, proposal) || proposal.eventMatch === "无法确认") return "待人工核验";
  if (proposal.contentKind === "传闻" || tier === "用户导入") return "待人工核验";
  if (proposal.proposedState === "已否认" && SOURCE_RANK[tier] < SOURCE_RANK["交易所/公司公告"]) return "待人工核验";
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
  };
}
