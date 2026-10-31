import { describe, expect, it, vi } from "vitest";
import {
  TESTNET_CHAIN_ID,
  CONFIRMATION_PHRASE,
  MIN_REQUIRED_UNITS,
  DEFAULT_DEMO_TOKEN_ID,
  validateTestnetChainId,
  normalizeAccountAddress,
  validateConfirmationPhrase,
  parseTokenId,
  validateUnitsBalance,
  validateComplianceStatus,
  validateEnvironmentConfig,
  executeApprovalFlow,
  normalizeScriptPath,
  matchesScriptPath,
  isDirectExecution,
  type IPropertyTokenApproval,
} from "../../scripts/approve-testnet-staking";

describe("MST Testnet Staking Approval Script (scripts/approve-testnet-staking.ts)", () => {
  const dummyOwner = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
  const dummyToken = "0x39985d784615f307D34B8143768a54bEEaB94537";
  const dummyStaking = "0x681Ef61D12372e040EE5f6e058932818aA29407F";

  describe("1. Network & Chain ID Enforcement", () => {
    it("strictly accepts MST Testnet chain ID 91562037", () => {
      expect(TESTNET_CHAIN_ID).toBe(91562037n);
      expect(validateTestnetChainId(91562037n)).toBe(true);
    });

    it("rejects non-Testnet chain IDs (Mainnet 4646, Ethereum 1, zero)", () => {
      expect(validateTestnetChainId(4646n)).toBe(false);
      expect(validateTestnetChainId(1n)).toBe(false);
      expect(validateTestnetChainId(0n)).toBe(false);
      expect(validateTestnetChainId(137n)).toBe(false);
    });
  });

  describe("2. Configuration & Environment Validation", () => {
    it("successfully validates valid environment configuration", () => {
      const env = {
        MST_TESTNET_TOKEN_CONTRACT_ADDRESS: dummyToken,
        MST_TESTNET_STAKING_CONTRACT_ADDRESS: dummyStaking,
        MST_TESTNET_TOKEN_ID: "1",
      };

      const config = validateEnvironmentConfig(env);
      expect(config.tokenAddress).toBe(dummyToken);
      expect(config.stakingAddress).toBe(dummyStaking);
      expect(config.tokenId).toBe(1n);
    });

    it("throws when MST_TESTNET_TOKEN_CONTRACT_ADDRESS is missing", () => {
      const env = {
        MST_TESTNET_STAKING_CONTRACT_ADDRESS: dummyStaking,
      };

      expect(() => validateEnvironmentConfig(env)).toThrow(
        "MST_TESTNET_TOKEN_CONTRACT_ADDRESS is required",
      );
    });

    it("throws when MST_TESTNET_STAKING_CONTRACT_ADDRESS is missing", () => {
      const env = {
        MST_TESTNET_TOKEN_CONTRACT_ADDRESS: dummyToken,
      };

      expect(() => validateEnvironmentConfig(env)).toThrow(
        "MST_TESTNET_STAKING_CONTRACT_ADDRESS is required",
      );
    });

    it("throws when token address and staking address are identical", () => {
      const env = {
        MST_TESTNET_TOKEN_CONTRACT_ADDRESS: dummyToken,
        MST_TESTNET_STAKING_CONTRACT_ADDRESS: dummyToken,
      };

      expect(() => validateEnvironmentConfig(env)).toThrow(
        "PropertyToken and PropertyTokenStaking cannot have the same address",
      );
    });

    it("normalizes mixed-case and lowercase addresses", () => {
      expect(normalizeAccountAddress(dummyToken.toLowerCase())).toBe(dummyToken);
      expect(normalizeAccountAddress(dummyStaking.toLowerCase())).toBe(dummyStaking);
    });

    it("rejects invalid, empty, or zero addresses", () => {
      expect(() => normalizeAccountAddress("")).toThrow("Address must be a non-empty string.");
      expect(() => normalizeAccountAddress("0x0000000000000000000000000000000000000000")).toThrow(
        "Address cannot be empty or the zero address.",
      );
      expect(() => normalizeAccountAddress("not-an-address")).toThrow();
    });

    it("parses token ID correctly with defaults and error handling", () => {
      expect(parseTokenId(undefined)).toBe(DEFAULT_DEMO_TOKEN_ID);
      expect(parseTokenId("")).toBe(1n);
      expect(parseTokenId("5")).toBe(5n);
      expect(() => parseTokenId("0")).toThrow("Token ID must be a positive integer.");
      expect(() => parseTokenId("-1")).toThrow("Token ID must be a positive integer.");
      expect(() => parseTokenId("abc")).toThrow("Must be a valid positive integer.");
    });
  });

  describe("3. Unit Balance & Compliance Pre-Flight Checks", () => {
    it("verifies unit balance against the minimum requirement (10 units)", () => {
      expect(MIN_REQUIRED_UNITS).toBe(10n);

      const pass = validateUnitsBalance(10n);
      expect(pass.sufficient).toBe(true);
      expect(pass.deficit).toBe(0n);

      const excess = validateUnitsBalance(100n);
      expect(excess.sufficient).toBe(true);

      const fail = validateUnitsBalance(7n);
      expect(fail.sufficient).toBe(false);
      expect(fail.deficit).toBe(3n);

      expect(() => validateUnitsBalance(-1n)).toThrow("Balance cannot be negative.");
    });

    it("validates compliance whitelist and transfer authorization status", () => {
      // All true -> valid
      expect(validateComplianceStatus(true, true, true).valid).toBe(true);

      // Investor not eligible
      const check1 = validateComplianceStatus(false, true, true);
      expect(check1.valid).toBe(false);
      expect(check1.reason).toContain("Signer is not whitelisted");

      // Staking contract not eligible
      const check2 = validateComplianceStatus(true, false, true);
      expect(check2.valid).toBe(false);
      expect(check2.reason).toContain("Staking contract is not whitelisted");

      // Staking contract not authorized for transfer exemption
      const check3 = validateComplianceStatus(true, true, false);
      expect(check3.valid).toBe(false);
      expect(check3.reason).toContain("Staking contract is not authorized");
    });
  });

  describe("4. Terminal Confirmation Phrase", () => {
    it("validates exact confirmation phrase 'APPROVE TESTNET STAKING'", () => {
      expect(CONFIRMATION_PHRASE).toBe("APPROVE TESTNET STAKING");
      expect(validateConfirmationPhrase("APPROVE TESTNET STAKING")).toBe(true);
      expect(validateConfirmationPhrase("  APPROVE TESTNET STAKING  ")).toBe(true);

      expect(validateConfirmationPhrase("approve testnet staking")).toBe(false);
      expect(validateConfirmationPhrase("APPROVE STAKING")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("5. Already-Approved State Handling", () => {
    it("returns immediately without broadcasting when operator is already approved", async () => {
      const mockSetApproval = vi.fn();
      const mockPrompt = vi.fn();

      const mockContract: IPropertyTokenApproval = {
        balanceOf: vi.fn().mockResolvedValue(10n),
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockResolvedValue(true), // Already approved!
        setApprovalForAll: mockSetApproval,
      };

      const result = await executeApprovalFlow({
        tokenContract: mockContract,
        signerAddress: dummyOwner,
        tokenAddress: dummyToken,
        stakingAddress: dummyStaking,
        tokenId: 1n,
        promptConfirmation: mockPrompt,
      });

      expect(result.alreadyApproved).toBe(true);
      expect(result.approved).toBe(true);
      expect(result.owner).toBe(dummyOwner);
      expect(result.operator).toBe(dummyStaking);
      expect(result.unitsBalance).toBe(10n);

      // Neither prompt nor on-chain transaction should have been triggered
      expect(mockPrompt).not.toHaveBeenCalled();
      expect(mockSetApproval).not.toHaveBeenCalled();
    });
  });

  describe("6. Successful Approval Execution Flow", () => {
    it("prompts confirmation, calls setApprovalForAll, and verifies approval on-chain", async () => {
      let approvedState = false;

      const mockSetApproval = vi
        .fn()
        .mockImplementation(async (operator: string, approved: boolean) => {
          expect(operator).toBe(dummyStaking);
          expect(approved).toBe(true);
          approvedState = true;
          return {
            hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            wait: vi.fn().mockResolvedValue({ status: 1 }),
          };
        });

      const mockContract: IPropertyTokenApproval = {
        balanceOf: vi.fn().mockResolvedValue(15n),
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockImplementation(async () => approvedState),
        setApprovalForAll: mockSetApproval,
      };

      const mockPrompt = vi.fn().mockResolvedValue("APPROVE TESTNET STAKING");

      const result = await executeApprovalFlow({
        tokenContract: mockContract,
        signerAddress: dummyOwner,
        tokenAddress: dummyToken,
        stakingAddress: dummyStaking,
        tokenId: 1n,
        promptConfirmation: mockPrompt,
      });

      expect(result.alreadyApproved).toBe(false);
      expect(result.approved).toBe(true);
      expect(result.owner).toBe(dummyOwner);
      expect(result.operator).toBe(dummyStaking);
      expect(result.unitsBalance).toBe(15n);
      expect(result.txHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );

      expect(mockPrompt).toHaveBeenCalledOnce();
      expect(mockSetApproval).toHaveBeenCalledOnce();
    });

    it("aborts approval when confirmation phrase does not match", async () => {
      const mockSetApproval = vi.fn();

      const mockContract: IPropertyTokenApproval = {
        balanceOf: vi.fn().mockResolvedValue(10n),
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockResolvedValue(false),
        setApprovalForAll: mockSetApproval,
      };

      const mockPrompt = vi.fn().mockResolvedValue("wrong phrase");

      await expect(
        executeApprovalFlow({
          tokenContract: mockContract,
          signerAddress: dummyOwner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          promptConfirmation: mockPrompt,
        }),
      ).rejects.toThrow("Approval cancelled; confirmation phrase did not match.");

      expect(mockSetApproval).not.toHaveBeenCalled();
    });

    it("aborts approval when signer owns fewer than 10 units", async () => {
      const mockContract: IPropertyTokenApproval = {
        balanceOf: vi.fn().mockResolvedValue(5n), // Only 5 units
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockResolvedValue(false),
        setApprovalForAll: vi.fn(),
      };

      await expect(
        executeApprovalFlow({
          tokenContract: mockContract,
          signerAddress: dummyOwner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
        }),
      ).rejects.toThrow("at least 10 units are required (deficit: 5 units)");
    });

    it("aborts approval when compliance prerequisites are not met", async () => {
      const mockContract: IPropertyTokenApproval = {
        balanceOf: vi.fn().mockResolvedValue(10n),
        isEligibleInvestor: vi.fn().mockResolvedValue(false), // Investor not eligible!
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockResolvedValue(false),
        setApprovalForAll: vi.fn(),
      };

      await expect(
        executeApprovalFlow({
          tokenContract: mockContract,
          signerAddress: dummyOwner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
        }),
      ).rejects.toThrow("Signer is not whitelisted as an eligible investor");
    });
  });

  describe("7. Direct Execution Safeguards", () => {
    it("prevents execution during test runs", () => {
      expect(isDirectExecution(import.meta.url)).toBe(false);
    });

    it("normalizes script paths reliably", () => {
      const normalized = normalizeScriptPath("C:\\path\\scripts\\approve-testnet-staking.ts");
      expect(normalized).toBe("c:/path/scripts/approve-testnet-staking.ts");
      expect(matchesScriptPath("scripts/approve-testnet-staking.ts", normalized)).toBe(false);
    });
  });
});
