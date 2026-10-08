import { describe, expect, it } from "vitest";

import { companyQueryForTargets, parseResearchTargets, RESEARCH_TARGETS, serializeResearchTargets, targetSuggestions } from "./research-targets";

describe("research targets", () => {
  it("keeps merger predecessors as historical entities instead of current tickers", () => {
    const guotaiJunan = RESEARCH_TARGETS.find((target) => target.name === "国泰君安");
    const haitong = RESEARCH_TARGETS.find((target) => target.name === "海通证券");
    expect(guotaiJunan).toMatchObject({ status: "历史主体", successor: "国泰海通（601211.SH）" });
    expect(haitong).toMatchObject({ status: "已退市", successor: "国泰海通（601211.SH）" });
  });

  it("returns a query made of company entities, not stale codes", () => {
    expect(companyQueryForTargets(targetSuggestions("海通证券"))).toBe("海通证券");
  });

  it("preserves selected codes for display without adding them to the search query", () => {
    const selected = targetSuggestions("国泰君安");
    expect(companyQueryForTargets(selected)).toBe("国泰君安");
    expect(parseResearchTargets(serializeResearchTargets(selected), "国泰君安")[0]).toMatchObject({ name: "国泰君安", code: "原 601211.SH" });
  });
});
