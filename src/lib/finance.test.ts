import { describe, expect, it } from "vitest";
import { hypotheticalUnits, investorShare, rental } from "./finance";

describe("finance formulas", () => {
  it("investor share = contribution / pool", () => {
    expect(investorShare(100_000, 10_000_000)).toBeCloseTo(0.01);
  });

  it("caps an investor share at 100% of the pool", () => {
    expect(investorShare(12_000, 10_000)).toBe(1);
  });

  it("returns zero for invalid share inputs", () => {
    expect(investorShare(Number.POSITIVE_INFINITY, 10_000)).toBe(0);
    expect(investorShare(100, 0)).toBe(0);
  });

  it("units = floor(contribution / unit price)", () => {
    expect(hypotheticalUnits(2_500, 1_000)).toBe(2);
  });

  it("caps hypothetical units to the available pool contribution", () => {
    expect(hypotheticalUnits(12_000, 1_000, 5_000)).toBe(5);
  });

  it("returns zero units for invalid or non-finite inputs", () => {
    expect(hypotheticalUnits(1_000, 0)).toBe(0);
    expect(hypotheticalUnits(Number.POSITIVE_INFINITY, 1_000)).toBe(0);
    expect(hypotheticalUnits(1_000, 1_000, Number.NaN)).toBe(0);
  });

  it("net income = gross - expenses - deductions; allocation = net x share", () => {
    const r = rental({ gross: 100_000, operating: 10_000, maintenance: 5_000, vacancyPct: 5, share: 0.01 });
    expect(r.net).toBe(80_000);
    expect(r.monthly).toBe(800);
    expect(r.annual).toBe(9_600);
  });

  it("clamps invalid rental inputs to safe non-negative values", () => {
    expect(rental({ gross: Number.NaN, operating: -10, maintenance: 0, vacancyPct: 0, share: 1 }))
      .toEqual({ vacancy: 0, net: 0, monthly: 0, annual: 0 });
    expect(rental({ gross: 100, operating: 0, maintenance: 0, vacancyPct: 0, share: 2 }).monthly).toBe(100);
  });
});
