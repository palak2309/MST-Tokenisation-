import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  calculateRequiredBalance,
  validateDeploymentBalance,
  validateAdminAddress,
  validateConfirmationPhrase,
  validateMainnetChainId,
  isDirectExecution,
  normalizeScriptPath,
  matchesScriptPath,
  MAINNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_FEE_BUFFER_PERCENT,
} from "../../scripts/deploy-mainnet-token";

describe("MST Mainnet PropertyToken Deployment Safeguards (deploy-mainnet-token.ts)", () => {
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
    it("accepts exact confirmation phrase 'DEPLOY MST MAINNET TOKEN'", () => {
      expect(CONFIRMATION_PHRASE).toBe("DEPLOY MST MAINNET TOKEN");
      expect(validateConfirmationPhrase("DEPLOY MST MAINNET TOKEN")).toBe(true);
      expect(validateConfirmationPhrase("  DEPLOY MST MAINNET TOKEN  ")).toBe(true);
    });

    it("rejects incorrect or partial phrases", () => {
      expect(validateConfirmationPhrase("DEPLOY MST MAINNET")).toBe(false);
      expect(validateConfirmationPhrase("DEPLOY PROPERTY TOKEN TESTNET")).toBe(false);
      expect(validateConfirmationPhrase("deploy mst mainnet token")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("3. Admin Address Validation", () => {
    it("accepts a valid EVM address for admin", () => {
      expect(
        validateAdminAddress(
          "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          isMockAddress,
          zeroAddress,
        ),
      ).toBe(true);
    });

    it("rejects zero address as admin", () => {
      expect(validateAdminAddress(zeroAddress, isMockAddress, zeroAddress)).toBe(false);
    });

    it("rejects empty, undefined, or malformed addresses", () => {
      expect(validateAdminAddress("", isMockAddress, zeroAddress)).toBe(false);
      expect(validateAdminAddress(undefined, isMockAddress, zeroAddress)).toBe(false);
      expect(validateAdminAddress("not-an-address", isMockAddress, zeroAddress)).toBe(false);
      expect(validateAdminAddress("0x123", isMockAddress, zeroAddress)).toBe(false);
    });
  });

  describe("4. Fee Buffer & Deployment Balance Calculations", () => {
    it("calculates 20% safety fee buffer accurately", () => {
      const estimatedCost = 1_000_000_000_000_000_000n; // 1.0 MST
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(
        estimatedCost,
        DEFAULT_FEE_BUFFER_PERCENT,
      );

      expect(feeBuffer).toBe(200_000_000_000_000_000n); // 0.2 MST
      expect(requiredBalance).toBe(1_200_000_000_000_000_000n); // 1.2 MST
    });

    it("flags insufficient balance when deployer balance is below required threshold", () => {
      const estimatedCost = 1_000_000_000_000_000_000n; // 1.0 MST
      const balance = 1_050_000_000_000_000_000n; // 1.05 MST (needs 1.2 MST with buffer)

      const result = validateDeploymentBalance(balance, estimatedCost, DEFAULT_FEE_BUFFER_PERCENT);
      expect(result.sufficient).toBe(false);
      expect(result.deficit).toBe(150_000_000_000_000_000n);
    });

    it("passes validation when balance meets or exceeds required balance", () => {
      const estimatedCost = 1_000_000_000_000_000_000n; // 1.0 MST
      const balance = 2_000_000_000_000_000_000n; // 2.0 MST

      const result = validateDeploymentBalance(balance, estimatedCost, DEFAULT_FEE_BUFFER_PERCENT);
      expect(result.sufficient).toBe(true);
      expect(result.deficit).toBe(0n);
    });

    it("throws when estimated cost is negative", () => {
      expect(() => calculateRequiredBalance(-1n)).toThrow("Estimated cost cannot be negative.");
    });
  });

  describe("5. Direct Execution Guard", () => {
    const scriptMetaUrl = pathToFileURL(resolve("scripts/deploy-mainnet-token.ts")).href;
    const cleanEnv: NodeJS.ProcessEnv = { NODE_ENV: "production" };

    it("never executes automatically during test runs", () => {
      expect(isDirectExecution(scriptMetaUrl)).toBe(false);
      expect(
        isDirectExecution(scriptMetaUrl, ["node", "scripts/deploy-mainnet-token.ts"], {
          VITEST: "true",
        }),
      ).toBe(false);
      expect(
        isDirectExecution(scriptMetaUrl, ["node", "scripts/deploy-mainnet-token.ts"], {
          HARDHAT_TEST: "true",
        }),
      ).toBe(false);
      expect(
        isDirectExecution(scriptMetaUrl, ["node", "scripts/deploy-mainnet-token.ts"], {
          NODE_ENV: "test",
        }),
      ).toBe(false);
    });

    it("detects direct Node.js execution when argv[1] points to the script", () => {
      const argv = ["node", "scripts/deploy-mainnet-token.ts"];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("detects Hardhat CLI runner with 'run' task", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        "scripts/deploy-mainnet-token.ts",
        "--network",
        "mstMainnet",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("rejects execution when Hardhat task is not 'run' (e.g. compile or test)", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "test",
        "scripts/deploy-mainnet-token.ts",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(false);
    });
  });
});
