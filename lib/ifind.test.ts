import { describe, expect, it } from "vitest";

import { extractMcpEvidence } from "./ifind";

describe("MCP candidate evidence extraction", () => {
  it("keeps a dated, relevant, linked announcement and excludes future or unrelated records", () => {
    const output = JSON.stringify({
      data: [
        {
          title: "海光信息拟换股吸收合并中科曙光并募集配套资金暨关联交易预案",
          publish_date: "2025年6月10日",
          source_url: "https://star.sse.com.cn/disclosure/example.pdf",
          publisher: "上海证券交易所",
          summary: "海光信息拟换股吸收合并中科曙光，交易尚需履行相关程序。",
        },
        {
          title: "海光信息 2026 年年度报告",
          publish_date: "2026-12-31",
          source_url: "https://example.com/future",
          summary: "与本次吸收合并无关。",
        },
        {
          title: "海光信息关于员工持股计划的公告",
          publish_date: "2025-06-11",
          source_url: "https://example.com/unrelated",
          summary: "员工持股计划。",
        },
      ],
    });

    const evidence = extractMcpEvidence(output, "search_event_notices", {
      companyQuery: "海光信息",
      eventQuery: "中科曙光",
      cutoffDate: "2026-10-06",
    }, "2026-10-06T00:00:00.000Z");

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      disclosedAt: "2025-06-10",
      sourceTier: "交易所/公司公告",
      sourceUrl: "https://star.sse.com.cn/disclosure/example.pdf",
    });
  });

  it("does not upgrade an unlinked search snippet to an official source", () => {
    const output = JSON.stringify([{
      title: "海光信息吸收合并中科曙光进展报道",
      date: "2025/07/09",
      source: "财经媒体",
      summary: "海光信息与中科曙光的吸收合并仍在推进。",
    }]);

    const evidence = extractMcpEvidence(output, "search_related_news", {
      companyQuery: "海光信息",
      eventQuery: "中科曙光",
      cutoffDate: "2026-10-06",
    }, "2026-10-06T00:00:00.000Z");

    expect(evidence[0]).toMatchObject({ sourceTier: "媒体报道", sourceUrl: "", sourceLabel: "待补原文链接" });
  });

  it("keeps dated raw MCP text as an explicitly unverified candidate when JSON parsing is unavailable", () => {
    const output = "2025年6月10日 海光信息披露拟换股吸收合并中科曙光的交易预案。后续尚需履行相关程序。";
    const evidence = extractMcpEvidence(output, "search_event_notices", {
      companyQuery: "海光信息",
      eventQuery: "中科曙光",
      cutoffDate: "2026-10-06",
    }, "2026-10-06T00:00:00.000Z");

    expect(evidence[0]).toMatchObject({
      disclosedAt: "2025-06-10",
      title: "公告检索候选材料（待核验）",
      sourceLabel: "iFinD 原始检索片段 · 待补原文链接",
    });
  });

  it("maps iFinD Chinese news fields into a readable candidate with its direct link", () => {
    const output = JSON.stringify({ data: [{
      "资讯标题": "宁德时代收购耀宁新能源资产",
      "资讯内容": "重庆耀宁新能源相关资产将由宁德时代收购，交易仍需关注后续披露。",
      "日期": "2026-09-14",
      "URL": "https://mp.weixin.qq.com/s/example",
      "资讯来源": "财经媒体",
    }] });
    const evidence = extractMcpEvidence(output, "search_related_news", {
      companyQuery: "宁德时代",
      eventQuery: "收购耀宁",
      cutoffDate: "2026-10-06",
    }, "2026-10-06T00:00:00.000Z");

    expect(evidence[0]).toMatchObject({
      title: "宁德时代收购耀宁新能源资产",
      sourceUrl: "https://mp.weixin.qq.com/s/example",
      publisher: "财经媒体",
    });
  });
});
