import { afterEach, describe, expect, it, vi } from "vitest";

import { getLLMRuntime } from "./llm";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LLM provider selection", () => {
  it("selects Zhipu through the server-only environment variables", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ZHIPU_API_KEY", "test-key");
    vi.stubEnv("ZHIPU_MODEL", "glm-test");

    expect(getLLMRuntime()).toMatchObject({ api: "chat", model: "glm-test", provider: "zhipu" });
  });
});
