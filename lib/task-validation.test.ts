import { describe, expect, it } from "vitest";

import { researchTaskWarning } from "./task-validation";

describe("research task validation", () => {
  it("flags the Guotai Junan and Haitong International merger mix-up", () => {
    expect(researchTaskWarning({ companyQuery: "国泰君安、海通国际", eventQuery: "合并", cutoffDate: "2026-10-08" }))
      .toContain("海通证券");
  });

  it("allows the actual Guotai Junan and Haitong Securities merger task", () => {
    expect(researchTaskWarning({ companyQuery: "国泰君安、海通证券", eventQuery: "换股吸收合并", cutoffDate: "2026-10-08" }))
      .toBeNull();
  });
});
