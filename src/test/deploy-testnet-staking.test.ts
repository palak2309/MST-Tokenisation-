import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  calculateRequiredBalance,
  validateDeploymentBalance,
  validateAddress,
  validateConfirmationPhrase,
  validateTestnetChainId,
  isDirectExecution,
  normalizeScriptPath,
  matchesScriptPath,
  TESTNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_FEE_BUFFER_PERCENT,
  DEFAULT_TESTNET_TOKEN_ADDRESS,
} from "../../scripts/deploy-testnet-staking";

describe("MST Testnet PropertyTokenStaking Deployment Safeguards (deploy-testnet-staking.ts)", () => {
  const isMockAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  describe("1. Chain ID Validation", () => {
    it("accepts MST Testnet chain ID 91562037 strictly", () => {
      expect(TESTNET_CHAIN_ID).toBe(91562037n);
      expect(validateTestnetChainId(91562037n)).toBe(true);
    });

    it("rejects non-Testnet chain IDs (including Mainnet 4646 and Ethereum 1)", () => {
      expect(validateTestnetChainId(4646n)).toBe(false);
      expect(validateTestnetChainId(1n)).toBe(false);
      expect(validateTestnetChainId(137n)).toBe(false);
      expect(validateTestnetChainId(0n)).toBe(false);
    });
  });

  describe("2. Confirmation Phrase Guard", () => {
    it("accepts exact confirmation phrase 'DEPLOY STAKING CONTRACT TESTNET'", () => {
      expect(CONFIRMATION_PHRASE).toBe("DEPLOY STAKING CONTRACT TESTNET");
      expect(validateConfirmationPhrase("DEPLOY STAKING CONTRACT TESTNET")).toBe(true);
      expect(validateConfirmationPhrase("  DEPLOY STAKING CONTRACT TESTNET  ")).toBe(true);
    });

    it("rejects incorrect or partial phrases", () => {
      expect(validateConfirmationPhrase("DEPLOY STAKING CONTRACT")).toBe(false);
      expect(validateConfirmationPhrase("DEPLOY PROPERTY TOKEN TESTNET")).toBe(false);
      expect(validateConfirmationPhrase("deploy staking contract testnet")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("3. Address Validation", () => {
    const validTestnetToken = DEFAULT_TESTNET_TOKEN_ADDRESS;
    const validAdmin = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";

    it("accepts valid EVM non-zero addresses", () => {
      expect(validateAddress(validTestnetToken, isMockAddress, zeroAddress)).toBe(true);
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

  describe("4. Gas Fee Buffer and Required Balance Calculation", () => {
    it("calculates 20% default fee buffer accurately", () => {
      const estimatedCost = 1000000000000000000n; // 1.0 MST
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost);

      expect(feeBuffer).toBe(200000000000000000n); // 0.2 MST
      expect(requiredBalance).toBe(1200000000000000000n); // 1.2 MST
    });

    it("supports custom fee buffer percentages", () => {
      const estimatedCost = 1000000000000000000n;
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost, 10n);

      expect(feeBuffer).toBe(100000000000000000n);
      expect(requiredBalance).toBe(1100000000000000000n);
    });

    it("rejects negative costs or negative buffer percentages", () => {
      expect(() => calculateRequiredBalance(-1n)).toThrow("Estimated cost cannot be negative.");
      expect(() => calculateRequiredBalance(100n, -5n)).toThrow(
        "Fee buffer percentage cannot be negative.",
      );
    });
  });

  describe("5. Balance Sufficiency Validation", () => {
    const estimatedCost = 1000000000000000000n; // 1.0 MST
    const requiredBalance = 1200000000000000000n; // 1.2 MST with 20% buffer

    it("passes when balance strictly exceeds required balance", () => {
      const balance = 2000000000000000000n; // 2.0 MST
      const check = validateDeploymentBalance(balance, estimatedCost, DEFAULT_FEE_BUFFER_PERCENT);

      expect(check.sufficient).toBe(true);
      expect(check.requiredBalance).toBe(requiredBalance);
      expect(check.deficit).toBe(0n);
    });

    it("passes when balance equals required balance exactly", () => {
      const check = validateDeploymentBalance(
        requiredBalance,
        estimatedCost,
        DEFAULT_FEE_BUFFER_PERCENT,
      );

      expect(check.sufficient).toBe(true);
      expect(check.deficit).toBe(0n);
    });

    it("fails when balance covers estimated cost but does not cover the safety buffer", () => {
      const balance = 1100000000000000000n; // 1.1 MST (estimated cost 1.0, needed 1.2)
      const check = validateDeploymentBalance(balance, estimatedCost, DEFAULT_FEE_BUFFER_PERCENT);

      expect(check.sufficient).toBe(false);
      expect(check.deficit).toBe(100000000000000000n); // 0.1 MST deficit
    });

    it("fails when balance is below estimated cost", () => {
      const balance = 500000000000000000n; // 0.5 MST
      const check = validateDeploymentBalance(balance, estimatedCost, DEFAULT_FEE_BUFFER_PERCENT);

      expect(check.sufficient).toBe(false);
      expect(check.deficit).toBe(700000000000000000n); // 0.7 MST deficit
    });
  });

  describe("6. Path Normalization and Direct Execution Detection", () => {
    it("normalizes path with forward slashes and lowercase", () => {
      const normalized = normalizeScriptPath("C:\\repo\\scripts\\deploy-testnet-staking.ts");
      expect(normalized).toBe("c:/repo/scripts/deploy-testnet-staking.ts");
    });

    it("matches script path with or without extension", () => {
      const target = "c:/repo/scripts/deploy-testnet-staking.ts";
      expect(matchesScriptPath("c:/repo/scripts/deploy-testnet-staking.ts", target)).toBe(true);
      expect(matchesScriptPath("c:/repo/scripts/deploy-testnet-staking", target)).toBe(true);
      expect(matchesScriptPath("c:/repo/scripts/other-script.ts", target)).toBe(false);
      expect(matchesScriptPath("--network", target)).toBe(false);
    });

    it("suppresses execution in test environments", () => {
      const dummyUrl = pathToFileURL(resolve("scripts/deploy-testnet-staking.ts")).href;
      expect(
        isDirectExecution(dummyUrl, ["node", "scripts/deploy-testnet-staking.ts"], {
          VITEST: "true",
        }),
      ).toBe(false);
      expect(
        isDirectExecution(dummyUrl, ["node", "scripts/deploy-testnet-staking.ts"], {
          HARDHAT_TEST: "true",
        }),
      ).toBe(false);
      expect(
        isDirectExecution(dummyUrl, ["node", "scripts/deploy-testnet-staking.ts"], {
          NODE_ENV: "test",
        }),
      ).toBe(false);
    });
  });
});
