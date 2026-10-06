import { describe, expect, it } from "vitest";
import { hasMinimumEvidence, nextState, sourceTierFromPublisher } from "./evidence";
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
  requiresReview: true,
  suggestedConclusion: "交易持续推进，尚未完成。",
};

describe("evidence governance", () => {
  it("recognizes official company material", () => {
    expect(sourceTierFromPublisher(material.publisher, material.sourceUrl)).toBe("交易所/公司公告");
    expect(hasMinimumEvidence(material, proposal)).toBe(true);
  });

  it("does not let an unsourced rumor overwrite an event state", () => {
    const rumor = { ...proposal, contentKind: "传闻" as const, proposedState: "已完成" as const };
    const unsourced = { ...material, publisher: "", sourceUrl: "" };
    expect(nextState("持续推进", rumor, unsourced)).toBe("待人工核验");
  });
});
