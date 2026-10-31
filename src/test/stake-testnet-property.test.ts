import { describe, expect, it, vi } from "vitest";
import {
  TESTNET_CHAIN_ID,
  DEFAULT_DEMO_TOKEN_ID,
  DEFAULT_DEMO_STAKE_AMOUNT,
  DEFAULT_DEMO_LOCK_DURATION,
  CONFIRMATION_PHRASE,
  validateTestnetChainId,
  normalizeAccountAddress,
  validateLockDuration,
  getExpectedConfirmationPhrase,
  validateConfirmationPhrase,
  parseTokenId,
  parseStakeAmount,
  validatePoolConfiguration,
  validateEnvironmentConfig,
  executeStakeFlow,
  normalizeScriptPath,
  matchesScriptPath,
  isDirectExecution,
  type IPropertyTokenStakeView,
  type IStakingContractStake,
} from "../../scripts/stake-testnet-property";

describe("MST Testnet Staking Execution Script (scripts/stake-testnet-property.ts)", () => {
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
      expect(config.stakeAmount).toBe(DEFAULT_DEMO_STAKE_AMOUNT);
      expect(config.lockDuration).toBe(DEFAULT_DEMO_LOCK_DURATION);
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

    it("parses valid custom token IDs and stake amounts", () => {
      expect(parseTokenId("2")).toBe(2n);
      expect(parseStakeAmount("50")).toBe(50n);

      expect(() => parseTokenId("0")).toThrow("Token ID must be a positive integer.");
      expect(() => parseStakeAmount("-5")).toThrow("Stake amount must be a positive integer.");
      expect(() => parseTokenId("invalid")).toThrow("Must be a valid positive integer.");
    });

    it("normalizes addresses and rejects invalid address inputs", () => {
      expect(normalizeAccountAddress(dummyToken.toLowerCase())).toBe(dummyToken);
      expect(() => normalizeAccountAddress("")).toThrow("Address must be a non-empty string.");
      expect(() => normalizeAccountAddress("0x0000000000000000000000000000000000000000")).toThrow(
        "Address cannot be empty or the zero address.",
      );
    });
  });

  describe("3. Zero-Day Lock Duration & Pool Validation", () => {
    it("strictly verifies lock duration is 0", () => {
      expect(validateLockDuration(0n)).toBe(true);
      expect(validateLockDuration(86400n)).toBe(false);
      expect(validateLockDuration(1n)).toBe(false);

      const envWithNonZeroLock = {
        MST_TESTNET_TOKEN_CONTRACT_ADDRESS: dummyToken,
        MST_TESTNET_STAKING_CONTRACT_ADDRESS: dummyStaking,
        MST_TESTNET_LOCK_DURATION: "86400",
      };
      expect(() => validateEnvironmentConfig(envWithNonZeroLock)).toThrow(
        "Lock duration must be 0 for demo staking",
      );
    });

    it("validates pool configuration allowing 0-day lock", () => {
      // 0-day lock enabled
      const poolOk = validatePoolConfiguration({
        minLockDuration: 0n,
        maxLockDuration: 365n * 86400n,
        isEnabled: true,
      });
      expect(poolOk.valid).toBe(true);

      // Pool requires minimum 30 days lock (cannot do 0-day lock)
      const poolRestrictive = validatePoolConfiguration({
        minLockDuration: 30n * 86400n,
        maxLockDuration: 365n * 86400n,
        isEnabled: true,
      });
      expect(poolRestrictive.valid).toBe(false);
      expect(poolRestrictive.reason).toContain("outside pool bounds");

      // Pool is disabled
      const poolDisabled = validatePoolConfiguration({
        minLockDuration: 0n,
        maxLockDuration: 30n * 86400n,
        isEnabled: false,
      });
      expect(poolDisabled.valid).toBe(false);
      expect(poolDisabled.reason).toContain("explicitly disabled");
    });
  });

  describe("4. Confirmation Phrase Guard", () => {
    it("validates expected confirmation phrase 'STAKE 10 TESTNET UNITS'", () => {
      expect(CONFIRMATION_PHRASE).toBe("STAKE 10 TESTNET UNITS");
      expect(getExpectedConfirmationPhrase(10n)).toBe("STAKE 10 TESTNET UNITS");
      expect(validateConfirmationPhrase("STAKE 10 TESTNET UNITS")).toBe(true);
      expect(validateConfirmationPhrase("  STAKE 10 TESTNET UNITS  ")).toBe(true);

      expect(validateConfirmationPhrase("STAKE 10 UNITS")).toBe(false);
      expect(validateConfirmationPhrase("stake 10 testnet units")).toBe(false);
      expect(validateConfirmationPhrase("yes")).toBe(false);
      expect(validateConfirmationPhrase("")).toBe(false);
    });
  });

  describe("5. Pre-Flight Verification & Error Handling", () => {
    function createMockContracts(
      overrides: {
        balance?: bigint;
        isInvestorEligible?: boolean;
        isStakingEligible?: boolean;
        isStakingAuthorized?: boolean;
        isApprovedForAll?: boolean;
        poolConfig?: readonly [bigint, bigint, boolean];
      } = {},
    ) {
      const tokenContract: IPropertyTokenStakeView = {
        balanceOf: vi.fn().mockResolvedValue(overrides.balance ?? 10n),
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
        isApprovedForAll: vi.fn().mockResolvedValue(overrides.isApprovedForAll ?? true),
      };

      const stakingContract: IStakingContractStake = {
        poolConfigs: vi.fn().mockResolvedValue(overrides.poolConfig ?? [0n, 365n * 86400n, true]),
        stake: vi.fn().mockResolvedValue({
          hash: "0xstake_tx_hash_1234567890abcdef1234567890abcdef1234567890abcdef",
          wait: vi.fn().mockResolvedValue({ status: 1 }),
        }),
        getStakeInfo: vi.fn().mockResolvedValue({
          amount: 10n,
          lockStartTime: 1750000000n,
          lockEndTime: 1750000000n,
          pendingRewards: 0n,
          isLocked: false,
        }),
      };

      return { tokenContract, stakingContract };
    }

    it("rejects staking if signer owns fewer units than stakeAmount", async () => {
      const { tokenContract, stakingContract } = createMockContracts({ balance: 5n });

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
        }),
      ).rejects.toThrow("Insufficient token balance");
    });

    it("rejects staking if investor is not KYC eligible", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isInvestorEligible: false,
      });

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
        }),
      ).rejects.toThrow("is not whitelisted as an eligible investor on PropertyToken");
    });

    it("rejects staking if staking contract is not KYC eligible", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isStakingEligible: false,
      });

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
        }),
      ).rejects.toThrow("is not whitelisted as an eligible investor on PropertyToken");
    });

    it("rejects staking if staking contract lacks transfer authorization exemption", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isStakingAuthorized: false,
      });

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
        }),
      ).rejects.toThrow("is not authorized with staking transfer exemption on PropertyToken");
    });

    it("rejects staking if staking operator is not approved", async () => {
      const { tokenContract, stakingContract } = createMockContracts({
        isApprovedForAll: false,
      });

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
        }),
      ).rejects.toThrow("is not approved as operator");
    });

    it("aborts if confirmation phrase does not match", async () => {
      const { tokenContract, stakingContract } = createMockContracts();
      const mockPrompt = vi.fn().mockResolvedValue("wrong phrase");

      await expect(
        executeStakeFlow({
          tokenContract,
          stakingContract,
          signerAddress: dummySigner,
          tokenAddress: dummyToken,
          stakingAddress: dummyStaking,
          tokenId: 1n,
          stakeAmount: 10n,
          lockDuration: 0n,
          promptConfirmation: mockPrompt,
        }),
      ).rejects.toThrow("Staking cancelled; confirmation phrase did not match.");

      expect(stakingContract.stake).not.toHaveBeenCalled();
    });
  });

  describe("6. Successful Staking Execution Flow", () => {
    it("calls staking contract stake function with exact ABI order and verifies stake position", async () => {
      let remainingUnits = 10n;

      const tokenContract: IPropertyTokenStakeView = {
        balanceOf: vi.fn().mockImplementation(async () => remainingUnits),
        isEligibleInvestor: vi.fn().mockResolvedValue(true),
        isAuthorizedStakingContract: vi.fn().mockResolvedValue(true),
        isApprovedForAll: vi.fn().mockResolvedValue(true),
      };

      const mockStake = vi
        .fn()
        .mockImplementation(async (tokenId: bigint, amount: bigint, lockDuration: bigint) => {
          expect(tokenId).toBe(1n);
          expect(amount).toBe(10n);
          expect(lockDuration).toBe(0n);
          remainingUnits = 0n;
          return {
            hash: "0xstake_tx_hash_success",
            wait: vi.fn().mockResolvedValue({ status: 1 }),
          };
        });

      const stakingContract: IStakingContractStake = {
        poolConfigs: vi.fn().mockResolvedValue([0n, 365n * 86400n, true]),
        stake: mockStake,
        getStakeInfo: vi.fn().mockResolvedValue({
          amount: 10n,
          lockStartTime: 1750000000n,
          lockEndTime: 1750000000n,
          pendingRewards: 0n,
          isLocked: false,
        }),
      };

      const mockPrompt = vi.fn().mockResolvedValue("STAKE 10 TESTNET UNITS");

      const result = await executeStakeFlow({
        tokenContract,
        stakingContract,
        signerAddress: dummySigner,
        tokenAddress: dummyToken,
        stakingAddress: dummyStaking,
        tokenId: 1n,
        stakeAmount: 10n,
        lockDuration: 0n,
        promptConfirmation: mockPrompt,
        gasEstimateDisplay: "~210,000 gas units (~0.00021 MST)",
      });

      expect(mockStake).toHaveBeenCalledWith(1n, 10n, 0n);
      expect(result.txHash).toBe("0xstake_tx_hash_success");
      expect(result.stakedAmount).toBe(10n);
      expect(result.vaultTotalStaked).toBe(10n);
      expect(result.remainingBalance).toBe(0n);
      expect(result.isLocked).toBe(false);
    });
  });

  describe("7. Execution Environment Safeguards", () => {
    it("prevents auto-execution during test runs", () => {
      expect(isDirectExecution(import.meta.url)).toBe(false);
    });

    it("normalizes path correctly", () => {
      const normalized = normalizeScriptPath("C:\\repo\\scripts\\stake-testnet-property.ts");
      expect(normalized).toBe("c:/repo/scripts/stake-testnet-property.ts");
      expect(matchesScriptPath("scripts/stake-testnet-property.ts", normalized)).toBe(false);
    });
  });
});
