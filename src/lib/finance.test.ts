import { describe, expect, it } from "vitest";
import {
  calculateAnnualExpenses,
  calculateAnnualGrossRent,
  calculateAnnualVacancyAllowance,
  calculateEffectiveAnnualRentalIncome,
  calculateIncomeBasedValuation,
  calculateInvestorHypotheticalUnits,
  calculateInvestorPoolPercentage,
  calculateMaximumTokenSupply,
  calculateNetOperatingIncome,
  calculatePropertyFinances,
  calculateRentalYield,
  hypotheticalUnits,
  investorShare,
  rental,
} from "./finance";

describe("legacy finance formulas compatibility", () => {
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
    const r = rental({
      gross: 100_000,
      operating: 10_000,
      maintenance: 5_000,
      vacancyPct: 5,
      share: 0.01,
    });
    expect(r.net).toBe(80_000);
    expect(r.monthly).toBe(800);
    expect(r.annual).toBe(9_600);
  });

  it("clamps invalid rental inputs to safe non-negative values", () => {
    expect(
      rental({ gross: Number.NaN, operating: -10, maintenance: 0, vacancyPct: 0, share: 1 }),
    ).toEqual({
      vacancy: 0,
      net: 0,
      monthly: 0,
      annual: 0,
    });
    expect(
      rental({ gross: 100, operating: 0, maintenance: 0, vacancyPct: 0, share: 2 }).monthly,
    ).toBe(100);
  });
});

