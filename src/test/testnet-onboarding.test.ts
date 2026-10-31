import { describe, expect, it } from "vitest";
import {
  validateTestnetChainId as validateRolesChainId,
  normalizeAccountAddress as normalizeRolesAddress,
  createTestnetRoleGrantPlans,
  TESTNET_CHAIN_ID as ROLES_CHAIN_ID,
  COMPLIANCE_ROLE_HASH,
  PAUSER_ROLE_HASH,
  ISSUER_ROLE_HASH,
} from "../../scripts/setup-testnet-roles";
import {
  validateTestnetChainId as validateOnboardChainId,
  normalizeAccountAddress as normalizeOnboardAddress,
  TESTNET_CHAIN_ID as ONBOARD_CHAIN_ID,
  CONFIRMATION_PHRASE as ONBOARD_CONFIRMATION,
  DEFAULT_DEMO_PROPERTY_ID,
  DEFAULT_ISSUE_AMOUNT,
} from "../../scripts/onboard-testnet-property";
import {
  validateTestnetChainId as validateAuthChainId,
  normalizeAccountAddress as normalizeAuthAddress,
  TESTNET_CHAIN_ID as AUTH_CHAIN_ID,
  CONFIRMATION_PHRASE as AUTH_CONFIRMATION,
  DEFAULT_POOL_MIN_LOCK,
} from "../../scripts/authorize-testnet-staking";
import {
  validateTestnetChainId as validateVerifyChainId,
  normalizeAccountAddress as normalizeVerifyAddress,
  TESTNET_CHAIN_ID as VERIFY_CHAIN_ID,
} from "../../scripts/verify-testnet-staking";

describe("MST Testnet Deployment & Onboarding Safeguards", () => {
  const dummyAdmin = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
  const dummyIssuer = "0x2889D4EF96b8F02Db90D7fEc0ea46E27f2Bd0471";
  const dummyCompliance = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";

  describe("1. Chain ID Enforcement across all Testnet Scripts", () => {
    it("strictly enforces Chain ID 91562037", () => {
      expect(ROLES_CHAIN_ID).toBe(91562037n);
      expect(ONBOARD_CHAIN_ID).toBe(91562037n);
      expect(AUTH_CHAIN_ID).toBe(91562037n);
      expect(VERIFY_CHAIN_ID).toBe(91562037n);

      expect(validateRolesChainId(91562037n)).toBe(true);
      expect(validateOnboardChainId(91562037n)).toBe(true);
      expect(validateAuthChainId(91562037n)).toBe(true);
      expect(validateVerifyChainId(91562037n)).toBe(true);

      expect(validateRolesChainId(4646n)).toBe(false);
      expect(validateOnboardChainId(1n)).toBe(false);
      expect(validateAuthChainId(0n)).toBe(false);
      expect(validateVerifyChainId(4646n)).toBe(false);
    });
  });

  describe("2. Address Normalization and Checksum Validation", () => {
    it("normalizes lowercase and mixed-case addresses to canonical checksum", () => {
      const lower = dummyAdmin.toLowerCase();
      expect(normalizeRolesAddress(lower)).toBe(dummyAdmin);
      expect(normalizeOnboardAddress(lower)).toBe(dummyAdmin);
      expect(normalizeAuthAddress(lower)).toBe(dummyAdmin);
      expect(normalizeVerifyAddress(lower)).toBe(dummyAdmin);
    });

    it("rejects empty, invalid, and zero addresses", () => {
      expect(() => normalizeRolesAddress("")).toThrow();
      expect(() => normalizeOnboardAddress("0x0000000000000000000000000000000000000000")).toThrow();
      expect(() => normalizeAuthAddress("not-an-address")).toThrow();
      expect(() => normalizeVerifyAddress("")).toThrow();
    });
  });

  describe("3. Role Plan Generation", () => {
    it("creates full role grant plans for COMPLIANCE, PAUSER, and ISSUER", () => {
      const plans = createTestnetRoleGrantPlans(dummyAdmin, dummyIssuer, dummyCompliance);

      expect(plans.length).toBe(3);
      expect(
        plans.some((p) => p.roleName === "COMPLIANCE_ROLE" && p.roleHash === COMPLIANCE_ROLE_HASH),
      ).toBe(true);
      expect(
        plans.some((p) => p.roleName === "PAUSER_ROLE" && p.roleHash === PAUSER_ROLE_HASH),
      ).toBe(true);
      expect(
        plans.some((p) => p.roleName === "ISSUER_ROLE" && p.roleHash === ISSUER_ROLE_HASH),
      ).toBe(true);
    });
  });

  describe("4. Terminal Confirmation Phrases & Demo Configuration", () => {
    it("verifies expected confirmation guard phrases", () => {
      expect(ONBOARD_CONFIRMATION).toBe("ONBOARD DEMO PROPERTY TESTNET");
      expect(AUTH_CONFIRMATION).toBe("AUTHORIZE STAKING TESTNET");
    });

    it("verifies simulated demo property identifier and reduced issuance of 10 units", () => {
      expect(DEFAULT_DEMO_PROPERTY_ID).toBe("PRP-TEST-SIM-001");
      expect(DEFAULT_ISSUE_AMOUNT).toBe(10n);
    });

    it("verifies zero-day lock configuration for immediate demonstration", () => {
      expect(DEFAULT_POOL_MIN_LOCK).toBe(0n);
    });
  });
});
