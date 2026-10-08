import { describe, expect, it } from "vitest";

import { extractMarketSeries, extractMcpEvidence } from "./ifind";

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

  it("matches a company name when the user also supplies its stock code", () => {
    const output = JSON.stringify({ data: [{
      title: "宁德时代收购耀宁新能源资产",
      summary: "宁德时代拟收购耀宁新能源资产，交易仍需后续披露。",
      date: "2026-09-14",
      url: "https://example.com/notice",
      publisher: "财经媒体",
    }] });

    const evidence = extractMcpEvidence(output, "search_related_news", {
      companyQuery: "宁德时代 300750",
      eventQuery: "收购耀宁",
      cutoffDate: "2026-10-06",
    }, "2026-10-06T00:00:00.000Z");

    expect(evidence).toHaveLength(1);
  });

  it("does not turn a company-only raw search fragment into an event candidate", () => {
    const output = "2026年10月8日 宁德时代发布股东询价转让结果公告，交易金额为 23799720000 元。";
    const evidence = extractMcpEvidence(output, "search_event_notices", {
      companyQuery: "宁德时代",
      eventQuery: "收购耀宁",
      cutoffDate: "2026-10-08",
    }, "2026-10-08T00:00:00.000Z");

    expect(evidence).toHaveLength(0);
  });

  it("extracts a dated close-price series only when the MCP returns real daily fields", () => {
    const output = JSON.stringify({ data: [
      { 日期: "2026-09-01", 收盘价: "312.40", 涨跌幅: "1.20" },
      { 日期: "2026-09-02", 收盘价: "316.00", 涨跌幅: "1.15" },
    ] });
    const series = extractMarketSeries(output, { companyQuery: "宁德时代", eventQuery: "收购耀宁", cutoffDate: "2026-10-08" }, "2026-10-08T00:00:00.000Z");

    expect(series?.points).toEqual([{ date: "2026-09-01", close: 312.4, changePct: 1.2 }, { date: "2026-09-02", close: 316, changePct: 1.15 }]);
  });

  it("parses iFinD's JSON-wrapped Markdown daily-price table and skips non-trading dates", () => {
    const output = JSON.stringify({ code: 1, data: { answer: "|证券代码|证券简称|日期|收盘价|涨跌幅（单位：%）|成交额（单位：元）|成交量|\n|---|---|---|---|---|---|---|\n|688041.SH|海光信息|20250611|135.5|-4.564|43.6718亿|3197.0969万|\n|688041.SH|海光信息|20250610|141.98|4.2974|87.3016亿|6090.7734万|\n|688041.SH|海光信息|20250609|136.13|||||\n|688041.SH|海光信息|20250608|136.13|||||" } });
    const series = extractMarketSeries(output, { companyQuery: "海光信息", eventQuery: "吸收合并", cutoffDate: "2025-06-17" }, "2025-06-17T00:00:00.000Z");

    expect(series?.points).toEqual([
      { date: "2025-06-10", close: 141.98, changePct: 4.2974, amount: 8730160000, volume: 60907734 },
      { date: "2025-06-11", close: 135.5, changePct: -4.564, amount: 4367180000, volume: 31970969 },
    ]);
    expect(series?.nonTradingDates).toEqual(["2025-06-09", "2025-06-08"]);
  });
});
