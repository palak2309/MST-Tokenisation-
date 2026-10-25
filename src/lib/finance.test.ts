import { describe, expect, it } from "vitest";
import { hypotheticalUnits, investorShare, rental } from "./finance";

describe("finance formulas", () => {
  it("investor share = contribution / pool", () => {
    expect(investorShare(100_000, 10_000_000)).toBeCloseTo(0.01);
  });
  it("units = floor(contribution / unit price)", () => {
    expect(hypotheticalUnits(2_500, 1_000)).toBe(2);
  });
  it("net income = gross - expenses - deductions; allocation = net x share", () => {
    const r = rental({ gross: 100_000, operating: 10_000, maintenance: 5_000, vacancyPct: 5, share: 0.01 });
    expect(r.net).toBe(80_000);
    expect(r.monthly).toBe(800);
    expect(r.annual).toBe(9_600);
  });
});
