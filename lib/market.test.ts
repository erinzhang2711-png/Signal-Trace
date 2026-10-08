import { describe, expect, it } from "vitest";

import { marketReactionForEvent, returnFrom } from "./market";

describe("event market reaction", () => {
  const series = {
    sourceLabel: "test",
    capturedAt: "2026-10-08T00:00:00.000Z",
    points: [
      { date: "2026-09-11", close: 100, changePct: 1 },
      { date: "2026-09-14", close: 105, changePct: 5 },
      { date: "2026-09-15", close: 103, changePct: -1.9 },
    ],
  };

  it("uses the first trading day on or after a disclosed event date", () => {
    expect(marketReactionForEvent(series, "2026-09-12")).toMatchObject({
      eventDate: "2026-09-12",
      observedDate: "2026-09-14",
      point: { close: 105 },
      previous: { date: "2026-09-11" },
      next: { date: "2026-09-15" },
    });
  });

  it("calculates a follow-through return from the observed T0 close", () => {
    expect(returnFrom(105, 103)).toBeCloseTo(-1.9048, 4);
  });
});
