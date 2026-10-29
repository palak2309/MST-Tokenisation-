import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { id, ZeroHash } from "ethers";
import {
  calculateRequiredBalance,
  validateDeploymentBalance,
  validateAdminAddress,
  validateConfirmationPhrase,
  validateTestnetChainId,
  isDirectExecution,
  normalizeScriptPath,
  matchesScriptPath,
  TESTNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  DEFAULT_FEE_BUFFER_PERCENT,
} from "../../scripts/deploy-testnet-token";
import {
  validateIssuerAddress,
  validateTokenAddress,
  validateGrantConfirmationPhrase,
  validateGrantBalance,
  validateTestnetChainId as validateGrantTestnetChainId,
  GRANT_CONFIRMATION_PHRASE,
  ISSUER_ROLE,
  ISSUER_ROLE_HASH,
  DEFAULT_ADMIN_ROLE,
} from "../../scripts/grant-issuer-role";
import { PROPERTY_TOKEN_ABI } from "../contractConfig";

describe("MST Testnet PropertyToken Deployment & Role Grant Safeguards", () => {
  describe("Fee Buffer & Required Balance Calculation", () => {
    it("calculates 20% fee buffer accurately for estimated cost", () => {
      const estimatedCost = 1_000_000_000_000_000_000n; // 1.0 MST
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(
        estimatedCost,
        DEFAULT_FEE_BUFFER_PERCENT,
      );

      expect(feeBuffer).toBe(200_000_000_000_000_000n); // 0.2 MST
      expect(requiredBalance).toBe(1_200_000_000_000_000_000n); // 1.2 MST
    });

    it("supports custom fee buffer percentages", () => {
      const estimatedCost = 500_000n;
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost, 10n);

      expect(feeBuffer).toBe(50_000n);
      expect(requiredBalance).toBe(550_000n);
    });

    it("throws when estimated cost is negative", () => {
      expect(() => calculateRequiredBalance(-100n)).toThrow("Estimated cost cannot be negative.");
    });

    it("throws when fee buffer percentage is negative", () => {
      expect(() => calculateRequiredBalance(1000n, -5n)).toThrow(
        "Fee buffer percentage cannot be negative.",
      );
    });
  });

  describe("Signer Balance Validation (deploy-testnet-token)", () => {
    const estimatedCost = 1_000_000_000_000_000_000n; // 1.0 MST
    // Required balance with 20% buffer = 1.2 MST

    it("flags insufficient balance when signer has 0 MST", () => {
      const balance = 0n;
      const result = validateDeploymentBalance(balance, estimatedCost, 20n);

      expect(result.sufficient).toBe(false);
      expect(result.estimatedCost).toBe(estimatedCost);
      expect(result.feeBuffer).toBe(200_000_000_000_000_000n);
      expect(result.requiredBalance).toBe(1_200_000_000_000_000_000n);
      expect(result.deficit).toBe(1_200_000_000_000_000_000n);
    });

    it("flags insufficient balance when balance covers estimated cost but NOT the fee buffer", () => {
      const balance = 1_050_000_000_000_000_000n; // 1.05 MST (needs 1.2 MST)
      const result = validateDeploymentBalance(balance, estimatedCost, 20n);

      expect(result.sufficient).toBe(false);
      expect(result.deficit).toBe(150_000_000_000_000_000n); // 0.15 MST deficit
    });

    it("passes validation when balance exactly equals required balance", () => {
      const balance = 1_200_000_000_000_000_000n; // Exactly 1.2 MST
      const result = validateDeploymentBalance(balance, estimatedCost, 20n);

      expect(result.sufficient).toBe(true);
      expect(result.deficit).toBe(0n);
    });

    it("passes validation when balance comfortably exceeds required balance", () => {
      const balance = 5_000_000_000_000_000_000n; // 5.0 MST
      const result = validateDeploymentBalance(balance, estimatedCost, 20n);

      expect(result.sufficient).toBe(true);
      expect(result.deficit).toBe(0n);
    });
  });

  describe("Constructor Admin Address Validation", () => {
    const isMockAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    it("strictly accepts valid non-zero EVM addresses for constructor admin", () => {
      expect(
        validateAdminAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", isMockAddress),
      ).toBe(true);
      expect(
        validateAdminAddress("  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  ", isMockAddress),
      ).toBe(true);
    });

    it("strictly rejects zero address, empty, or undefined constructor admin address", () => {
      expect(
        validateAdminAddress("0x0000000000000000000000000000000000000000", isMockAddress),
      ).toBe(false);
      expect(validateAdminAddress("", isMockAddress)).toBe(false);
      expect(validateAdminAddress("   ", isMockAddress)).toBe(false);
      expect(validateAdminAddress(undefined, isMockAddress)).toBe(false);
      expect(validateAdminAddress("invalid-admin-address", isMockAddress)).toBe(false);
    });
  });

  describe("Interactive Confirmation Phrase Guard", () => {
    it("strictly requires exact confirmation phrase 'DEPLOY PROPERTY TOKEN TESTNET'", () => {
      expect(validateConfirmationPhrase(CONFIRMATION_PHRASE)).toBe(true);
      expect(validateConfirmationPhrase("  DEPLOY PROPERTY TOKEN TESTNET  ")).toBe(true);
    });

    it("rejects partial or incorrect confirmation phrases", () => {
      expect(validateConfirmationPhrase("DEPLOY PROPERTY TOKEN")).toBe(false);
      expect(validateConfirmationPhrase("DEPLOY")).toBe(false);
      expect(validateConfirmationPhrase("deploy property token testnet")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
      expect(validateConfirmationPhrase("DEPLOY MST MAINNET")).toBe(false);
    });
  });

  describe("Chain ID Protection & Network Rejection", () => {
    it("strictly permits MST Testnet chain ID 91562037", () => {
      expect(validateTestnetChainId(TESTNET_CHAIN_ID)).toBe(true);
      expect(validateTestnetChainId(91562037n)).toBe(true);
      expect(validateGrantTestnetChainId(91562037n)).toBe(true);
    });

    it("rejects non-testnet chain IDs (Mainnet, Hardhat local, Ethereum)", () => {
      expect(validateTestnetChainId(4646n)).toBe(false); // MST Mainnet
      expect(validateTestnetChainId(31337n)).toBe(false); // Hardhat Network
      expect(validateTestnetChainId(1n)).toBe(false); // Ethereum Mainnet
      expect(validateTestnetChainId(11155111n)).toBe(false); // Sepolia

      expect(validateGrantTestnetChainId(4646n)).toBe(false); // MST Mainnet
      expect(validateGrantTestnetChainId(31337n)).toBe(false);
      expect(validateGrantTestnetChainId(1n)).toBe(false);
    });
  });

  describe("Project Configuration & Scripts", () => {
    it("includes deploy:testnet script targeting mstTestnet in package.json", () => {
      const packageJsonPath = resolve(process.cwd(), "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

      expect(packageJson.scripts["deploy:testnet"]).toBe(
        "hardhat run scripts/deploy-testnet-token.ts --network mstTestnet",
      );
    });

    it("includes grant:issuer script targeting mstTestnet in package.json", () => {
      const packageJsonPath = resolve(process.cwd(), "package.json");
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

      expect(packageJson.scripts["grant:issuer"]).toBe(
        "hardhat run scripts/grant-issuer-role.ts --network mstTestnet",
      );
    });

    it("includes mstTestnet configuration with chainId 91562037 in hardhat.config.ts", () => {
      const hardhatConfigPath = resolve(process.cwd(), "hardhat.config.ts");
      const configSource = readFileSync(hardhatConfigPath, "utf-8");

      expect(configSource).toContain("mstTestnet:");
      expect(configSource).toContain("chainId: 91562037");
      expect(configSource).toContain("https://testnetrpc.mstblockchain.com");
    });

    it("ensures PROPERTY_TOKEN_ABI exposes grantRole and revokeRole for role management", () => {
      const abiStrings = PROPERTY_TOKEN_ABI as readonly string[];
      expect(abiStrings).toContain("function grantRole(bytes32 role, address account)");
      expect(abiStrings).toContain("function revokeRole(bytes32 role, address account)");
    });
  });

  describe("Issuer Role Grant Safeguards (grant-issuer-role)", () => {
    const isMockAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    it("validates target issuer addresses strictly", () => {
      expect(
        validateIssuerAddress("0x1111111111111111111111111111111111111111", isMockAddress),
      ).toBe(true);
      expect(
        validateIssuerAddress("  0x1111111111111111111111111111111111111111  ", isMockAddress),
      ).toBe(true);
      expect(
        validateIssuerAddress("0x0000000000000000000000000000000000000000", isMockAddress),
      ).toBe(false);
      expect(validateIssuerAddress("", isMockAddress)).toBe(false);
      expect(validateIssuerAddress(undefined, isMockAddress)).toBe(false);
      expect(validateIssuerAddress("invalid-address", isMockAddress)).toBe(false);
    });

    it("validates deployed token addresses strictly", () => {
      expect(
        validateTokenAddress("0x2222222222222222222222222222222222222222", isMockAddress),
      ).toBe(true);
      expect(
        validateTokenAddress("0x0000000000000000000000000000000000000000", isMockAddress),
      ).toBe(false);
      expect(validateTokenAddress("", isMockAddress)).toBe(false);
      expect(validateTokenAddress(undefined, isMockAddress)).toBe(false);
    });

    it("requires exact confirmation phrase 'GRANT ISSUER ROLE'", () => {
      expect(validateGrantConfirmationPhrase(GRANT_CONFIRMATION_PHRASE)).toBe(true);
      expect(validateGrantConfirmationPhrase("  GRANT ISSUER ROLE  ")).toBe(true);
      expect(validateGrantConfirmationPhrase("GRANT ISSUER")).toBe(false);
      expect(validateGrantConfirmationPhrase("grant issuer role")).toBe(false);
      expect(validateGrantConfirmationPhrase("")).toBe(false);
    });

    it("preserves exact ISSUER_ROLE keccak256 hash matching smart contract definition", () => {
      const computedHash = id("ISSUER_ROLE");
      expect(ISSUER_ROLE).toBe(computedHash);
      expect(ISSUER_ROLE_HASH).toBe(computedHash);
      expect(ISSUER_ROLE).toBe(
        "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122",
      );
    });

    it("preserves exact DEFAULT_ADMIN_ROLE zero hash", () => {
      expect(DEFAULT_ADMIN_ROLE).toBe(ZeroHash);
      expect(DEFAULT_ADMIN_ROLE).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("validates admin balance with fee buffer for role grant", () => {
      const estimatedCost = 50_000_000_000_000_000n; // 0.05 MST
      // Required balance with 20% buffer = 0.06 MST

      // Insufficient: 0 MST
      const zeroCheck = validateGrantBalance(0n, estimatedCost, 20n);
      expect(zeroCheck.sufficient).toBe(false);
      expect(zeroCheck.deficit).toBe(60_000_000_000_000_000n);

      // Insufficient: covers gas (0.05 MST) but not buffer (0.06 MST)
      const partialCheck = validateGrantBalance(55_000_000_000_000_000n, estimatedCost, 20n);
      expect(partialCheck.sufficient).toBe(false);
      expect(partialCheck.deficit).toBe(5_000_000_000_000_000n);

      // Sufficient: exactly covers cost + buffer
      const exactCheck = validateGrantBalance(60_000_000_000_000_000n, estimatedCost, 20n);
      expect(exactCheck.sufficient).toBe(true);
      expect(exactCheck.deficit).toBe(0n);

      // Sufficient: exceeds required
      const surplusCheck = validateGrantBalance(1_000_000_000_000_000_000n, estimatedCost, 20n);
      expect(surplusCheck.sufficient).toBe(true);
      expect(surplusCheck.deficit).toBe(0n);
    });
  });

  describe("Entry-Point Direct Execution Safeguards (Hardhat 3 runner compatibility)", () => {
    const scriptMetaUrl = pathToFileURL(resolve("scripts/deploy-testnet-token.ts")).href;
    const cleanEnv: NodeJS.ProcessEnv = { NODE_ENV: "production" };

    it("detects Hardhat 3 CLI run with --no-compile and --network flags", () => {
      const argv = [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Users\\Palak Pathan\\Desktop\\MST-Tokenisation-\\node_modules\\hardhat\\dist\\src\\cli.js",
        "run",
        "--no-compile",
        "scripts/deploy-testnet-token.ts",
        "--network",
        "mstTestnet",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("detects Hardhat 3 CLI run with Windows backslashes in script path", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        "scripts\\deploy-testnet-token.ts",
        "--network",
        "mstTestnet",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("detects Hardhat 3 CLI run with ./ relative path", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        "--no-compile",
        "./scripts/deploy-testnet-token.ts",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("detects Hardhat 3 CLI run with absolute script path", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        resolve("scripts/deploy-testnet-token.ts"),
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("detects direct Node.js execution where argv[1] is the script", () => {
      const argv = ["node", "scripts/deploy-testnet-token.ts"];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(true);
    });

    it("rejects execution when Hardhat runs a different script", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        "scripts/grant-issuer-role.ts",
        "--network",
        "mstTestnet",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(false);
    });

    it("rejects execution when Hardhat task is not 'run' (e.g. test or compile)", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "test",
        "scripts/deploy-testnet-token.ts",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, cleanEnv)).toBe(false);
    });

    it("rejects execution when running inside test runners (VITEST, HARDHAT_TEST, or NODE_ENV=test)", () => {
      const argv = [
        "node",
        "/node_modules/hardhat/dist/src/cli.js",
        "run",
        "scripts/deploy-testnet-token.ts",
      ];
      expect(isDirectExecution(scriptMetaUrl, argv, { VITEST: "true" })).toBe(false);
      expect(isDirectExecution(scriptMetaUrl, argv, { HARDHAT_TEST: "true" })).toBe(false);
      expect(isDirectExecution(scriptMetaUrl, argv, { NODE_ENV: "test" })).toBe(false);
    });

    it("rejects execution when imported during Vitest test runs by default", () => {
      expect(isDirectExecution(scriptMetaUrl)).toBe(false);
    });

    it("rejects execution when argv is too short or invalid", () => {
      expect(isDirectExecution(scriptMetaUrl, ["node"], cleanEnv)).toBe(false);
      expect(isDirectExecution("", ["node", "scripts/deploy-testnet-token.ts"], cleanEnv)).toBe(
        false,
      );
    });
  });
});
