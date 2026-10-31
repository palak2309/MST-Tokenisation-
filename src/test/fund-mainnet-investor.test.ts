import { describe, expect, it } from "vitest";
import {
  validateMainnetChainId,
  validateConfirmationPhrase,
  normalizeAccountAddress,
  MAINNET_CHAIN_ID,
  DEFAULT_INVESTOR_ACCOUNT,
  DEFAULT_FUND_AMOUNT_MST,
  CONFIRMATION_PHRASE,
} from "../../scripts/fund-mainnet-investor";

describe("MST Mainnet Investor Gas Funding Safeguards (fund-mainnet-investor.ts)", () => {
  describe("1. Chain ID Validation", () => {
    it("strictly verifies MST Mainnet chain ID 4646", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
      expect(validateMainnetChainId(91562037n)).toBe(false);
      expect(validateMainnetChainId(1n)).toBe(false);
    });
  });

  describe("2. Configuration Defaults", () => {
    it("targets Investor Account 3 and 1.0 MST default", () => {
      expect(DEFAULT_INVESTOR_ACCOUNT.toLowerCase()).toBe(
        "0x120cde3f7326c5689c8f7be7163fd601b8c1dbc2",
      );
      expect(DEFAULT_FUND_AMOUNT_MST).toBe("1.0");
    });
  });

  describe("3. Confirmation Guard", () => {
    it("enforces confirmation phrase FUND INVESTOR ACCOUNT 3", () => {
      expect(CONFIRMATION_PHRASE).toBe("FUND INVESTOR ACCOUNT 3");
      expect(validateConfirmationPhrase("FUND INVESTOR ACCOUNT 3")).toBe(true);
      expect(validateConfirmationPhrase("FUND INVESTOR")).toBe(false);
    });
  });

  describe("4. Account Normalization", () => {
    it("normalizes and validates address checksums", () => {
      const addr = "0x120cde3f7326c5689c8f7be7163fd601b8c1dbc2";
      expect(normalizeAccountAddress(addr)).toBe("0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2");
    });
  });
});
