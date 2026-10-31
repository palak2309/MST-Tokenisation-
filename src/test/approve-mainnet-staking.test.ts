import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  validateConfirmationPhrase,
  validateUnitsBalance,
  validateComplianceStatus,
  parseTokenId,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  MIN_REQUIRED_UNITS,
} from "../../scripts/approve-mainnet-staking";

describe("MST Mainnet Staking Approval Safeguards (approve-mainnet-staking.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("strictly validates MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
    });
  });

  describe("2. Confirmation Guard", () => {
    it("enforces exact phrase APPROVE MAINNET STAKING", () => {
      expect(CONFIRMATION_PHRASE).toBe("APPROVE MAINNET STAKING");
      expect(validateConfirmationPhrase("APPROVE MAINNET STAKING")).toBe(true);
      expect(validateConfirmationPhrase("APPROVE TESTNET STAKING")).toBe(false);
    });
  });

  describe("3. Units Balance Verification", () => {
    it("requires at least 10 units for approval", () => {
      expect(MIN_REQUIRED_UNITS).toBe(10n);
      expect(validateUnitsBalance(10n).sufficient).toBe(true);
      expect(validateUnitsBalance(5n).sufficient).toBe(false);
    });
  });

  describe("4. Compliance Status Verification", () => {
    it("approves when investor, staking whitelist, and staking exemption are true", () => {
      expect(validateComplianceStatus(true, true, true).valid).toBe(true);
    });

    it("rejects when investor is not KYC eligible", () => {
      expect(validateComplianceStatus(false, true, true).valid).toBe(false);
    });

    it("rejects when staking contract is not whitelisted", () => {
      expect(validateComplianceStatus(true, false, true).valid).toBe(false);
    });

    it("rejects when staking exemption is missing", () => {
      expect(validateComplianceStatus(true, true, false).valid).toBe(false);
    });
  });

  describe("5. Token ID Parsing", () => {
    it("defaults to 1 and parses valid integer IDs", () => {
      expect(parseTokenId(undefined)).toBe(1n);
      expect(parseTokenId("2")).toBe(2n);
      expect(() => parseTokenId("abc")).toThrow();
    });
  });
});
