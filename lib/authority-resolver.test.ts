import { describe, expect, it } from "vitest";

import { resolveAuthoritySources } from "./authority-resolver";
import type { EvidenceItem, ResearchTask } from "./types";

const task: ResearchTask = {
  companyQuery: "海光信息、中科曙光",
  eventQuery: "换股吸收合并",
  cutoffDate: "2025-06-17",
};

const evidence: EvidenceItem = {
  id: "candidate-1",
  title: "换股吸收合并中科曙光并募集配套资金暨关联交易预案",
  publisher: "iFinD 检索结果",
  sourceUrl: "",
  sourceTier: "媒体报道",
  contentKind: "事实",
  occurredAt: "2025-06-06",
  disclosedAt: "2025-06-10",
  capturedAt: "2025-06-10T09:00:00.000Z",
  updatedAt: "2025-06-10T09:00:00.000Z",
  quote: "",
  summary: "海光信息披露换股吸收合并中科曙光的交易预案。",
  impact: "",
};

describe("authority source resolver", () => {
  it("attaches a matched exchange original after content verification", async () => {
    const originalUrl = "https://star.sse.com.cn/disclosure/listedinfo/announcement/c/new/2025-06-10/688041.pdf";
    const client = {
      search: async () => ({ results: [{ url: originalUrl, title: evidence.title, highlights: ["2025-06-10 公告"] }] }),
      getContents: async () => ({ results: [{ url: originalUrl, title: evidence.title, text: "2025-06-10 海光信息披露换股吸收合并中科曙光并募集配套资金暨关联交易预案。" }] }),
    };

    const resolved = await resolveAuthoritySources(task, [evidence], { client });

    expect(resolved.evidence[0]).toMatchObject({
      sourceUrl: originalUrl,
      sourceTier: "交易所/公司公告",
      publisher: "上海证券交易所披露",
      sourceLabel: "Exa 已核验匹配的权威原文",
      reviewOutcome: "已自动核验",
    });
    expect(resolved.trace.summary).toContain("1 条候选材料");
  });

  it("does not promote a media page even when Exa returns it", async () => {
    const client = {
      search: async () => ({ results: [{ url: "https://finance.example.com/article", title: evidence.title, highlights: ["2025-06-10"] }] }),
      getContents: async () => ({ results: [] }),
    };

    const resolved = await resolveAuthoritySources(task, [evidence], { client });

    expect(resolved.evidence[0].sourceUrl).toBe("");
    expect(resolved.evidence[0].sourceTier).toBe("媒体报道");
  });

  it("skips safely when Exa is not configured", async () => {
    const resolved = await resolveAuthoritySources(task, [evidence], { apiKey: "" });

    expect(resolved.evidence).toEqual([evidence]);
    expect(resolved.trace.status).toBe("跳过");
  });
});
