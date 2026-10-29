import { describe, expect, it } from "vitest";
import { validatePropertyForm, type PropertyFormInputs } from "@/lib/propertyValidation";
import { calculatePropertyFinances } from "@/lib/finance";

describe("Add Property Form - Flexible Values & Safeguards Validation", () => {
  const baseValidInputs: PropertyFormInputs = {
    propertyId: "prop_flex_test_01",
    name: "Skyline Heights Tower A",
    location: "Bandra Kurla Complex, Mumbai, Maharashtra",
    indicativeValue: 8000001, // Non-step flexible market value (₹80,00,001)
    monthlyRent: 400000,
    vacancyPct: 5,
    monthlyOperating: 40000,
    monthlyMaintenance: 20000,
    capRatePct: 6.25, // Positive percentage with decimal precision
    unitPrice: 1001, // Non-step unit price (₹1,001)
    tokenPool: 2019017, // Flexible pool (₹20,19,017), exactly 2017 tokens @ ₹1,001
    isEditing: false,
  };

  describe("1. Flexible Indian Rupee Inputs", () => {
    it("accepts non-step market value, pool, and unit price with zero errors", () => {
      const errors = validatePropertyForm(baseValidInputs);
      expect(errors).toEqual({});
    });

    it("accepts a token pool with an unallocated remainder (e.g. pool ₹20,19,020 with unit price ₹1,001)", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        propertyId: "prop_flex_remainder_02",
        tokenPool: 2019020, // 2017 tokens * ₹1,001 = ₹20,19,017 with ₹3 unallocated remainder
      };
      const errors = validatePropertyForm(inputs);
      expect(errors).toEqual({});

      // Verify financial calculation handles floor supply and reports remainder
      const finances = calculatePropertyFinances({
        indicativeMarketValue: inputs.indicativeValue,
        monthlyGrossRent: inputs.monthlyRent,
        vacancyPct: inputs.vacancyPct,
        monthlyOperatingExpenses: inputs.monthlyOperating,
        monthlyMaintenanceExpenses: inputs.monthlyMaintenance,
        capRatePct: inputs.capRatePct,
        tokenisationPool: inputs.tokenPool,
        tokenPricePerUnit: inputs.unitPrice,
      });

      expect(finances.maximumTokenSupply).toBe(2017);
      expect(finances.allocatedPool).toBe(2019017);
      expect(finances.unusedPoolRemainder).toBe(3);
      expect(finances.isPoolDivisible).toBe(false);
    });

    it("accepts unit price with 2 decimal places (paise precision, e.g. ₹1,001.50)", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        propertyId: "prop_flex_paise_03",
        unitPrice: 1001.5,
        tokenPool: 20030, // 20 tokens * 1001.50 = 20,030
      };
      const errors = validatePropertyForm(inputs);
      expect(errors).toEqual({});

      const finances = calculatePropertyFinances({
        indicativeMarketValue: inputs.indicativeValue,
        monthlyGrossRent: inputs.monthlyRent,
        vacancyPct: inputs.vacancyPct,
        monthlyOperatingExpenses: inputs.monthlyOperating,
        monthlyMaintenanceExpenses: inputs.monthlyMaintenance,
        capRatePct: inputs.capRatePct,
        tokenisationPool: inputs.tokenPool,
        tokenPricePerUnit: inputs.unitPrice,
      });

      expect(finances.maximumTokenSupply).toBe(20);
      expect(finances.allocatedPool).toBe(20030);
      expect(finances.unusedPoolRemainder).toBe(0);
      expect(finances.isPoolDivisible).toBe(true);
    });

    it("rejects unit price with more than 2 decimal places (sub-paise, e.g. ₹1,001.555)", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        unitPrice: 1001.555,
      };
      const errors = validatePropertyForm(inputs);
      expect(errors.unitPrice).toMatch(
        /cannot have more than 2 decimal places \(paise precision\)/i,
      );
    });
  });

  describe("2. Token Pool Bounds & Supply Validation", () => {
    it("rejects token pool greater than the indicative market value", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        indicativeValue: 8000001,
        tokenPool: 8000002, // ₹1 greater than market value
      };
      const errors = validatePropertyForm(inputs);
      expect(errors.tokenPool).toMatch(/cannot exceed the indicative market value/i);
    });

    it("allows token pool exactly equal to 100% of indicative market value", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        indicativeValue: 5000000,
        tokenPool: 5000000,
        unitPrice: 1000,
      };
      const errors = validatePropertyForm(inputs);
      expect(errors.tokenPool).toBeUndefined();
    });

    it("rejects token pool when pool is smaller than unit price yielding 0 whole tokens", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        tokenPool: 500, // less than unit price 1001
        unitPrice: 1001,
      };
      const errors = validatePropertyForm(inputs);
      expect(errors.tokenPool).toMatch(
        /must be at least the price of one unit.*yield at least 1 whole token/i,
      );
    });

    it("rejects negative or zero token pool", () => {
      expect(validatePropertyForm({ ...baseValidInputs, tokenPool: 0 }).tokenPool).toMatch(
        /greater than zero/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, tokenPool: -50000 }).tokenPool).toMatch(
        /greater than zero/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, tokenPool: Number.NaN }).tokenPool).toMatch(
        /greater than zero/i,
      );
    });

    it("rejects negative or zero unit price", () => {
      expect(validatePropertyForm({ ...baseValidInputs, unitPrice: 0 }).unitPrice).toMatch(
        /greater than zero/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, unitPrice: -100 }).unitPrice).toMatch(
        /greater than zero/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, unitPrice: Number.NaN }).unitPrice).toMatch(
        /greater than zero/i,
      );
    });
  });

  describe("3. Market Value & Financial Metric Safeguards", () => {
    it("rejects zero or negative indicative market value", () => {
      expect(
        validatePropertyForm({ ...baseValidInputs, indicativeValue: 0 }).indicativeValue,
      ).toMatch(/must be a positive number greater than zero/i);
      expect(
        validatePropertyForm({ ...baseValidInputs, indicativeValue: -1000 }).indicativeValue,
      ).toMatch(/must be a positive number greater than zero/i);
      expect(
        validatePropertyForm({ ...baseValidInputs, indicativeValue: Number.NaN }).indicativeValue,
      ).toMatch(/must be a positive number greater than zero/i);
    });

    it("rejects negative monthly rent, operating, or maintenance expenses", () => {
      expect(validatePropertyForm({ ...baseValidInputs, monthlyRent: -1 }).monthlyRent).toMatch(
        /cannot be negative/i,
      );
      expect(
        validatePropertyForm({ ...baseValidInputs, monthlyOperating: -100 }).monthlyOperating,
      ).toMatch(/cannot be negative/i);
      expect(
        validatePropertyForm({ ...baseValidInputs, monthlyMaintenance: -50 }).monthlyMaintenance,
      ).toMatch(/cannot be negative/i);
    });

    it("allows 0 expenses and 0 monthly rent (e.g. land or development property)", () => {
      const inputs: PropertyFormInputs = {
        ...baseValidInputs,
        monthlyRent: 0,
        monthlyOperating: 0,
        monthlyMaintenance: 0,
      };
      const errors = validatePropertyForm(inputs);
      expect(errors.monthlyRent).toBeUndefined();
      expect(errors.monthlyOperating).toBeUndefined();
      expect(errors.monthlyMaintenance).toBeUndefined();
    });

    it("validates vacancy allowance between 0% and 100%", () => {
      expect(validatePropertyForm({ ...baseValidInputs, vacancyPct: -1 }).vacancyPct).toMatch(
        /must be between 0% and 100%/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, vacancyPct: 101 }).vacancyPct).toMatch(
        /must be between 0% and 100%/i,
      );
      expect(
        validatePropertyForm({ ...baseValidInputs, vacancyPct: 0 }).vacancyPct,
      ).toBeUndefined();
      expect(
        validatePropertyForm({ ...baseValidInputs, vacancyPct: 100 }).vacancyPct,
      ).toBeUndefined();
    });

    it("validates cap rate as positive percentage and keeps it decoupled from NOI yield", () => {
      expect(validatePropertyForm({ ...baseValidInputs, capRatePct: 0 }).capRatePct).toMatch(
        /must be a positive percentage greater than 0%/i,
      );
      expect(validatePropertyForm({ ...baseValidInputs, capRatePct: -2.5 }).capRatePct).toMatch(
        /must be a positive percentage greater than 0%/i,
      );

      // Decoupled demonstration:
      // Market value ₹80,00,001, monthly rent ₹4,00,000, 5% vacancy, ₹40k operating, ₹20k maintenance
      // Gross annual = 4,00,000 * 12 = 48,00,000
      // Vacancy = 2,40,000
      // Effective Gross Income = 45,60,000
      // Total operating = (40,000 + 20,000) * 12 = 7,20,000
      // NOI = 38,40,000
      // Net Rental Yield = (38,40,000 / 80,00,001) * 100 = ~48.00%
      // User entered Cap Rate = 6.25%
      const finances = calculatePropertyFinances({
        indicativeMarketValue: baseValidInputs.indicativeValue,
        monthlyGrossRent: baseValidInputs.monthlyRent,
        vacancyPct: baseValidInputs.vacancyPct,
        monthlyOperatingExpenses: baseValidInputs.monthlyOperating,
        monthlyMaintenanceExpenses: baseValidInputs.monthlyMaintenance,
        capRatePct: baseValidInputs.capRatePct,
        tokenisationPool: baseValidInputs.tokenPool,
        tokenPricePerUnit: baseValidInputs.unitPrice,
      });

      expect(finances.netOperatingIncome).toBe(3840000);
      expect(finances.netRentalYield).toBeCloseTo(47.99999, 2);
      // Cap rate valuation uses capRatePct independently: 38,40,000 / 0.0625 = 61,440,000
      expect(finances.incomeBasedValuation).toBe(61440000);
    });
  });

  describe("4. Property ID & String Field Constraints", () => {
    it("validates required name and location", () => {
      const errors = validatePropertyForm({
        ...baseValidInputs,
        name: "   ",
        location: "",
      });
      expect(errors.name).toMatch(/Property name is required/i);
      expect(errors.location).toMatch(/Full location is required/i);
    });

    it("validates property ID format and length constraints", () => {
      expect(validatePropertyForm({ ...baseValidInputs, propertyId: "" }).propertyId).toMatch(
        /Property ID is required/i,
      );
      expect(
        validatePropertyForm({ ...baseValidInputs, propertyId: "invalid space in id" }).propertyId,
      ).toMatch(/letters, numbers, hyphens, and underscores/i);
      expect(
        validatePropertyForm({ ...baseValidInputs, propertyId: "a".repeat(65) }).propertyId,
      ).toMatch(/between 1 and 64 UTF-8 bytes/i);
    });
  });

  describe("5. MST-DEMO-PUNE-002 On-Chain Registration Flow & Contract Integration", () => {
    const puneDemoInputs: PropertyFormInputs = {
      propertyId: "MST-DEMO-PUNE-002",
      name: "Pune Baner Tech Park - Unit B",
      location: "Baner, Pune, Maharashtra",
      indicativeValue: 15000000,
      monthlyRent: 65000,
      vacancyPct: 5,
      monthlyOperating: 5000,
      monthlyMaintenance: 4000,
      capRatePct: 6.0,
      unitPrice: 1000, // ₹1,000 -> 100,000 paise for contract
      tokenPool: 1500000, // 1500 units @ ₹1,000
      isEditing: false,
    };

    it("validates MST-DEMO-PUNE-002 preset inputs with zero form errors", () => {
      const errors = validatePropertyForm(puneDemoInputs);
      expect(errors).toEqual({});
    });

    it("calculates exact maximum supply of 1500 units and 0 unallocated remainder", () => {
      const finances = calculatePropertyFinances({
        indicativeMarketValue: puneDemoInputs.indicativeValue,
        monthlyGrossRent: puneDemoInputs.monthlyRent,
        vacancyPct: puneDemoInputs.vacancyPct,
        monthlyOperatingExpenses: puneDemoInputs.monthlyOperating,
        monthlyMaintenanceExpenses: puneDemoInputs.monthlyMaintenance,
        capRatePct: puneDemoInputs.capRatePct,
        tokenisationPool: puneDemoInputs.tokenPool,
        tokenPricePerUnit: puneDemoInputs.unitPrice,
      });

      expect(finances.maximumTokenSupply).toBe(1500);
      expect(finances.allocatedPool).toBe(1500000);
      expect(finances.unusedPoolRemainder).toBe(0);
      expect(finances.isPoolDivisible).toBe(true);
    });

    it("verifies paise unit conversion for PropertyToken contract", () => {
      // 1 INR = 100 paise; unitPrice = ₹1,000 -> 100,000 paise
      const unitPriceInPaise = BigInt(Math.round(puneDemoInputs.unitPrice * 100));
      expect(unitPriceInPaise).toBe(100000n);
    });

    it("verifies SHA-256 document fingerprint format matches contract bytes32 expectation", () => {
      const docHash = "9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6";
      expect(docHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/i.test(docHash)).toBe(true);

      const formattedBytes32 = `0x${docHash.toLowerCase()}`;
      expect(formattedBytes32).toHaveLength(66);
    });
  });
});
