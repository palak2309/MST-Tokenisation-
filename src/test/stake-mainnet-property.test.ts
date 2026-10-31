import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  validateLockDuration,
  validateConfirmationPhrase,
  getExpectedConfirmationPhrase,
  validatePoolConfiguration,
  validateStakingEligibility,
  parseTokenId,
  parseStakeAmount,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_DEMO_STAKE_AMOUNT,
  DEFAULT_DEMO_LOCK_DURATION,
} from "../../scripts/stake-mainnet-property";

describe("MST Mainnet Staking Operation Safeguards (stake-mainnet-property.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("validates MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
    });
  });

  describe("2. Confirmation Guard", () => {
    it("enforces exact phrase STAKE 10 MAINNET UNITS", () => {
      expect(CONFIRMATION_PHRASE).toBe("STAKE 10 MAINNET UNITS");
      expect(getExpectedConfirmationPhrase(10n)).toBe("STAKE 10 MAINNET UNITS");
      expect(validateConfirmationPhrase("STAKE 10 MAINNET UNITS")).toBe(true);
      expect(validateConfirmationPhrase("STAKE 10 TESTNET UNITS")).toBe(false);
    });
  });

  describe("3. Demo Lock Duration", () => {
    it("requires 0 seconds for demo lock", () => {
      expect(DEFAULT_DEMO_LOCK_DURATION).toBe(0n);
      expect(validateLockDuration(0n)).toBe(true);
      expect(validateLockDuration(100n)).toBe(false);
    });
  });

  describe("4. Pool Configuration Check", () => {
    it("accepts active pool within lock limits", () => {
      const config = { minLockDuration: 0n, maxLockDuration: 365n * 86400n, isEnabled: true };
      expect(validatePoolConfiguration(config, 0n).valid).toBe(true);
    });

    it("rejects disabled pool", () => {
      const config = { minLockDuration: 10n, maxLockDuration: 365n * 86400n, isEnabled: false };
      expect(validatePoolConfiguration(config, 0n).valid).toBe(false);
    });
  });

  describe("5. Eligibility Check", () => {
    it("passes when all compliance criteria are satisfied", () => {
      expect(validateStakingEligibility(10n, 10n, true, true, true).valid).toBe(true);
    });

    it("rejects when balance is insufficient", () => {
      expect(validateStakingEligibility(5n, 10n, true, true, true).valid).toBe(false);
    });

    it("rejects when operator is not approved", () => {
      expect(validateStakingEligibility(10n, 10n, true, false, true).valid).toBe(false);
    });

    it("rejects when staking exemption is not authorized", () => {
      expect(validateStakingEligibility(10n, 10n, true, true, false).valid).toBe(false);
    });
  });

  describe("6. Amount & Token ID Parsing", () => {
    it("parses defaults and explicit values", () => {
      expect(DEFAULT_DEMO_STAKE_AMOUNT).toBe(10n);
      expect(parseStakeAmount(undefined)).toBe(10n);
      expect(parseStakeAmount("20")).toBe(20n);
      expect(parseTokenId(undefined)).toBe(1n);
      expect(parseTokenId("2")).toBe(2n);
    });
  });
});