describe("property financial algorithm", () => {
  describe("A. Effective annual rental income", () => {
    it("calculates annual gross rent (monthly gross * 12)", () => {
      expect(calculateAnnualGrossRent(50_000)).toBe(600_000);
      expect(calculateAnnualGrossRent(0)).toBe(0);
      expect(calculateAnnualGrossRent(-5_000)).toBe(0);
      expect(calculateAnnualGrossRent(Number.NaN)).toBe(0);
    });

    it("calculates annual vacancy allowance (annual gross * vacancy percentage / 100)", () => {
      const annualGross = 600_000;
      expect(calculateAnnualVacancyAllowance(annualGross, 5)).toBe(30_000);
      expect(calculateAnnualVacancyAllowance(annualGross, 0)).toBe(0);
      expect(calculateAnnualVacancyAllowance(annualGross, 100)).toBe(600_000);
      expect(calculateAnnualVacancyAllowance(annualGross, -10)).toBe(0);
      expect(calculateAnnualVacancyAllowance(0, 5)).toBe(0);
    });

    it("calculates effective annual rental income (annual gross - vacancy allowance)", () => {
      // 50,000/mo * 12 = 600,000; 5% vacancy = 30,000; effective = 570,000
      expect(calculateEffectiveAnnualRentalIncome(50_000, 5)).toBe(570_000);
      expect(calculateEffectiveAnnualRentalIncome(0, 5)).toBe(0);
      expect(calculateEffectiveAnnualRentalIncome(50_000, 100)).toBe(0);
      expect(calculateEffectiveAnnualRentalIncome(50_000, 0)).toBe(600_000);
    });
  });

  describe("B. Net operating income (NOI)", () => {
    it("calculates annual expenses ((monthly operating + monthly maintenance) * 12)", () => {
      expect(calculateAnnualExpenses(4_000, 3_500)).toBe(90_000);
      expect(calculateAnnualExpenses(0, 0)).toBe(0);
      expect(calculateAnnualExpenses(-1_000, 2_000)).toBe(24_000);
    });

    it("calculates net operating income (effective annual rental income - annual expenses)", () => {
      // effective rent = 570,000; annual expenses = 90,000 => NOI = 480,000
      expect(calculateNetOperatingIncome(50_000, 5, 4_000, 3_500)).toBe(480_000);
    });

    it("handles cases where expenses exceed income (negative NOI)", () => {
      // monthly rent 5,000 * 12 = 60,000; expenses = (4,000 + 3,000) * 12 = 84,000 => NOI = -24,000
      expect(calculateNetOperatingIncome(5_000, 0, 4_000, 3_000)).toBe(-24_000);
    });
  });

  describe("C. Income-based indicative valuation", () => {
    it("calculates income-based valuation (NOI / (capRate / 100))", () => {
      // NOI = 480,000; Cap rate = 6% => Valuation = 480,000 / 0.06 = 8,000,000
      expect(calculateIncomeBasedValuation(480_000, 6)).toBe(8_000_000);
    });

    it("handles zero or negative cap rate safely without dividing by zero", () => {
      expect(calculateIncomeBasedValuation(480_000, 0)).toBeNull();
      expect(calculateIncomeBasedValuation(480_000, -5)).toBeNull();
      expect(calculateIncomeBasedValuation(480_000, Number.NaN)).toBeNull();
    });

    it("handles zero or negative NOI safely without misleading results", () => {
      expect(calculateIncomeBasedValuation(0, 6)).toBeNull();
      expect(calculateIncomeBasedValuation(-50_000, 6)).toBeNull();
    });
  });

  describe("D. Net rental yield", () => {
    it("calculates net rental yield ((NOI / indicative market value) * 100)", () => {
      // NOI = 480,000; Indicative Market Value = 8,000,000 => Yield = 6%
      expect(calculateRentalYield(480_000, 8_000_000)).toBe(6);
    });

    it("handles zero or negative market value safely", () => {
      expect(calculateRentalYield(480_000, 0)).toBe(0);
      expect(calculateRentalYield(480_000, -1_000_000)).toBe(0);
      expect(calculateRentalYield(480_000, Number.NaN)).toBe(0);
    });

    it("handles zero or negative NOI safely", () => {
      expect(calculateRentalYield(0, 10_000_000)).toBe(0);
      expect(calculateRentalYield(-100_000, 10_000_000)).toBe(0);
    });
  });

  describe("E. Tokenisation proposal", () => {
    it("calculates maximum token supply as floor(tokenisation pool / token price per unit)", () => {
      expect(calculateMaximumTokenSupply(10_000_000, 1_000)).toBe(10_000);
      expect(calculateMaximumTokenSupply(10_000_500, 1_000)).toBe(10_000);
    });

    it("returns 0 when token pool is less than token price or invalid", () => {
      expect(calculateMaximumTokenSupply(500, 1_000)).toBe(0);
      expect(calculateMaximumTokenSupply(0, 1_000)).toBe(0);
      expect(calculateMaximumTokenSupply(10_000_000, 0)).toBe(0);
      expect(calculateMaximumTokenSupply(-10_000_000, 1_000)).toBe(0);
      expect(calculateMaximumTokenSupply(10_000_000, -100)).toBe(0);
    });

    it("calculates hypothetical investor units capped to pool", () => {
      expect(calculateInvestorHypotheticalUnits(50_000, 1_000, 100_000)).toBe(50);
      expect(calculateInvestorHypotheticalUnits(150_000, 1_000, 100_000)).toBe(100);
      expect(calculateInvestorHypotheticalUnits(-5_000, 1_000, 100_000)).toBe(0);
    });

    it("calculates investor pool percentage capped at 100%", () => {
      expect(calculateInvestorPoolPercentage(100_000, 10_000_000)).toBe(1);
      expect(calculateInvestorPoolPercentage(12_000_000, 10_000_000)).toBe(100);
      expect(calculateInvestorPoolPercentage(0, 10_000_000)).toBe(0);
      expect(calculateInvestorPoolPercentage(100_000, 0)).toBe(0);
      expect(calculateInvestorPoolPercentage(-50_000, 10_000_000)).toBe(0);
    });
  });

  describe("calculatePropertyFinances complete pipeline", () => {
    it("computes all property financial metrics with clean outputs and divisibility check", () => {
      const result = calculatePropertyFinances({
        monthlyGrossRent: 50_000,
        vacancyPct: 5,
        monthlyOperatingExpenses: 4_000,
        monthlyMaintenanceExpenses: 3_500,
        indicativeMarketValue: 8_000_000,
        capRatePct: 6,
        tokenisationPool: 5_000_000,
        tokenPricePerUnit: 1_000,
      });

      expect(result.annualGrossRent).toBe(600_000);
      expect(result.annualVacancyAllowance).toBe(30_000);
      expect(result.effectiveAnnualRentalIncome).toBe(570_000);
      expect(result.annualOperatingExpenses).toBe(90_000);
      expect(result.netOperatingIncome).toBe(480_000);
      expect(result.incomeBasedValuation).toBe(8_000_000);
      expect(result.incomeBasedValuationEligible).toBe(true);
      expect(result.netRentalYield).toBe(6);
      expect(result.maximumTokenSupply).toBe(5_000);
      expect(result.isPoolDivisible).toBe(true);
      expect(result.disclaimer).toContain("illustrative estimates");
    });

    it("flags non-divisible pools correctly and calculates unallocated remainder", () => {
      const result = calculatePropertyFinances({
        monthlyGrossRent: 40_000,
        vacancyPct: 0,
        monthlyOperatingExpenses: 1_000,
        monthlyMaintenanceExpenses: 1_000,
        indicativeMarketValue: 5_000_000,
        capRatePct: 5,
        tokenisationPool: 5_000_500,
        tokenPricePerUnit: 1_000,
      });

      expect(result.isPoolDivisible).toBe(false);
      expect(result.maximumTokenSupply).toBe(5000);
      expect(result.allocatedPool).toBe(5_000_000);
      expect(result.unusedPoolRemainder).toBe(500);
    });

    it("correctly handles flexible values: market value ₹80,00,001, pool ₹20,19,017, unit price ₹1,001", () => {
      const result = calculatePropertyFinances({
        monthlyGrossRent: 50_000,
        vacancyPct: 5,
        monthlyOperatingExpenses: 4_000,
        monthlyMaintenanceExpenses: 3_500,
        indicativeMarketValue: 8_000_001,
        capRatePct: 6.25,
        tokenisationPool: 2_019_017,
        tokenPricePerUnit: 1_001,
      });

      // Token calculations: 2_019_017 / 1_001 = 2017 whole units exactly
      expect(result.maximumTokenSupply).toBe(2017);
      expect(result.allocatedPool).toBe(2_019_017);
      expect(result.unusedPoolRemainder).toBe(0);
      expect(result.isPoolDivisible).toBe(true);

      // Financials: NOI = (50000 * 12 * 0.95) - ((4000 + 3500) * 12) = 570000 - 90000 = 480000
      expect(result.netOperatingIncome).toBe(480_000);

      // Income-based valuation uses entered cap rate: 480_000 / (6.25 / 100) = 7_680_000
      expect(result.incomeBasedValuation).toBe(7_680_000);

      // Net rental yield is calculated separately from market value: (480_000 / 8_000_001) * 100
      const expectedYield = (480_000 / 8_000_001) * 100;
      expect(result.netRentalYield).toBeCloseTo(expectedYield, 5);
      expect(result.netRentalYield).not.toBe(6.25); // Cap rate and yield are distinct
    });

    it("calculates floor whole units and isolates remainder when pool does not divide evenly (e.g. pool ₹20,19,020 / ₹1,001)", () => {
      const result = calculatePropertyFinances({
        monthlyGrossRent: 50_000,
        vacancyPct: 5,
        monthlyOperatingExpenses: 4_000,
        monthlyMaintenanceExpenses: 3_500,
        indicativeMarketValue: 8_000_001,
        capRatePct: 6.25,
        tokenisationPool: 2_019_020,
        tokenPricePerUnit: 1_001,
      });

      // floor(2_019_020 / 1_001) = 2017 units
      expect(result.maximumTokenSupply).toBe(2017);
      expect(result.allocatedPool).toBe(2_019_017);
      expect(result.unusedPoolRemainder).toBe(3); // ₹3 remainder
      expect(result.isPoolDivisible).toBe(false);
    });

    it("supports decimal unit price (e.g. ₹1,001.50) with clean integer supply", () => {
      const result = calculatePropertyFinances({
        monthlyGrossRent: 50_000,
        vacancyPct: 5,
        monthlyOperatingExpenses: 4_000,
        monthlyMaintenanceExpenses: 3_500,
        indicativeMarketValue: 8_000_001,
        capRatePct: 6,
        tokenisationPool: 20_030,
        tokenPricePerUnit: 1_001.5,
      });

      // floor(20030 / 1001.5) = 20 units
      expect(result.maximumTokenSupply).toBe(20);
      expect(result.allocatedPool).toBe(20_030);
      expect(result.unusedPoolRemainder).toBe(0);
      expect(result.isPoolDivisible).toBe(true);
    });
  });
});
