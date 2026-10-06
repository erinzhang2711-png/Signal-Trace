import OpenAI from "openai";

export type LLMRuntime = {
  client: OpenAI;
  model: string;
  api: "responses" | "chat";
};

export function getLLMRuntime(): LLMRuntime | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      api: "responses",
    };
  }

  if (process.env.HKUST_GENAI_API_KEY && process.env.AZURE_ENDPOINT && process.env.AZURE_CHAT_DEPLOYMENT) {
    return {
      client: new OpenAI({
        apiKey: "school-managed-key",
        baseURL: process.env.AZURE_ENDPOINT,
        defaultHeaders: { "api-key": process.env.HKUST_GENAI_API_KEY },
      }),
      model: process.env.AZURE_CHAT_DEPLOYMENT,
      api: "chat",
    };
  }

  return null;
}
