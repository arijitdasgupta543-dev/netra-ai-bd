import { describe, expect, it } from "vitest";
import { bandOf } from "./inference";

describe("two-tier AI band (mirrors predictions_band trigger)", () => {
  const m = { threshold: 0.5, reviewThreshold: 0.0691 };
  it("refers at or above the refer threshold", () => { expect(bandOf(0.5, m)).toBe("refer"); expect(bandOf(0.93, m)).toBe("refer"); });
  it("sends the middle band to doctor review", () => { expect(bandOf(0.0691, m)).toBe("review"); expect(bandOf(0.3, m)).toBe("review"); });
  it("is negative below the review threshold", () => { expect(bandOf(0.069, m)).toBe("negative"); expect(bandOf(0, m)).toBe("negative"); });
  it("without a review threshold behaves as one threshold", () => { expect(bandOf(0.3, { threshold: 0.5, reviewThreshold: null })).toBe("negative"); });
});
