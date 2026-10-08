import { describe, expect, it } from "vitest";

import { buildTimelineGroups, canonicalEventName } from "./timeline";
import type { EvidenceItem } from "./types";

const item = (id: string, date: string, title: string, summary = title): EvidenceItem => ({
  id, title, summary, quote: "", publisher: "测试来源", sourceUrl: "", sourceTier: "媒体报道", contentKind: "事实",
  occurredAt: date, disclosedAt: date, capturedAt: date, updatedAt: date, impact: "",
});

describe("event lifecycle timeline", () => {
  it("creates a canonical name instead of echoing a keyword pile", () => {
    expect(canonicalEventName({ companyQuery: "国泰君安 601211、海通证券 600837", eventQuery: "合并", cutoffDate: "2026-10-08" }))
      .toBe("国泰君安与海通证券换股吸收合并");
  });

  it("merges duplicate coverage in one stage and keeps later lifecycle stages", () => {
    const groups = buildTimelineGroups([
      item("a", "2024-09-05", "国泰君安筹划吸收合并海通证券"),
      item("b", "2024-09-06", "媒体报道国泰君安筹划吸收合并海通证券"),
      item("c", "2025-03-14", "换股实施完成，海通证券终止上市"),
      item("d", "2025-06-12", "国泰海通管理层完成整合"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ stage: "筹划与首次披露", sourceCount: 2 });
    expect(groups[2]).toMatchObject({ stage: "完成后整合" });
  });
});
