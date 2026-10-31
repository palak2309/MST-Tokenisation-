import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  validateConfirmationPhrase,
  getExpectedConfirmationPhrase,
  validateUnstakeEligibility,
  parseTokenId,
  parseUnstakeAmount,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_DEMO_UNSTAKE_AMOUNT,
} from "../../scripts/unstake-mainnet-property";

describe("MST Mainnet Unstaking Operation Safeguards (unstake-mainnet-property.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("validates MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
    });
  });

  describe("2. Confirmation Guard", () => {
    it("enforces exact phrase UNSTAKE 10 MAINNET UNITS", () => {
      expect(CONFIRMATION_PHRASE).toBe("UNSTAKE 10 MAINNET UNITS");
      expect(getExpectedConfirmationPhrase(10n)).toBe("UNSTAKE 10 MAINNET UNITS");
      expect(validateConfirmationPhrase("UNSTAKE 10 MAINNET UNITS")).toBe(true);
      expect(validateConfirmationPhrase("UNSTAKE 10 TESTNET UNITS")).toBe(false);
    });
  });

  describe("3. Unstake Eligibility Check", () => {
    it("allows unstaking when position is sufficient and lock has expired", () => {
      expect(validateUnstakeEligibility(10n, 10n, 1000n, 1001n).valid).toBe(true);
    });

    it("rejects when staked balance is insufficient", () => {
      expect(validateUnstakeEligibility(5n, 10n, 1000n, 1001n).valid).toBe(false);
    });

    it("rejects when lock period is active", () => {
      expect(validateUnstakeEligibility(10n, 10n, 2000n, 1000n).valid).toBe(false);
    });

    it("rejects zero amount unstake", () => {
      expect(validateUnstakeEligibility(10n, 0n, 1000n, 1001n).valid).toBe(false);
    });
  });

  describe("4. Amount & Token ID Parsing", () => {
    it("parses defaults and explicit values", () => {
      expect(DEFAULT_DEMO_UNSTAKE_AMOUNT).toBe(10n);
      expect(parseUnstakeAmount(undefined)).toBe(10n);
      expect(parseUnstakeAmount("25")).toBe(25n);
      expect(parseTokenId(undefined)).toBe(1n);
      expect(parseTokenId("2")).toBe(2n);
    });
  });
});
