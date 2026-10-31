import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StakingPage } from "@/routes/staking";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting, clientLogin } from "@/lib/auth/clientAuth";
import {
  setActiveNetwork,
  resolveTestnetConfig,
  resolveMainnetConfig,
  isNetworkStakingConfigured,
  PROPERTY_TOKEN_ABI,
  PROPERTY_TOKEN_STAKING_ABI,
} from "@/contractConfig";
import {
  isStakingLiveConfigured,
  getStakingConfigurationMessage,
  stakeUnitsOnChain,
  unstakeUnitsOnChain,
  fundStakingRewardsOnChain,
  parseContractError,
} from "@/lib/blockchain";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to?: string;
      [key: string]: unknown;
    }) => (
      <a href={to ?? "#"} {...props}>
        {children}
      </a>
    ),
  };
});

describe("ERC-1155 Staking Layer - Configuration & Contract Isolation", () => {
  const originalTestnetStaking = import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"];
  const originalMainnetStaking = import.meta.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"];

  beforeEach(() => {
    setActiveNetwork("testnet");
  });

  afterEach(() => {
    cleanup();
    setActiveNetwork("testnet");
    import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"] = originalTestnetStaking;
    import.meta.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"] = originalMainnetStaking;
  });

  it("strictly isolates Testnet and Mainnet staking contract configurations", () => {
    const dummyTestnetStaking = "0x1111111111111111111111111111111111111111";
    const dummyMainnetStaking = "0x2222222222222222222222222222222222222222";

    import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"] = dummyTestnetStaking;
    import.meta.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"] = "";

    const testnetConf = resolveTestnetConfig();
    const mainnetConf = resolveMainnetConfig();

    expect(testnetConf.stakingContractAddress).toBe(dummyTestnetStaking);
    expect(isNetworkStakingConfigured(testnetConf)).toBe(true);

    // Mainnet must never inherit or fall back to Testnet's address
    expect(mainnetConf.stakingContractAddress).toBeUndefined();
    expect(isNetworkStakingConfigured(mainnetConf)).toBe(false);

    import.meta.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"] = dummyMainnetStaking;
    const updatedMainnetConf = resolveMainnetConfig();
    expect(updatedMainnetConf.stakingContractAddress).toBe(dummyMainnetStaking);
    expect(isNetworkStakingConfigured(updatedMainnetConf)).toBe(true);
  });

  it("verifies PROPERTY_TOKEN_STAKING_ABI contains all required functions and events", () => {
    const abiStrings = Array.from(PROPERTY_TOKEN_STAKING_ABI) as string[];

    expect(abiStrings.some((s) => s.startsWith("function stake"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function unstake"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function claimRewards"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function emergencyWithdraw"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function fundRewards"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function getStakeInfo"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function getPendingRewards"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function getPoolInfo"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function pause"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("function unpause"))).toBe(true);

    expect(abiStrings.some((s) => s.startsWith("event Staked"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("event Unstaked"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("event RewardsFunded"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("event RewardsClaimed"))).toBe(true);
    expect(abiStrings.some((s) => s.startsWith("event EmergencyWithdrawn"))).toBe(true);

    const tokenAbiStrings = Array.from(PROPERTY_TOKEN_ABI) as string[];
    expect(
      tokenAbiStrings.some((s) => s.startsWith("function setStakingContractAuthorization")),
    ).toBe(true);
    expect(tokenAbiStrings.some((s) => s.startsWith("function isAuthorizedStakingContract"))).toBe(
      true,
    );
    expect(
      tokenAbiStrings.some((s) => s.startsWith("event StakingContractAuthorizationUpdated")),
    ).toBe(true);
  });
});

describe("ERC-1155 Staking Layer - Blockchain Helper & Error Handling", () => {
  beforeEach(() => {
    setActiveNetwork("testnet");
  });

  it("handles unconfigured staking address gracefully", () => {
    const prevAddr = import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"];
    import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"] = "";

    expect(isStakingLiveConfigured()).toBe(false);
    expect(getStakingConfigurationMessage()).toContain("MST Testnet");

    import.meta.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"] = prevAddr;
  });

  it("validates zero units parameter before attempting staking, unstaking, or funding transactions", async () => {
    await expect(stakeUnitsOnChain(1n, 0n, 0n)).rejects.toThrow(
      "Staking units must be greater than zero.",
    );
    await expect(unstakeUnitsOnChain(1n, 0n)).rejects.toThrow(
      "Unstaking units must be greater than zero.",
    );
    await expect(fundStakingRewardsOnChain(1n, 0n)).rejects.toThrow(
      "Reward funding amount must be greater than zero.",
    );
  });

  it("decodes staking-specific custom errors accurately", () => {
    const errLock = {
      message: "execution reverted: custom error LockPeriodActive(1750000000, 1740000000)",
    };
    expect(parseContractError(errLock)).toContain(
      "The lock period for this stake has not expired yet",
    );

    const errLockMax = { message: "custom error InvalidLockDuration(500, 100, 300)" };
    expect(parseContractError(errLockMax)).toContain(
      "Selected lock duration is outside the allowed pool limits",
    );

    const errBalance = { message: "custom error InsufficientStakedBalance(10, 50)" };
    expect(parseContractError(errBalance)).toContain(
      "Requested amount exceeds your active staked balance",
    );

    const errAuth = { message: "custom error StakingContractNotAuthorized()" };
    expect(parseContractError(errAuth)).toContain(
      "The staking contract has not been whitelisted by a compliance officer",
    );

    const errTransfers = { message: "custom error TransfersDisabledForToken(1)" };
    expect(parseContractError(errTransfers)).toContain(
      "Secondary transfers are disabled for this property token",
    );

    const errZero = { message: "custom error ZeroAmount()" };
    expect(parseContractError(errZero)).toContain("Amount or units must be greater than zero");

    const errNoRewards = { message: "custom error NoPendingRewards()" };
    expect(parseContractError(errNoRewards)).toContain("You have no pending rewards to claim");

    const errRewardFail = { message: "custom error RewardTransferFailed()" };
    expect(parseContractError(errRewardFail)).toContain(
      "Contract was unable to send native MST rewards",
    );

    const errDirectDeposit = { message: "custom error DirectDepositNotAllowed()" };
    expect(parseContractError(errDirectDeposit)).toContain(
      "Direct transfer to staking contract rejected",
    );
  });
});

describe("ERC-1155 Staking Dashboard UI", () => {
  beforeEach(async () => {
    resetAuthStateForTesting();
    clientResetSessionForTesting();
    setActiveNetwork("testnet");
  });

  afterEach(() => {
    cleanup();
    clientResetSessionForTesting();
    setActiveNetwork("testnet");
  });

  it("renders staking dashboard with compliance and principal safety cards for investor", async () => {
    await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");

    render(
      <AuthProvider>
        <StakingPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Property Token Staking Vault")).toBeInTheDocument();
    });

    // Check header and description
    expect(
      screen.getByText(/Deposit fractional property units into non-custodial ERC-1155 custody/i),
    ).toBeInTheDocument();

    // Check lock period presets are rendered
    expect(screen.getByText("Flexible (0 Days)")).toBeInTheDocument();
    expect(screen.getByText("30 Days (1 Month)")).toBeInTheDocument();
    expect(screen.getByText("90 Days (3 Months)")).toBeInTheDocument();
    expect(screen.getByText("180 Days (6 Months)")).toBeInTheDocument();
    expect(screen.getByText("365 Days (1 Year)")).toBeInTheDocument();

    // Check stat cards & architecture notice
    expect(
      screen.getByText("Funded Distribution Architecture & Non-Custodial Safeguards"),
    ).toBeInTheDocument();
    expect(screen.getByText("Available Units")).toBeInTheDocument();
    expect(screen.getByText("Staked Units")).toBeInTheDocument();
    expect(screen.getByText("Lock Status")).toBeInTheDocument();
    expect(screen.getByText("Accrued Rewards")).toBeInTheDocument();
    expect(screen.getByText("Emergency Exit")).toBeInTheDocument();

    // Investor should NOT see the distributor reward funding tab
    expect(screen.queryByText("Fund Pool Rewards")).not.toBeInTheDocument();
  });

  it("renders reward distributor funding tab for admin or property issuer", async () => {
    await clientLogin("admin@tokenestate.mst", "MSTAdmin2026!");

    render(
      <AuthProvider>
        <StakingPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Property Token Staking Vault")).toBeInTheDocument();
    });

    // Admin should see reward distributor tab
    expect(screen.getByText("Fund Pool Rewards")).toBeInTheDocument();
  });
});
