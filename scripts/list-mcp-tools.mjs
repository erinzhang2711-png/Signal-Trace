import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const servers = [
  { id: "stock", url: process.env.IFIND_STOCK_MCP_URL },
  { id: "news", url: process.env.IFIND_NEWS_MCP_URL },
];
const token = process.env.IFIND_MCP_TOKEN;

if (!token || servers.some((server) => !server.url)) {
  throw new Error("请在 .env.local 配置 IFIND_MCP_TOKEN、IFIND_STOCK_MCP_URL 和 IFIND_NEWS_MCP_URL。");
}

async function listServerTools(server) {
  const client = new Client({ name: "signaltrace-catalog", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: { Authorization: token } },
    onInsufficientScope: "throw",
  });

  try {
    await client.connect(transport, { timeout: 15_000 });
    const result = await client.listTools(undefined, { timeout: 15_000 });
    return {
      server: server.id,
      tools: result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
      })),
    };
  } finally {
    await transport.close();
  }
}

const catalog = await Promise.all(servers.map(listServerTools));
process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
