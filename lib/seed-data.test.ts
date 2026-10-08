import { describe, expect, it } from "vitest";

import { marketReactionFor, SEED_EVIDENCE } from "./seed-data";

describe("seed market reactions", () => {
  it("maps every seeded event to an explicit market-observation state", () => {
    expect(SEED_EVIDENCE.every((item) => marketReactionFor(item.id))).toBe(true);
  });

  it("keeps the re-listing reaction attributable to a dated observation window", () => {
    expect(marketReactionFor("plan")).toMatchObject({
      status: "已观察",
      windowLabel: "复牌日 T0 · 2025-06-10",
      benchmark: { label: "上证指数", returnPct: 0.43 },
    });
  });
});
