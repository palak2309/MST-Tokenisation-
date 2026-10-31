import { describe, expect, it } from "vitest";
import {
  calculateRequiredBalance,
  validateDeploymentBalance,
  validateAddress,
  validateConfirmationPhrase,
  validateMainnetChainId,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_FEE_BUFFER_PERCENT,
} from "../../scripts/deploy-mainnet-staking";

describe("MST Mainnet PropertyTokenStaking Deployment Safeguards (deploy-mainnet-staking.ts)", () => {
  const isMockAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  describe("1. Chain ID Validation", () => {
    it("accepts MST Mainnet chain ID 4646 strictly", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
    });

    it("rejects non-Mainnet chain IDs (including Testnet 91562037 and Ethereum 1)", () => {
      expect(validateMainnetChainId(91562037n)).toBe(false);
      expect(validateMainnetChainId(1n)).toBe(false);
      expect(validateMainnetChainId(137n)).toBe(false);
      expect(validateMainnetChainId(0n)).toBe(false);
    });
  });

  describe("2. Confirmation Phrase Guard", () => {
    it("accepts exact confirmation phrase 'DEPLOY STAKING CONTRACT MAINNET'", () => {
      expect(CONFIRMATION_PHRASE).toBe("DEPLOY STAKING CONTRACT MAINNET");
      expect(validateConfirmationPhrase("DEPLOY STAKING CONTRACT MAINNET")).toBe(true);
      expect(validateConfirmationPhrase("  DEPLOY STAKING CONTRACT MAINNET  ")).toBe(true);
    });

    it("rejects incorrect or partial phrases", () => {
      expect(validateConfirmationPhrase("DEPLOY STAKING CONTRACT")).toBe(false);
      expect(validateConfirmationPhrase("DEPLOY STAKING CONTRACT TESTNET")).toBe(false);
      expect(validateConfirmationPhrase("deploy staking contract mainnet")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("3. Address Validation", () => {
    const validMainnetToken = "0x39985d784615f307D34B8143768a54bEEaB94537";
    const validAdmin = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";

    it("accepts valid EVM non-zero addresses", () => {
      expect(validateAddress(validMainnetToken, isMockAddress, zeroAddress)).toBe(true);
      expect(validateAddress(validAdmin, isMockAddress, zeroAddress)).toBe(true);
    });

    it("rejects zero address, empty strings, and malformed addresses", () => {
      expect(validateAddress(zeroAddress, isMockAddress, zeroAddress)).toBe(false);
      expect(validateAddress("", isMockAddress, zeroAddress)).toBe(false);
      expect(validateAddress("   ", isMockAddress, zeroAddress)).toBe(false);
      expect(validateAddress("not-an-address", isMockAddress, zeroAddress)).toBe(false);
      expect(validateAddress(undefined, isMockAddress, zeroAddress)).toBe(false);
    });
  });

  describe("4. Fee and Balance Calculation", () => {
    it("calculates 20% safety fee buffer accurately", () => {
      const estimatedCost = 1000000000000000000n; // 1.0 MST
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(
        estimatedCost,
        DEFAULT_FEE_BUFFER_PERCENT,
      );
      expect(feeBuffer).toBe(200000000000000000n); // 0.2 MST
      expect(requiredBalance).toBe(1200000000000000000n); // 1.2 MST
    });

    it("validates deployment balance correctly when balance is sufficient", () => {
      const balance = 2000000000000000000n; // 2.0 MST
      const estimatedCost = 1000000000000000000n; // 1.0 MST
      const result = validateDeploymentBalance(balance, estimatedCost);
      expect(result.sufficient).toBe(true);
      expect(result.deficit).toBe(0n);
    });

    it("identifies deficit when balance is insufficient", () => {
      const balance = 1000000000000000000n; // 1.0 MST
      const estimatedCost = 1000000000000000000n; // 1.0 MST (requires 1.2 MST with buffer)
      const result = validateDeploymentBalance(balance, estimatedCost);
      expect(result.sufficient).toBe(false);
      expect(result.deficit).toBe(200000000000000000n); // 0.2 MST deficit
    });
  });
});
