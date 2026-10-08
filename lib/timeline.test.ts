import { describe, expect, it } from "vitest";

import { buildTimelineGroups, canonicalEventName, timelineStage } from "./timeline";
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

  it("expands an acquisition keyword using the evidence-grounded target entity", () => {
    expect(canonicalEventName({ companyQuery: "宁德时代 300750", eventQuery: "收购耀宁", cutoffDate: "2026-10-08" }, [
      item("a", "2026-09-12", "宁德时代收购重庆耀宁新能源科技有限公司股权案获批"),
    ])).toBe("宁德时代收购重庆耀宁新能源科技有限公司股权案");
  });

  it("keeps distinct disclosures while grouping a concrete management milestone", () => {
    const groups = buildTimelineGroups([
      item("a", "2024-09-05", "国泰君安筹划吸收合并海通证券"),
      item("b", "2024-09-06", "媒体报道国泰君安筹划吸收合并海通证券"),
      item("c", "2025-03-14", "换股实施完成，海通证券终止上市"),
      item("d", "2025-06-12", "国泰海通资管新任总裁敲定"),
      item("e", "2025-06-13", "国泰海通资管迎新总裁"),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toMatchObject({ stage: "筹划与首次披露", sourceCount: 1 });
    expect(groups[3]).toMatchObject({ stage: "完成后整合", sourceCount: 2, title: "国泰海通资管新任总裁敲定" });
  });

  it("retains every evidence id in a grouped stage so the UI can show every source", () => {
    const groups = buildTimelineGroups([
      { ...item("official", "2025-03-14", "换股实施完成，海通证券终止上市"), publisher: "上交所", sourceUrl: "https://example.com/official" },
      { ...item("coverage", "2025-03-14", "媒体报道换股实施完成"), publisher: "媒体", sourceUrl: "https://example.com/coverage" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ sourceCount: 2, evidenceIds: ["official", "coverage"] });
  });

  it("does not describe a terminated transaction as completed", () => {
    const terminated = item("terminated", "2025-12-12", "海光信息吸收合并中科曙光项目终止为鉴");
    expect(timelineStage(terminated)).toBe("后续进展");
    expect(buildTimelineGroups([terminated])[0]).toMatchObject({ title: "海光信息吸收合并中科曙光项目终止为鉴" });
  });
});
