import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  normalizeAccountAddress,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_POOL_MIN_LOCK,
  DEFAULT_POOL_MAX_LOCK,
} from "../../scripts/authorize-mainnet-staking";

describe("MST Mainnet Compliance Staking Authorization Safeguards (authorize-mainnet-staking.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("strictly verifies MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
    });
  });

  describe("2. Confirmation Guard", () => {
    it("enforces confirmation phrase AUTHORIZE STAKING MAINNET", () => {
      expect(CONFIRMATION_PHRASE).toBe("AUTHORIZE STAKING MAINNET");
    });
  });

  describe("3. Staking Lock Limits", () => {
    it("defaults to 0-day lock for flexible demonstration", () => {
      expect(DEFAULT_POOL_MIN_LOCK).toBe(0n);
      expect(DEFAULT_POOL_MAX_LOCK).toBe(365n * 86400n);
    });
  });

  describe("4. Account Normalization", () => {
    it("normalizes and validates EVM addresses", () => {
      const addr = "0xef9fe181ed6659096895bb54f71487b67e3b262b";
      expect(normalizeAccountAddress(addr)).toBe("0xEF9fE181ed6659096895bb54f71487B67E3b262b");
    });
  });
});
