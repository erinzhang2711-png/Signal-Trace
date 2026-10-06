import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const token = process.env.IFIND_MCP_TOKEN;
const url = process.env.IFIND_NEWS_MCP_URL;

if (!token || !url) throw new Error("缺少 iFinD 新闻 MCP 配置。");

const client = new Client({ name: "signaltrace-inspection", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: token } },
  onInsufficientScope: "throw",
});

try {
  await client.connect(transport, { timeout: 15_000 });
  const result = await client.callTool(
    {
      name: "search_notice",
      arguments: {
        query: "海光信息 中科曙光 换股吸收合并 重大资产重组 进展公告",
        time_start: "2025-05-01",
        time_end: "2025-09-06",
        size: 3,
      },
    },
    { timeout: 15_000 },
  );
  process.stdout.write(`${JSON.stringify(result.content, null, 2)}\n`);
} finally {
  await transport.close();
}
