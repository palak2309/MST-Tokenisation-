import { describe, expect, it, vi } from "vitest";
import {
  TESTNET_CHAIN_ID,
  DEFAULT_DEMO_TOKEN_ID,
  DEFAULT_DEMO_UNSTAKE_AMOUNT,
  CONFIRMATION_PHRASE,
  validateTestnetChainId,
  normalizeAccountAddress,
  getExpectedConfirmationPhrase,
  validateConfirmationPhrase,
  parseTokenId,
  parseUnstakeAmount,
  validateStakePosition,
  validateEnvironmentConfig,
  executeUnstakeFlow,
  normalizeScriptPath,
  matchesScriptPath,
  isDirectExecution,
  type IPropertyTokenUnstakeView,
  type IStakingContractUnstake,
} from "../../scripts/unstake-testnet-property";

describe("MST Testnet Unstaking Execution Script (scripts/unstake-testnet-property.ts)", () => {
  const dummySigner = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
  const dummyToken = "0x39985d784615f307D34B8143768a54bEEaB94537";
  const dummyStaking = "0x681Ef61D12372e040EE5f6e058932818aA29407F";

  describe("1. Network & Chain ID Enforcement", () => {
    it("accepts MST Testnet chain ID 91562037 strictly", () => {
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

  describe("2. Configuration & Parameter Parsing", () => {
    it("validates valid environment configuration with defaults", () => {
      const env = {
        MST_TESTNET_TOKEN_CONTRACT_ADDRESS: dummyToken,
        MST_TESTNET_STAKING_CONTRACT_ADDRESS: dummyStaking,
      };

      const config = validateEnvironmentConfig(env);
      expect(config.tokenAddress).toBe(dummyToken);
      expect(config.stakingAddress).toBe(dummyStaking);
      expect(config.tokenId).toBe(DEFAULT_DEMO_TOKEN_ID);
      expect(config.unstakeAmount).toBe(DEFAULT_DEMO_UNSTAKE_AMOUNT);
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

    it("parses valid custom token IDs and unstake amounts", () => {
      expect(parseTokenId("2")).toBe(2n);
      expect(parseUnstakeAmount("25")).toBe(25n);

      expect(() => parseTokenId("0")).toThrow("Token ID must be a positive integer.");
      expect(() => parseUnstakeAmount("-10")).toThrow("Unstake amount must be a positive integer.");
      expect(() => parseTokenId("not-a-number")).toThrow("Must be a valid positive integer.");
    });

    it("normalizes addresses and rejects invalid address inputs", () => {
      expect(normalizeAccountAddress(dummyToken.toLowerCase())).toBe(dummyToken);
      expect(() => normalizeAccountAddress("")).toThrow("Address must be a non-empty string.");
      expect(() => normalizeAccountAddress("0x0000000000000000000000000000000000000000")).toThrow(
        "Address cannot be empty or the zero address.",
      );
    });
  });

  describe("3. Stake Position & Lock Expiration Validation", () => {
    it("passes when active stake is sufficient and lock has expired", () => {
      const stakeInfo = {
        amount: 10n,
        lockEndTime: 1750000000n,
      };
      const check = validateStakePosition(stakeInfo, 10n, 1750000001n);
      expect(check.valid).toBe(true);
    });

    it("rejects when requested unstake amount exceeds staked balance", () => {
      const stakeInfo = {
        amount: 5n,
        lockEndTime: 1750000000n,
      };
      const check = validateStakePosition(stakeInfo, 10n, 1750000001n);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain("Insufficient staked balance");
    });

    it("rejects when lock period is still active", () => {
      const stakeInfo = {
        amount: 10n,
        lockEndTime: 1750000100n,
      };
      const check = validateStakePosition(stakeInfo, 10n, 1750000000n);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain("Lock period has not expired yet");
    });
  });

  describe("4. Confirmation Phrase Guard", () => {
    it("validates expected confirmation phrase 'UNSTAKE 10 TESTNET UNITS'", () => {
      expect(CONFIRMATION_PHRASE).toBe("UNSTAKE 10 TESTNET UNITS");
      expect(getExpectedConfirmationPhrase(10n)).toBe("UNSTAKE 10 TESTNET UNITS");
      expect(validateConfirmationPhrase("UNSTAKE 10 TESTNET UNITS")).toBe(true);
      expect(validateConfirmationPhrase("  UNSTAKE 10 TESTNET UNITS  ")).toBe(true);

      expect(validateConfirmationPhrase("UNSTAKE 10 UNITS")).toBe(false);
      expect(validateConfirmationPhrase("unstake 10 testnet units")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("5. Pre-Flight Verification & Error Handling", () => {
    function createMockContracts(
      overrides: {
        stakedAmount?: bigint;
        lockEndTime?: bigint;
        isInvestorEligible?: boolean;
        isStakingEligible?: boolean;
        isStakingAuthorized?: boolean;
      } = {},
    ) {
      const tokenContract: IPropertyTokenUnstakeView = {
        balanceOf: vi.fn().mockResolvedValue(10n),
        isEligibleInvestor: vi.fn().mockImplementation(async (addr: string) => {
          if (addr.toLowerCase() === dummySigner.toLowerCase()) {
            return overrides.isInvestorEligible ?? true;
          }
          if (addr.toLowerCase() === dummyStaking.toLowerCase()) {
            return overrides.isStakingEligible ?? true;
          }
          return false;
        }),
        isAuthorizedStakingContract: vi
          .fn()
          .mockResolvedValue(overrides.isStakingAuthorized ?? true),
      };

      const stakingContract: IStakingContractUnstake = {
        unstake: vi.fn().mockResolvedValue({
          hash: "0xunstake_tx_hash_1234567890abcdef1234567890abcdef1234567890abcdef",
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        getStakeInfo: vi.fn().mockResolvedValue({
          amount: overrides.stakedAmount ?? 10n,
          lockStartTime: 1750000000n,
          lockEndTime: overrides.lockEndTime ?? 1750000000n,
          pendingRewards: 0n,
          isLocked: false,
        }),
      };

      return { tokenContract, stakingContract };
    }

    it("rejects unstaking if signer has insufficient staked units", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        stakedAmount: 3n,
      });

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000001n,
        }),
      ).rejects.toThrow("Insufficient staked balance");
    });

    it("rejects unstaking if lock period has not expired", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        lockEndTime: 1760000000n,
      });

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000000n,
        }),
      ).rejects.toThrow("Lock period has not expired yet");
    });

    it("rejects unstaking if investor is not KYC eligible", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isInvestorEligible: false,
      });

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000001n,
        }),
      ).rejects.toThrow("is not whitelisted as an eligible investor on PropertyToken");
    });

    it("rejects unstaking if staking contract is not KYC eligible", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isStakingEligible: false,
      });

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000001n,
        }),
      ).rejects.toThrow("is not whitelisted as an eligible investor on PropertyToken");
    });

    it("rejects unstaking if staking contract lacks transfer exemption authorization", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isStakingAuthorized: false,
      });

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000001n,
        }),
      ).rejects.toThrow("is not authorized with staking transfer exemption on PropertyToken");
    });

    it("aborts if confirmation phrase does not match", async () => {
      const { tokenContract, stakingContract } = createMockContracts();
      const mockPrompt = vi.fn().mockResolvedValue("wrong phrase");

      await expect(
        executeUnstakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          unstakeAmount: 10n,
          currentTimestamp: 1750000001n,
          promptConfirmation: mockPrompt,
        }),
      ).rejects.toThrow("Unstaking cancelled; confirmation phrase did not match.");

      expect(stakingContract.unstake).not.toHaveBeenCalled();
    });
  });

  describe("6. Successful Unstaking Execution Flow", () => {
    it("calls staking contract unstake function with exact ABI order and verifies returned balance", async () => {
      let vaultStaked = 10n;
      let walletUnits = 0n;

      const tokenContract: IPropertyTokenUnstakeView = {
        balanceOf: vi.fn().mockImplementation(async () => walletUnits),
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
      };

      const mockUnstake = vi.fn().mockImplementation(async (tokenId: bigint, amount: bigint) => {
        expect(tokenId).toBe(1n);
        expect(amount).toBe(10n);
        vaultStaked = 0n;
        walletUnits = 10n;
        return {
          hash: "0xunstake_tx_hash_success",
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        };
      });

      const stakingContract: IStakingContractUnstake = {
        unstake: mockUnstake,
        getStakeInfo: vi.fn().mockImplementation(async () => ({
          amount: vaultStaked,
          lockStartTime: 1750000000n,
          lockEndTime: 1750000000n,
          pendingRewards: 0n,
          isLocked: false,
        })),
      };

      const mockPrompt = vi.fn().mockResolvedValue("UNSTAKE 10 TESTNET UNITS");

      const result = await executeUnstakeFlow({
        tokenContract,
        stakingContract,
        signerAddress: dummySigner,
        tokenAddress: dummyToken,
        stakingAddress: dummyStaking,
        tokenId: 1n,
        unstakeAmount: 10n,
        currentTimestamp: 1750000001n,
        promptConfirmation: mockPrompt,
        gasEstimateDisplay: "~210,000 gas units (~0.00021 MST)",
      });

      expect(mockUnstake).toHaveBeenCalledWith(1n, 10n);
      expect(result.txHash).toBe("0xunstake_tx_hash_success");
      expect(result.unstakedAmount).toBe(10n);
      expect(result.remainingStakedInVault).toBe(0n);
      expect(result.walletBalance).toBe(10n);
    });
  });

  describe("7. Execution Environment Safeguards", () => {
    it("prevents auto-execution during test runs", () => {
      expect(isDirectExecution(import.meta.url)).toBe(false);
    });

    it("normalizes script paths reliably", () => {
      const normalized = normalizeScriptPath("C:\\repo\\scripts\\unstake-testnet-property.ts");
      expect(normalized).toBe("c:/repo/scripts/unstake-testnet-property.ts");
      expect(matchesScriptPath("scripts/unstake-testnet-property.ts", normalized)).toBe(false);
    });
  });
});
