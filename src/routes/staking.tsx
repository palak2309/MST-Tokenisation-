import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Unlock,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatEther, parseEther } from "ethers";
import { PageHeader, Pill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { useNetwork } from "@/contractConfig";
import { useWallet } from "@/hooks/useWallet";
import { useAllProperties } from "@/lib/propertyStore";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { inr, type Property } from "@/lib/data";
import {
  chainConfig,
  checkInvestorEligibilityOnChain,
  claimStakingRewardsOnChain,
  emergencyWithdrawStakedUnitsOnChain,
  explorerTxUrl,
  fundStakingRewardsOnChain,
  getInvestorTokenBalanceOnChain,
  getPropertyTokenOnChain,
  getStakeInfoOnChain,
  getStakingPoolInfoOnChain,
  isStakingApprovedOnChain,
  isStakingLiveConfigured,
  isTokenLiveConfigured,
  parseContractError,
  setStakingApprovalOnChain,
  stakeUnitsOnChain,
  TESTNET_ADMIN_ACCOUNT,
  unstakeUnitsOnChain,
  type OnChainPropertyTokenInfo,
  type OnChainStakeInfo,
  type OnChainStakingPoolInfo,
} from "@/lib/blockchain";

export const Route = createFileRoute("/staking")({
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: StakingPageWithGuard,
});

export function StakingPageWithGuard() {
  return (
    <ProtectedRoute>
      <StakingPageContent />
    </ProtectedRoute>
  );
}

export const StakingPage = StakingPageWithGuard;

const LOCK_PRESETS = [
  { label: "Flexible (0 Days)", seconds: 0n, desc: "Withdraw anytime with no lock" },
  { label: "30 Days (1 Month)", seconds: 30n * 86400n, desc: "Commit for 30 days" },
  { label: "90 Days (3 Months)", seconds: 90n * 86400n, desc: "Commit for 90 days" },
  { label: "180 Days (6 Months)", seconds: 180n * 86400n, desc: "Commit for 180 days" },
  { label: "365 Days (1 Year)", seconds: 365n * 86400n, desc: "Commit for 1 year" },
];

function StakingPageContent() {
  const { user, role } = useAuth();
  const { config, isTestnet, isMainnet, network } = useNetwork();
  const { account, isConnected, connect } = useWallet();
  const allProperties = useAllProperties();

  const defaultPidForNetwork = isMainnet ? "MST-DEMO-PUNE-002" : "PRP-TEST-SIM-001";
  const [selectedPid, setSelectedPid] = useState(
    () =>
      allProperties.find((p) => p.id === defaultPidForNetwork)?.id ?? allProperties[0]?.id ?? "",
  );
  const [activeTab, setActiveTab] = useState<"stake" | "unstake" | "emergency" | "fund">("stake");

  // Keep selected property aligned when switching active networks
  useEffect(() => {
    const targetPid = isMainnet ? "MST-DEMO-PUNE-002" : "PRP-TEST-SIM-001";
    const found = allProperties.find((p) => p.id === targetPid);
    if (found) {
      setSelectedPid(found.id);
    }
  }, [network, isMainnet, allProperties]);

  // On-chain status
  const [loading, setLoading] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<bigint>(0n);
  const [tokenInfo, setTokenInfo] = useState<OnChainPropertyTokenInfo | null>(null);
  const [stakeInfo, setStakeInfo] = useState<OnChainStakeInfo>({
    amount: 0n,
    lockStartTime: 0n,
    lockEndTime: 0n,
    pendingRewards: 0n,
    isLocked: false,
  });
  const [poolInfo, setPoolInfo] = useState<OnChainStakingPoolInfo>({
    totalStaked: 0n,
    totalRewardsFunded: 0n,
    totalRewardsClaimed: 0n,
    minLockDuration: 0n,
    maxLockDuration: 0n,
    isEnabled: true,
    currentRewardBalance: 0n,
  });
  const [isApproved, setIsApproved] = useState(false);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);

  // Form inputs
  const [stakeAmount, setStakeAmount] = useState<string>("10");
  const [selectedLockSeconds, setSelectedLockSeconds] = useState<bigint>(0n);
  const [unstakeAmount, setUnstakeAmount] = useState<string>("10");
  const [fundAmountMst, setFundAmountMst] = useState<string>("1.0");

  // Transaction states
  const [approving, setApproving] = useState(false);
  const [stakingTx, setStakingTx] = useState(false);
  const [unstakingTx, setUnstakingTx] = useState(false);
  const [claimingTx, setClaimingTx] = useState(false);
  const [emergencyTx, setEmergencyTx] = useState(false);
  const [fundingTx, setFundingTx] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const selectedProp: Property | undefined =
    allProperties.find((p) => p.id === selectedPid) ?? allProperties[0];
  const isStakingConfigured = isStakingLiveConfigured();
  const isTokenConfigured = isTokenLiveConfigured();

  // Strict network mismatch detection:
  // Mainnet property selected while on Testnet, or Testnet property selected while on Mainnet
  const isNetworkMismatch = Boolean(
    (isTestnet &&
      (selectedProp?.network === "mainnet" || selectedProp?.id === "MST-DEMO-PUNE-002")) ||
    (isMainnet && (selectedProp?.network === "testnet" || selectedProp?.id === "PRP-TEST-SIM-001")),
  );

  // Determine currentTokenId accurately:
  // 1. If property is MST-DEMO-PUNE-002 -> uses Mainnet configured Token ID (e.g. from VITE_MST_MAINNET_TOKEN_ID or 1n)
  // 2. If property is PRP-TEST-SIM-001 -> uses Testnet configured Token ID (e.g. from VITE_MST_TESTNET_TOKEN_ID or 1n)
  // 3. If tokenInfo returned an on-chain tokenId > 0 -> use it
  // 4. Otherwise use selectedProp.tokenId or fallback 1n
  const configuredMainnetTokenId = isMainnet && config.tokenId ? BigInt(config.tokenId) : 1n;
  const configuredTestnetTokenId = isTestnet && config.tokenId ? BigInt(config.tokenId) : 1n;

  const currentTokenId =
    selectedProp?.id === "MST-DEMO-PUNE-002"
      ? configuredMainnetTokenId
      : selectedProp?.id === "PRP-TEST-SIM-001"
        ? configuredTestnetTokenId
        : tokenInfo && tokenInfo.tokenId > 0n
          ? tokenInfo.tokenId
          : selectedProp?.tokenId
            ? BigInt(selectedProp.tokenId)
            : 1n;

  // Refresh on-chain data
  const refreshStakingData = useCallback(async () => {
    if (!selectedProp) return;
    setLoading(true);

    try {
      if (isNetworkMismatch) {
        setTokenInfo(null);
        setAvailableUnits(0n);
        setStakeInfo({
          amount: 0n,
          lockStartTime: 0n,
          lockEndTime: 0n,
          pendingRewards: 0n,
          isLocked: false,
        });
        setPoolInfo({
          totalStaked: 0n,
          totalRewardsFunded: 0n,
          totalRewardsClaimed: 0n,
          minLockDuration: 0n,
          maxLockDuration: 0n,
          isEnabled: false,
          currentRewardBalance: 0n,
        });
        return;
      }

      // 1. Load property token info
      if (isTokenConfigured) {
        const propToken = await getPropertyTokenOnChain(selectedProp.id);
        setTokenInfo(propToken);

        const targetTokenId = propToken.tokenId > 0n ? propToken.tokenId : currentTokenId;
        const targetAccount = account || (isTestnet ? TESTNET_ADMIN_ACCOUNT : undefined);

        if (targetAccount && targetTokenId > 0n) {
          const [balance, eligible, approved, stake, pool] = await Promise.all([
            getInvestorTokenBalanceOnChain(targetAccount, targetTokenId),
            checkInvestorEligibilityOnChain(targetAccount),
            isStakingApprovedOnChain(targetAccount),
            getStakeInfoOnChain(targetTokenId, targetAccount),
            getStakingPoolInfoOnChain(targetTokenId),
          ]);
          setAvailableUnits(balance);
          setIsEligible(eligible);
          setIsApproved(approved);
          setStakeInfo(stake);
          setPoolInfo(pool);
          if (stake.amount > 0n) {
            setUnstakeAmount(stake.amount.toString());
          }
        } else if (targetTokenId > 0n) {
          const pool = await getStakingPoolInfoOnChain(targetTokenId);
          setPoolInfo(pool);
        }
      } else {
        // Fallback demo values
        setAvailableUnits(100n);
        setIsEligible(true);
        setIsApproved(true);
      }
    } catch (err) {
      console.error("Error refreshing staking data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedProp, isTokenConfigured, isNetworkMismatch, account, isTestnet, currentTokenId]);

  useEffect(() => {
    refreshStakingData();
  }, [refreshStakingData, config.chainId]);

  // Handle Approve
  const handleApprove = async () => {
    if (isNetworkMismatch) {
      toast.error("Operation disabled", {
        description: "The selected property does not match your active target network.",
      });
      return;
    }
    setApproving(true);
    try {
      const res = await setStakingApprovalOnChain(true, (tx) => setLastTxHash(tx));
      setIsApproved(true);
      toast.success("Staking contract approved successfully!", {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Approval failed", { description: parseContractError(err) });
    } finally {
      setApproving(false);
    }
  };

  // Handle Stake
  const handleStake = async () => {
    if (isNetworkMismatch) {
      toast.error("Operation disabled", {
        description: "The selected property does not match your active target network.",
      });
      return;
    }
    const amountBig = BigInt(Math.max(1, parseInt(stakeAmount || "0", 10)));
    setStakingTx(true);
    try {
      const res = await stakeUnitsOnChain(currentTokenId, amountBig, selectedLockSeconds, (tx) =>
        setLastTxHash(tx),
      );
      toast.success(`Successfully staked ${amountBig.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Staking failed", { description: parseContractError(err) });
    } finally {
      setStakingTx(false);
    }
  };

  // Handle Unstake
  const handleUnstake = async () => {
    if (isNetworkMismatch) {
      toast.error("Operation disabled", {
        description: "The selected property does not match your active target network.",
      });
      return;
    }
    const amountBig = BigInt(Math.max(1, parseInt(unstakeAmount || "0", 10)));
    setUnstakingTx(true);
    try {
      const res = await unstakeUnitsOnChain(currentTokenId, amountBig, (tx) => setLastTxHash(tx));
      toast.success(`Successfully unstaked ${amountBig.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Unstaking failed", { description: parseContractError(err) });
    } finally {
      setUnstakingTx(false);
    }
  };

  // Handle Claim Rewards
  const handleClaimRewards = async () => {
    if (isNetworkMismatch) {
      toast.error("Operation disabled", {
        description: "The selected property does not match your active target network.",
      });
      return;
    }
    setClaimingTx(true);
    try {
      const res = await claimStakingRewardsOnChain(currentTokenId, (tx) => setLastTxHash(tx));
      toast.success("Rewards claimed successfully!", {
        description: `Tx: ${res.txHash.slice(0, 10)}... | Native MST sent to your wallet.`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Claim rewards failed", { description: parseContractError(err) });
    } finally {
      setClaimingTx(false);
    }
  };

  // Handle Emergency Withdraw
  const handleEmergencyWithdraw = async () => {
    if (isNetworkMismatch) {
      toast.error("Operation disabled", {
        description: "The selected property does not match your active target network.",
      });
      return;
    }
    setEmergencyTx(true);
    try {
      const res = await emergencyWithdrawStakedUnitsOnChain(currentTokenId, (tx) =>
        setLastTxHash(tx),
      );
      toast.success("Emergency withdrawal completed! 100% principal returned.", {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Emergency withdrawal failed", { description: parseContractError(err) });
    } finally {
      setEmergencyTx(false);
    }
  };

  // Handle Fund Rewards
  const handleFundRewards = async () => {
    setFundingTx(true);
    try {
      const wei = parseEther(fundAmountMst || "0");
      const res = await fundStakingRewardsOnChain(currentTokenId, wei, (tx) => setLastTxHash(tx));
      toast.success(`Successfully funded ${fundAmountMst} MST into reward pool!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshStakingData();
    } catch (err) {
      toast.error("Funding rewards failed", { description: parseContractError(err) });
    } finally {
      setFundingTx(false);
    }
  };

  const lockEndFormatted =
    stakeInfo.lockEndTime > 0n
      ? new Date(Number(stakeInfo.lockEndTime) * 1000).toLocaleString()
      : "No active lock";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Property Token Staking Vault"
          subtitle="Deposit fractional property units into non-custodial ERC-1155 custody to earn funded native MST distributions."
        />
        <Button
          size="sm"
          variant="outline"
          onClick={refreshStakingData}
          disabled={loading}
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Staking Data</span>
        </Button>
      </div>

      {/* Property Selector & Network Header */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Selected Tokenised Property
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedPid}
                onChange={(e) => setSelectedPid(e.target.value)}
                className="rounded-lg border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {allProperties.map((p) => {
                  let badge = "";
                  if (p.id === "PRP-TEST-SIM-001" || p.network === "testnet") {
                    badge = " [MST Testnet · Token #1 · Simulated]";
                  } else if (p.id === "MST-DEMO-PUNE-002" || p.network === "mainnet") {
                    badge = " [MST Mainnet · Token #2 · Simulated]";
                  } else {
                    badge = " [Demo Simulation]";
                  }
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id}){badge}
                    </option>
                  );
                })}
              </select>
              <Pill tone={isNetworkMismatch ? "destructive" : "neutral"}>
                Token ID #{currentTokenId.toString()}
                {isNetworkMismatch
                  ? ` (${selectedProp?.network === "mainnet" ? "MST Mainnet" : "MST Testnet"})`
                  : ""}
              </Pill>
              {selectedProp?.source === "demo" && <Pill tone="neutral">Simulated</Pill>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Active Target Network:</span>
            <span className="font-semibold text-foreground">
              {config.networkName ?? "MST"} ({config.chainId ?? "—"})
            </span>
            {isStakingConfigured ? (
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Live Staking Configured
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {isMainnet ? "Staking Not Deployed on Mainnet" : "Demo Simulation"}
              </span>
            )}
          </div>
        </div>

        {/* Network Mismatch Warning Banner */}
        {isNetworkMismatch && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-destructive text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>Network & Property Configuration Mismatch</span>
            </div>
            <p className="text-foreground leading-relaxed">
              {isTestnet ? (
                <>
                  Property{" "}
                  <strong>
                    {selectedProp?.name} ({selectedProp?.id})
                  </strong>{" "}
                  is registered on <strong>MST Mainnet</strong> (Chain ID 4646, Token ID #2), but
                  your active target network is <strong>MST Testnet</strong> (Chain ID 91562037).
                  Staking, unstaking, and approval actions for this property are strictly disabled
                  on Testnet to prevent network state collision.
                </>
              ) : (
                <>
                  Property{" "}
                  <strong>
                    {selectedProp?.name} ({selectedProp?.id})
                  </strong>{" "}
                  is registered on <strong>MST Testnet</strong> (Chain ID 91562037, Token ID #1),
                  but your active target network is <strong>MST Mainnet</strong> (Chain ID 4646).
                  Staking actions for this property are disabled on Mainnet.
                </>
              )}
            </p>
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedPid(isTestnet ? "PRP-TEST-SIM-001" : "MST-DEMO-PUNE-002");
                }}
                className="text-xs h-7"
              >
                Switch to{" "}
                {isTestnet
                  ? `PRP-TEST-SIM-001 (Testnet Token #${configuredTestnetTokenId.toString()})`
                  : `MST-DEMO-PUNE-002 (Mainnet Token #${configuredMainnetTokenId.toString()})`}
              </Button>
            </div>
          </div>
        )}

        {/* Mainnet Staking Unavailability Banner */}
        {isMainnet && !isStakingConfigured && !isNetworkMismatch && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Mainnet Staking Contract Not Deployed</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              PropertyTokenStaking is active on MST Testnet (Chain ID 91562037). Live staking on MST
              Mainnet (Chain ID 4646) is disabled until the Mainnet staking contract is deployed and
              authorized.
            </p>
          </div>
        )}

        {/* Regulatory & Security Disclaimer */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              Funded Distribution Architecture & Non-Custodial Safeguards
            </p>
            <p className="text-[11px] leading-relaxed">
              PropertyTokenStaking implements standard OpenZeppelin{" "}
              <code className="text-foreground">ERC1155Holder</code> custody with strict reentrancy
              guards. Rewards derive solely from verified native MST funds deposited by authorized
              distributors. TokenEstate does <strong>not</strong> promise algorithmic inflation,
              guaranteed yields, or automatic rental income claims. All transfers comply strictly
              with on-chain investor whitelisting.
            </p>
          </div>
        </div>
      </div>

      {/* Investor Staking Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Available Units */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Available Units</span>
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground">
            {availableUnits.toString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">Units</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Held in your connected BridgeKey wallet
          </p>
        </div>

        {/* Card 2: Staked Units */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Staked Units</span>
            <Lock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-primary">
            {stakeInfo.amount.toString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">Units</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Deposited into PropertyTokenStaking custody
          </p>
        </div>

        {/* Card 3: Lock Status */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Lock Status</span>
            {stakeInfo.isLocked ? (
              <Clock className="h-4 w-4 text-amber-500" />
            ) : (
              <Unlock className="h-4 w-4 text-emerald-500" />
            )}
          </div>
          <p className="text-lg font-bold text-foreground truncate">
            {stakeInfo.isLocked ? "Locked" : "Unlocked / Flexible"}
          </p>
          <p className="text-[11px] text-muted-foreground truncate" title={lockEndFormatted}>
            {stakeInfo.isLocked ? `Until ${lockEndFormatted}` : "Ready to unstake at any time"}
          </p>
        </div>

        {/* Card 4: Accrued Native MST Rewards */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Accrued Rewards</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatEther(stakeInfo.pendingRewards)}{" "}
              <span className="text-xs font-normal text-muted-foreground">MST</span>
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleClaimRewards}
            disabled={claimingTx || stakeInfo.pendingRewards === 0n}
            className="w-full text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 mt-1"
          >
            {claimingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>Claim Rewards</span>
          </Button>
        </div>
      </div>

      {/* Wallet Connection Banner if Disconnected */}
      {!isConnected && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <span>
              {stakeInfo.amount > 0n
                ? `Displaying verified on-chain position for demo investor (${TESTNET_ADMIN_ACCOUNT.slice(0, 6)}...${TESTNET_ADMIN_ACCOUNT.slice(-4)}). Connect your BridgeKey wallet to execute transactions.`
                : "Connect your BridgeKey wallet to view real-time staked positions and sign transactions."}
            </span>
          </div>
          <Button size="sm" onClick={connect} className="gap-2 shrink-0">
            <Wallet className="h-4 w-4" />
            <span>Connect BridgeKey</span>
          </Button>
        </div>
      )}

      {/* Staking Action Workspace */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b text-xs font-medium bg-muted/20">
          <button
            type="button"
            onClick={() => setActiveTab("stake")}
            className={`px-5 py-3 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "stake"
                ? "border-primary text-primary bg-card"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Lock className="h-4 w-4" />
            <span>Stake Units</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("unstake")}
            className={`px-5 py-3 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "unstake"
                ? "border-primary text-primary bg-card"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Unlock className="h-4 w-4" />
            <span>Unstake Units</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("emergency")}
            className={`px-5 py-3 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "emergency"
                ? "border-primary text-primary bg-card"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <span>Emergency Exit</span>
          </button>
          {(role === "ADMIN" || role === "PROPERTY_ISSUER") && (
            <button
              type="button"
              onClick={() => setActiveTab("fund")}
              className={`px-5 py-3 border-b-2 font-semibold transition-colors flex items-center gap-2 ${
                activeTab === "fund"
                  ? "border-primary text-primary bg-card"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Coins className="h-4 w-4 text-emerald-500" />
              <span>Fund Pool Rewards</span>
            </button>
          )}
        </div>

        <div className="p-6">
          {/* TAB 1: STAKE UNITS */}
          {activeTab === "stake" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">Stake Property Units</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Transfer units into non-custodial contract custody. Tokens remain
                  cryptographically locked for your chosen duration.
                </p>
              </div>

              {/* Approval status banner */}
              {!isApproved && isStakingConfigured && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>BridgeKey operator approval is required before staking.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={approving}
                    className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
                  >
                    {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    <span>Approve Staking Contract</span>
                  </Button>
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="font-medium text-foreground">Units to Stake</label>
                  <button
                    type="button"
                    onClick={() => setStakeAmount(availableUnits.toString())}
                    className="text-primary hover:underline font-mono"
                  >
                    Max: {availableUnits.toString()} Units
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={availableUnits.toString()}
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter units (e.g. 10)"
                  />
                </div>
              </div>

              {/* Lock Duration Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Select Lock Duration</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {LOCK_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSelectedLockSeconds(preset.seconds)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        selectedLockSeconds === preset.seconds
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-background hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span>{preset.label}</span>
                        {selectedLockSeconds === preset.seconds && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                {!isApproved && isStakingConfigured ? (
                  <Button
                    onClick={handleApprove}
                    disabled={isNetworkMismatch || approving}
                    className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {approving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    <span>
                      {isNetworkMismatch
                        ? "Disabled: Network Mismatch"
                        : "1. Approve Staking Contract in BridgeKey"}
                    </span>
                  </Button>
                ) : (
                  <Button
                    onClick={handleStake}
                    disabled={
                      isNetworkMismatch ||
                      stakingTx ||
                      availableUnits === 0n ||
                      !parseInt(stakeAmount, 10)
                    }
                    className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {stakingTx ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    <span>
                      {isNetworkMismatch
                        ? "Disabled: Network Mismatch"
                        : `Stake ${stakeAmount || "0"} Units via BridgeKey`}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: UNSTAKE UNITS */}
          {activeTab === "unstake" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">Unstake Property Units</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Return property units from staking custody back to your wallet once lock duration
                  has elapsed.
                </p>
              </div>

              {/* Lock notice if locked */}
              {stakeInfo.isLocked && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>
                    Your active stake is locked until <strong>{lockEndFormatted}</strong>. Early
                    standard unstaking is disabled.
                  </span>
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="font-medium text-foreground">Units to Unstake</label>
                  <button
                    type="button"
                    onClick={() => setUnstakeAmount(stakeInfo.amount.toString())}
                    className="text-primary hover:underline font-mono"
                  >
                    Max: {stakeInfo.amount.toString()} Units
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={stakeInfo.amount.toString()}
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter units (e.g. 10)"
                />
              </div>

              <Button
                onClick={handleUnstake}
                disabled={
                  isNetworkMismatch || unstakingTx || stakeInfo.amount === 0n || stakeInfo.isLocked
                }
                className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {unstakingTx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
                <span>
                  {isNetworkMismatch
                    ? "Disabled: Network Mismatch"
                    : stakeInfo.isLocked
                      ? `Locked Until ${lockEndFormatted}`
                      : `Unstake ${unstakeAmount || "0"} Units via BridgeKey`}
                </span>
              </Button>
            </div>
          )}

          {/* TAB 3: EMERGENCY EXIT */}
          {activeTab === "emergency" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>Emergency Safe Withdrawal Protection</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allows immediate, unconditional withdrawal of 100% of your staked principal units,
                  bypassing active locks or contract pauses.
                </p>
              </div>

              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-2">
                <p className="font-semibold">Important Security Notice:</p>
                <p className="leading-relaxed">
                  Executing an emergency withdrawal forfeits all unclaimed accrued rewards for this
                  token pool. Use this function strictly if contract operations are permanently
                  halted or in case of an emergency.
                </p>
                <p className="font-mono text-[11px]">
                  Principal to recover: {stakeInfo.amount.toString()} units
                </p>
              </div>

              <Button
                variant="destructive"
                onClick={handleEmergencyWithdraw}
                disabled={isNetworkMismatch || emergencyTx || stakeInfo.amount === 0n}
                className="w-full gap-2"
              >
                {emergencyTx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
                <span>
                  {isNetworkMismatch
                    ? "Disabled: Network Mismatch"
                    : `Emergency Withdraw All ${stakeInfo.amount.toString()} Units`}
                </span>
              </Button>
            </div>
          )}

          {/* TAB 4: REWARD FUNDING (ADMIN / DISTRIBUTOR) */}
          {activeTab === "fund" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">Fund Staking Reward Pool</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deposit native MST into the verified contract reward pool. Rewards are distributed
                  strictly from these funded reserves.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                  <span className="text-muted-foreground font-semibold">Total Staked in Pool</span>
                  <p className="text-base font-bold font-mono text-foreground">
                    {poolInfo.totalStaked.toString()} Units
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                  <span className="text-muted-foreground font-semibold">Total Rewards Funded</span>
                  <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatEther(poolInfo.totalRewardsFunded)} MST
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Amount to Deposit (Native MST)
                </label>
                <input
                  type="text"
                  value={fundAmountMst}
                  onChange={(e) => setFundAmountMst(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. 5.0"
                />
              </div>

              <Button
                onClick={handleFundRewards}
                disabled={isNetworkMismatch || fundingTx || !parseFloat(fundAmountMst)}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {fundingTx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4" />
                )}
                <span>
                  {isNetworkMismatch
                    ? "Disabled: Network Mismatch"
                    : `Fund ${fundAmountMst} MST into Pool via BridgeKey`}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmed Tx Hash Link */}
      {lastTxHash && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span>Last Transaction Confirmed:</span>
            <code className="font-mono text-xs">{lastTxHash.slice(0, 16)}...</code>
          </div>
          {explorerTxUrl(lastTxHash) && (
            <a
              href={explorerTxUrl(lastTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>View in Explorer</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
