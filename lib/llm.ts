import OpenAI from "openai";

export type LLMRuntime = {
  client: OpenAI;
  model: string;
  api: "responses" | "chat";
  provider: "openai" | "zhipu";
};

export function getLLMRuntime(): LLMRuntime | null {
  if (process.env.ZHIPU_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.ZHIPU_API_KEY,
        baseURL: "https://open.bigmodel.cn/api/paas/v4/",
      }),
      model: process.env.ZHIPU_MODEL || "glm-4-flash",
      api: "chat",
      provider: "zhipu",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      api: "responses",
      provider: "openai",
    };
  }

  return null;
}
