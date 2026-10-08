import { describe, expect, it } from "vitest";
import { evidenceFromImport, hasMinimumEvidence, nextState, sourceTierFromPublisher } from "./evidence";
import type { AgentProposal, ImportedMaterial } from "./types";

const material: ImportedMaterial = {
  title: "关于重大资产重组的进展公告",
  publisher: "中科曙光 · 公司公告",
  sourceUrl: "https://www.sugon.com/investor/affiche",
  disclosedAt: "2025-09-06",
  body: "公司披露本次交易尚需履行股东会审议、经营者集中审查、交易所审核和证监会注册等程序后方可实施。",
};

const proposal: AgentProposal = {
  eventMatch: "同一事件",
  contentKind: "事实",
  proposedState: "持续推进",
  confidence: "高",
  claim: "交易仍在推进，尚未完成。",
  quote: "尚需履行相关程序后方可实施。",
  conflict: null,
  rationale: "公司公告重申待履行程序。",
  requiresReview: false,
  suggestedConclusion: "交易持续推进，尚未完成。",
};

describe("evidence governance", () => {
  it("recognizes official company material", () => {
    expect(sourceTierFromPublisher(material.publisher, material.sourceUrl)).toBe("公司投资者关系");
    expect(hasMinimumEvidence(material, proposal)).toBe(true);
  });

  it("does not let an unsourced rumor overwrite an event state", () => {
    const rumor = { ...proposal, contentKind: "传闻" as const, proposedState: "已完成" as const };
    const unsourced = { ...material, publisher: "", sourceUrl: "" };
    expect(nextState("持续推进", rumor, unsourced)).toBe("待人工核验");
  });

  it("keeps an Agent draft in review when the Agent requests review", () => {
    expect(nextState("持续推进", { ...proposal, requiresReview: true }, material)).toBe("待人工核验");
  });

  it("does not let a media URL establish a formal event state", () => {
    const mediaMaterial = { ...material, publisher: "某财经媒体", sourceUrl: "https://news.example.com/event" };
    expect(nextState("持续推进", proposal, mediaMaterial)).toBe("待人工核验");
  });

  it("requires an exchange announcement to mark an event completed", () => {
    const completed = { ...proposal, proposedState: "已完成" as const };
    expect(nextState("持续推进", completed, material)).toBe("待人工核验");
  });

  it("allows a sourced official update to establish a formal event state", () => {
    expect(nextState("待人工核验", proposal, material)).toBe("持续推进");
  });

  it("records a quarantined outcome for evidence that cannot change the event", () => {
    const rumor = { ...proposal, contentKind: "传闻" as const, proposedState: "已完成" as const };
    const unsourced = { ...material, publisher: "", sourceUrl: "" };
    const item = evidenceFromImport(unsourced, rumor, nextState("持续推进", rumor, unsourced));
    expect(item.reviewOutcome).toBe("待人工核验");
    expect(item.statusEffect).toBe("待人工核验");
  });
});
