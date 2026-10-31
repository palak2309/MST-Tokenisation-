import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  normalizeAccountAddress,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_MAINNET_PROPERTY_ID,
  DEFAULT_MAINNET_DOC_HASH,
  DEFAULT_MAINNET_MAX_SUPPLY,
  DEFAULT_MAINNET_UNIT_PRICE,
  DEFAULT_INVESTOR_ACCOUNT,
} from "../../scripts/onboard-mainnet-property";

describe("MST Mainnet Property Onboarding Safeguards (onboard-mainnet-property.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("strictly verifies MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
      expect(validateMainnetChainId(1n)).toBe(false);
    });
  });

  describe("2. Configuration Defaults", () => {
    it("provides correct demo property and investor details for MST-DEMO-PUNE-002", () => {
      expect(DEFAULT_MAINNET_PROPERTY_ID).toBe("MST-DEMO-PUNE-002");
      expect(DEFAULT_MAINNET_DOC_HASH).toBe(
        "0x9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6",
      );
      expect(DEFAULT_MAINNET_MAX_SUPPLY).toBe(1500n);
      expect(DEFAULT_MAINNET_UNIT_PRICE).toBe(100000n);
      expect(DEFAULT_INVESTOR_ACCOUNT.toLowerCase()).toBe(
        "0x120cde3f7326c5689c8f7be7163fd601b8c1dbc2",
      );
    });
  });

  describe("3. Confirmation Guard", () => {
    it("enforces confirmation phrase ONBOARD DEMO PROPERTY MAINNET", () => {
      expect(CONFIRMATION_PHRASE).toBe("ONBOARD DEMO PROPERTY MAINNET");
    });
  });

  describe("4. Account Normalization", () => {
    it("normalizes addresses to canonical checksum", () => {
      const addr = "0x120cde3f7326c5689c8f7be7163fd601b8c1dbc2";
      expect(normalizeAccountAddress(addr)).toBe("0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2");
    });

    it("rejects invalid or empty address", () => {
      expect(() => normalizeAccountAddress("")).toThrow();
      expect(() => normalizeAccountAddress("0x0000000000000000000000000000000000000000")).toThrow();
    });
  });
});
