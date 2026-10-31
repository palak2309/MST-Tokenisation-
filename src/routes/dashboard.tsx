import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  Coins,
  ExternalLink,
  History,
  Lock,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Loader2,
  RefreshCw,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Pill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute, RoleBadge } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { useNetwork } from "@/contractConfig";
import { useWallet } from "@/hooks/useWallet";
import { useAllProperties } from "@/lib/propertyStore";
import {
  chainConfig,
  checkInvestorEligibilityOnChain,
  explorerTxUrl,
  getInvestorTokenBalanceOnChain,
  getStakeInfoOnChain,
  isStakingApprovedOnChain,
  isStakingLiveConfigured,
  isTokenLiveConfigured,
  parseContractError,
  setStakingApprovalOnChain,
  stakeUnitsOnChain,
  TESTNET_ADMIN_ACCOUNT,
  unstakeUnitsOnChain,
  type OnChainStakeInfo,
} from "@/lib/blockchain";
import { inr, type Property } from "@/lib/data";
import { useActivity } from "@/lib/activity";
import { PropertyPurchaseModal } from "@/components/PropertyPurchaseModal";
import { PropertyDetailsModal } from "@/components/PropertyDetailsModal";
import { requireAuthLoader } from "@/lib/auth/routeAuth";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: DashboardWithGuard,
});

function DashboardWithGuard() {
  return (
    <ProtectedRoute>
      <DashboardPageContent />
    </ProtectedRoute>
  );
}

const TARGET_DEMO_TOKEN_ID = 1n;

function DashboardPageContent() {
  const { user, role, linkWallet } = useAuth();
  const { account, isConnected } = useWallet();
  const { config, isTestnet, isMainnet } = useNetwork();
  const allProperties = useAllProperties();
  const activity = useActivity();
  const [linking, setLinking] = useState(false);
  const [selectedPropertyForPurchase, setSelectedPropertyForPurchase] = useState<Property | null>(
    null,
  );
  const [selectedPropertyForDetails, setSelectedPropertyForDetails] = useState<Property | null>(
    null,
  );

  // Live Staking State for Investor Dashboard
  const [investorUnits, setInvestorUnits] = useState<bigint>(0n);
  const [stakedUnits, setStakedUnits] = useState<bigint>(0n);
  const [isApproved, setIsApproved] = useState(false);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [stakeInfo, setStakeInfo] = useState<OnChainStakeInfo | null>(null);
  const [loadingStaking, setLoadingStaking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [quickStakeAmount, setQuickStakeAmount] = useState<string>("10");
  const [quickUnstakeAmount, setQuickUnstakeAmount] = useState<string>("10");

  const refreshInvestorStaking = useCallback(async () => {
    if (role !== "INVESTOR") return;
    setLoadingStaking(true);
    try {
      const targetTokenId = isTestnet ? 1n : 2n;
      const targetAccount = account || (isTestnet ? TESTNET_ADMIN_ACCOUNT : undefined);

      if (isStakingLiveConfigured() && isTokenLiveConfigured() && targetAccount) {
        const [bal, app, elig, st] = await Promise.all([
          getInvestorTokenBalanceOnChain(targetAccount, targetTokenId),
          isStakingApprovedOnChain(targetAccount),
          checkInvestorEligibilityOnChain(targetAccount),
          getStakeInfoOnChain(targetTokenId, targetAccount),
        ]);
        setInvestorUnits(bal);
        setIsApproved(app);
        setIsEligible(elig);
        setStakeInfo(st);
        setStakedUnits(st.amount);
        if (st.amount > 0n) {
          setQuickUnstakeAmount(st.amount.toString());
        }
      } else if (isTestnet) {
        setInvestorUnits(0n);
        setStakedUnits(10n);
        setIsApproved(true);
        setIsEligible(true);
      }
    } catch (err) {
      console.warn("Failed to refresh investor staking on dashboard:", err);
    } finally {
      setLoadingStaking(false);
    }
  }, [account, role, isTestnet]);

  useEffect(() => {
    refreshInvestorStaking();
  }, [refreshInvestorStaking, config.chainId]);

  const handleQuickApprove = async () => {
    setActionLoading(true);
    try {
      const res = await setStakingApprovalOnChain(true, (hash) => setLastTxHash(hash));
      setIsApproved(true);
      toast.success("Staking operator approved successfully!", {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshInvestorStaking();
    } catch (err) {
      toast.error("Operator approval failed", { description: parseContractError(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickStake = async () => {
    const amt = BigInt(Math.max(1, parseInt(quickStakeAmount || "10", 10)));
    setActionLoading(true);
    try {
      const res = await stakeUnitsOnChain(TARGET_DEMO_TOKEN_ID, amt, 0n, (hash) =>
        setLastTxHash(hash),
      );
      toast.success(`Successfully staked ${amt.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}... (0-Day Lock)`,
      });
      await refreshInvestorStaking();
    } catch (err) {
      toast.error("Staking failed", { description: parseContractError(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickUnstake = async () => {
    const amt = BigInt(Math.max(1, parseInt(quickUnstakeAmount || "10", 10)));
    setActionLoading(true);
    try {
      const res = await unstakeUnitsOnChain(TARGET_DEMO_TOKEN_ID, amt, (hash) =>
        setLastTxHash(hash),
      );
      toast.success(`Successfully unstaked ${amt.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}... Units returned to wallet.`,
      });
      await refreshInvestorStaking();
    } catch (err) {
      toast.error("Unstaking failed", { description: parseContractError(err) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLinkCurrentWallet = async () => {
    if (!account) return;
    setLinking(true);
    try {
      await linkWallet(account);
      toast.success("Connected BridgeKey wallet linked to your profile!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link wallet.");
    } finally {
      setLinking(false);
    }
  };

  const isTokenConfigured = isTokenLiveConfigured();

  return (
    <div className="space-y-8">
      {/* User Identity Banner */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{user?.name}</h1>
              <RoleBadge role={role} />
            </div>
            <p className="text-xs text-muted-foreground">
              Authenticated email: <span className="font-mono text-foreground">{user?.email}</span>
            </p>
          </div>

          {/* Wallet Link Status */}
          <div className="flex items-center gap-2 text-xs">
            {user?.linkedWalletAddress ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#F799B3]/40 bg-[#F799B3]/15 px-3 py-1.5 text-[#202938] font-mono font-medium">
                <Wallet className="h-4 w-4 text-[#202938]" />
                <span>
                  Linked: {user.linkedWalletAddress.slice(0, 6)}...
                  {user.linkedWalletAddress.slice(-4)}
                </span>
              </div>
            ) : isConnected && account ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLinkCurrentWallet}
                disabled={linking}
              >
                Link Wallet ({account.slice(0, 6)}...)
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs italic">
                Connect BridgeKey wallet to link with your identity
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ROLE 1: ADMIN DASHBOARD */}
      {role === "ADMIN" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">User Management</p>
              <p className="text-2xl font-bold text-foreground">Active Admin</p>
              <p className="text-xs text-muted-foreground">
                Authorize platform roles and manage participant profiles.
              </p>
              <Link to="/admin" className="inline-block pt-2">
                <Button size="sm" className="gap-2">
                  <Users className="h-4 w-4" />
                  <span>Open Admin Console</span>
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Platform Properties</p>
              <p className="text-2xl font-bold text-foreground">
                {allProperties.length} Properties
              </p>
              <p className="text-xs text-muted-foreground">
                Onboarded properties ready for tokenisation and verification.
              </p>
              <Link to="/verify" className="inline-block pt-2">
                <Button size="sm" variant="outline" className="gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Verify Registries</span>
                </Button>
              </Link>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Blockchain Network</p>
              <p className="text-2xl font-bold text-foreground">
                {chainConfig.networkName ?? "MST Testnet"}
              </p>
              <p className="text-xs text-muted-foreground">
                Target chain ID {chainConfig.chainId ?? "91562037"} ·{" "}
                {chainConfig.contractAddress ? "Registry verified." : "Unconfigured / Demo Mode."}
              </p>
              <Link to="/activity" className="inline-block pt-2">
                <Button size="sm" variant="outline" className="gap-2">
                  <History className="h-4 w-4" />
                  <span>Blockchain Activity</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ROLE 2: PROPERTY ISSUER DASHBOARD */}
      {role === "PROPERTY_ISSUER" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-500" />
                  <span>Property Issuer Operations</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Submit real estate assets, compute SHA-256 document bundles, and manage token unit
                  issuance on MST Testnet.
                </p>
              </div>
              <Link to="/properties/new">
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <PlusCircle className="h-4 w-4" />
                  <span>Add New Property</span>
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">1. Asset Onboarding</p>
                <p className="text-xs text-muted-foreground">
                  Input property valuation, rental parameters, and client-side SHA-256 document
                  fingerprints without server storage.
                </p>
                <Link
                  to="/properties/new"
                  className="text-xs text-primary font-medium hover:underline inline-block"
                >
                  Go to Property Form →
                </Link>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  2. Token Registration & Issuance
                </p>
                <p className="text-xs text-muted-foreground">
                  Execute on-chain `registerProperty` and `issueUnits` via PropertyToken contract
                  using an authorized wallet holding `ISSUER_ROLE`.
                </p>
                <Link
                  to="/invest"
                  className="text-xs text-primary font-medium hover:underline inline-block"
                >
                  Open Tokenisation Workspace →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ROLE 3: COMPLIANCE OFFICER DASHBOARD */}
      {role === "COMPLIANCE_OFFICER" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-purple-500" />
                <span>Compliance & Investor Whitelist Manager</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Authorize investor addresses (`setInvestorEligibility`) and govern secondary
                transfer permissions (`setTransfersEnabled`).
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-purple-500" />
                <span>On-Chain Compliance Controls</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Investor whitelisting requires cryptographic authorization from an address holding
                `COMPLIANCE_ROLE` on the deployed PropertyToken contract.
              </p>
              <Link to="/invest">
                <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700">
                  <Coins className="h-4 w-4" />
                  <span>Access Whitelist Management Console</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ROLE 4: INVESTOR DASHBOARD */}
      {role === "INVESTOR" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#C9B8E8]/50 bg-[#C9B8E8]/15 p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#202938]" />
                <span>Investor Portfolio & Opportunities</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Browse verified properties, inspect document fingerprints, and model potential
                returns.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {allProperties
                .filter((p) => {
                  if (isTestnet) return p.id === "PRP-TEST-SIM-001" || p.network !== "mainnet";
                  return p.id === "MST-DEMO-PUNE-002" || p.network !== "testnet";
                })
                .slice(0, 3)
                .map((prop) => (
                  <div
                    key={prop.id}
                    className="rounded-lg border border-border bg-card p-4 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground">
                          {prop.id}
                        </span>
                        {prop.id === "PRP-TEST-SIM-001" && (
                          <span className="text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                            Testnet Token #1 · Simulated
                          </span>
                        )}
                        {prop.id === "MST-DEMO-PUNE-002" && (
                          <span className="text-[10px] font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                            Mainnet Token #2 · Simulated
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground text-sm mt-1">{prop.name}</h3>
                      <p className="text-xs text-muted-foreground">{prop.location}</p>
                      <p className="text-xs font-semibold text-primary mt-2">
                        Pool: {inr(prop.poolSize)}
                      </p>
                    </div>
                    <div className="pt-3 border-t flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => setSelectedPropertyForPurchase(prop)}
                        className="flex-1 text-xs gap-1 bg-primary hover:bg-primary/90"
                      >
                        <Coins className="h-3.5 w-3.5" />
                        <span>Buy Units</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedPropertyForDetails(prop)}
                        className="flex-1 text-xs"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/staking">
                <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Lock className="h-4 w-4" />
                  <span>Property Staking Vault</span>
                </Button>
              </Link>
              <Link to="/invest">
                <Button variant="outline" className="gap-2">
                  <Calculator className="h-4 w-4" />
                  <span>Fractional Investment Calculator</span>
                </Button>
              </Link>
              <Link to="/rental">
                <Button variant="outline" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Rental Yield Calculator</span>
                </Button>
              </Link>
            </div>

            {/* Interactive Live Staking Vault Card */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm">
                      Property Token Staking Vault (Live On-Chain)
                    </h3>
                    <Pill tone="neutral">ERC-1155 Custody</Pill>
                    <Pill tone="neutral">0-Day Lock Ready</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lock fractional property units into non-custodial smart contract custody.
                    Zero-day lock enables immediate staking and unstaking demonstrations.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={refreshInvestorStaking}
                    disabled={loadingStaking}
                    className="h-8 px-2 text-xs gap-1"
                    title="Refresh live on-chain balances"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingStaking ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </Button>
                  <Link to="/staking">
                    <Button size="sm" className="gap-2">
                      <Coins className="h-4 w-4" />
                      <span>Full Vault Page</span>
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Live Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs">
                <div className="rounded-lg border bg-primary/10 border-primary/40 p-3 space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-primary font-semibold uppercase tracking-wider">
                    Total Units Owned
                  </span>
                  <p className="text-base font-bold text-primary font-mono">
                    {(investorUnits + stakedUnits).toString()} Units
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {inr(Number(investorUnits + stakedUnits) * 1000)} Demo Val.
                  </p>
                </div>
                <div className="rounded-lg border bg-background/60 p-3 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Available in Wallet
                  </span>
                  <p className="text-base font-bold text-foreground font-mono">
                    {investorUnits.toString()} Units
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isTestnet ? "PRP-TEST-SIM-001 (Token #1)" : "Mainnet Property (Token #2)"}
                  </p>
                </div>
                <div className="rounded-lg border bg-background/60 p-3 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Staked in Vault
                  </span>
                  <p className="text-base font-bold text-primary font-mono">
                    {stakedUnits.toString()} Units
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isTestnet ? "In Staking Custody" : "Staking Not Deployed on Mainnet"}
                  </p>
                </div>
                <div className="rounded-lg border bg-background/60 p-3 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Lock Status
                  </span>
                  <p className="text-base font-bold text-foreground">
                    {stakedUnits > 0n
                      ? stakeInfo?.isLocked
                        ? "Active Lock"
                        : "Flexible (0-Day)"
                      : "0-Day Flexible"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {stakedUnits > 0n && !stakeInfo?.isLocked
                      ? "Ready to unstake anytime"
                      : "Instant demo ready"}
                  </p>
                </div>
                <div className="rounded-lg border bg-background/60 p-3 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    KYC & Operator Status
                  </span>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {isEligible ? "KYC Whitelisted ✓" : "KYC Pending"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isApproved ? "Operator Approved ✓" : "Approval Needed"}
                  </p>
                </div>
              </div>

              {/* Interactive Staking & Unstaking Actions (Connected Wallet) */}
              {isConnected && (
                <div className="mt-3 pt-3 border-t border-primary/20 space-y-3">
                  {!isApproved ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-amber-700 dark:text-amber-400">
                          One-Time Staking Operator Approval Required
                        </p>
                        <p className="text-muted-foreground">
                          Grant the PropertyTokenStaking contract permission to custody property
                          units when you stake.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleQuickApprove}
                        disabled={actionLoading}
                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      >
                        {actionLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        <span>Approve Staking Operator</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Stake Units Box */}
                      <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5 text-primary" />
                            <span>Quick Stake (0-Day Lock)</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Available: {investorUnits.toString()} Units
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Deposit units into custody with a 0-day flexible lock for instant
                          demonstration.
                        </p>
                        <div className="flex gap-2 pt-1">
                          <input
                            type="number"
                            min="1"
                            max={investorUnits.toString()}
                            value={quickStakeAmount}
                            onChange={(e) => setQuickStakeAmount(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border rounded bg-background font-mono"
                            placeholder="Units"
                          />
                          <Button
                            size="sm"
                            onClick={handleQuickStake}
                            disabled={actionLoading || investorUnits < 1n}
                            className="flex-1 gap-1.5 text-xs h-8"
                          >
                            {actionLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                            <span>Stake Units</span>
                          </Button>
                        </div>
                      </div>

                      {/* Unstake Units Box */}
                      <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Quick Unstake</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Staked: {stakedUnits.toString()} Units
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Withdraw units back to your investor wallet. Ready immediately with 0-day
                          lock.
                        </p>
                        <div className="flex gap-2 pt-1">
                          <input
                            type="number"
                            min="1"
                            max={stakedUnits.toString()}
                            value={quickUnstakeAmount}
                            onChange={(e) => setQuickUnstakeAmount(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border rounded bg-background font-mono"
                            placeholder="Units"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleQuickUnstake}
                            disabled={
                              actionLoading || stakedUnits < 1n || Boolean(stakeInfo?.isLocked)
                            }
                            className="flex-1 gap-1.5 text-xs h-8"
                          >
                            {actionLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            <span>Unstake Units</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Transaction Feedback Notification */}
                  {lastTxHash && (
                    <div className="flex items-center justify-between gap-2 rounded bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                      <span>Latest on-chain transaction:</span>
                      <a
                        href={explorerTxUrl(lastTxHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-primary hover:underline flex items-center gap-1"
                      >
                        <span>
                          {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Holdings Grouped by Property */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm">
                      Your Property Holdings Grouped by Asset
                    </h3>
                    <Pill tone="neutral">ERC-1155 Custody</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Live balances of property units in your investor wallet and vault staking
                    custody.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-muted/40 font-semibold text-[11px] text-muted-foreground border-b">
                  <div className="col-span-4 sm:col-span-3">Property Asset</div>
                  <div className="col-span-2 text-center">Token ID</div>
                  <div className="col-span-2 text-right">In Wallet</div>
                  <div className="col-span-2 text-right">In Staking</div>
                  <div className="col-span-2 sm:col-span-3 text-right">Actions</div>
                </div>

                {allProperties
                  .filter((p) => {
                    if (isTestnet) return p.id === "PRP-TEST-SIM-001" || p.network !== "mainnet";
                    return p.id === "MST-DEMO-PUNE-002" || p.network !== "testnet";
                  })
                  .slice(0, 3)
                  .map((prop) => {
                    const isTargetProp =
                      (isTestnet && prop.id === "PRP-TEST-SIM-001") ||
                      (isMainnet && prop.id === "MST-DEMO-PUNE-002");
                    const propWalletUnits = isTargetProp ? investorUnits : 0n;
                    const propStakedUnits = isTargetProp ? stakedUnits : 0n;
                    const pTokenId = isTargetProp
                      ? isTestnet
                        ? 1n
                        : 2n
                      : BigInt(prop.tokenId ?? 1);

                    return (
                      <div
                        key={prop.id}
                        className="grid grid-cols-12 gap-2 p-3 items-center border-b last:border-b-0 text-xs hover:bg-muted/20 transition-colors"
                      >
                        <div className="col-span-4 sm:col-span-3 space-y-0.5">
                          <p className="font-semibold text-foreground truncate">{prop.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {prop.location}
                          </p>
                        </div>

                        <div className="col-span-2 text-center font-mono font-medium">
                          #{pTokenId.toString()}
                        </div>

                        <div className="col-span-2 text-right font-mono font-semibold text-foreground">
                          {propWalletUnits.toString()}
                        </div>

                        <div className="col-span-2 text-right font-mono font-semibold text-primary">
                          {propStakedUnits.toString()}
                        </div>

                        <div className="col-span-2 sm:col-span-3 flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => setSelectedPropertyForPurchase(prop)}
                            className="h-7 px-2 text-[11px] gap-1 bg-primary hover:bg-primary/90"
                          >
                            <Coins className="h-3 w-3" />
                            <span className="hidden sm:inline">Buy</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedPropertyForDetails(prop)}
                            className="h-7 px-2 text-[11px]"
                          >
                            Details
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Purchase & Staking Activity Log */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-foreground text-sm">
                      Purchase & Staking Transaction History
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Audit trail of your fractional unit purchases, staking custody, and reward
                    lifecycle events.
                  </p>
                </div>
                <Link to="/activity" className="text-xs text-primary hover:underline">
                  Full Activity Log →
                </Link>
              </div>

              {activity.filter((a) =>
                [
                  "Demo Units Purchased",
                  "Units Staked",
                  "Units Unstaked",
                  "Staking Approved",
                  "Contribution",
                ].includes(a.kind),
              ).length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No purchases or staking events recorded in this session. Use the "Buy Units" or
                  "Stake Units" buttons above to execute transactions.
                </div>
              ) : (
                <div className="rounded-lg border divide-y max-h-60 overflow-y-auto">
                  {activity
                    .filter((a) =>
                      [
                        "Demo Units Purchased",
                        "Units Staked",
                        "Units Unstaked",
                        "Staking Approved",
                        "Contribution",
                      ].includes(a.kind),
                    )
                    .slice(0, 10)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between text-xs hover:bg-muted/10 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{item.kind}</span>
                            <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                              {item.source === "demo" ? "Simulated" : "On-Chain"}
                            </span>
                            {item.propertyId && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {item.propertyId}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{item.detail}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-muted-foreground block">
                            {new Date(item.time).toLocaleTimeString()}
                          </span>
                          {item.txHash && (
                            <a
                              href={explorerTxUrl(item.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[10px] text-primary hover:underline flex items-center justify-end gap-1"
                            >
                              <span>{item.txHash.slice(0, 8)}...</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ROLE 5: EMERGENCY PAUSER DASHBOARD */}
      {role === "EMERGENCY_PAUSER" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>Emergency Operations & Circuit Breaker</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Scope-restricted operational controls. Authorized only for emergency contract
                pause/unpause executions.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Lock className="h-4 w-4 text-amber-500" />
                <span>Narrow Scope Enforcement</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This role holds authority strictly for emergency pause/unpause triggers via an
                authorized wallet holding `PAUSER_ROLE`. It does NOT grant general administrator
                permissions, user management, or issuance rights.
              </p>
              <Link to="/pause">
                <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700">
                  <PauseCircle className="h-4 w-4" />
                  <span>Open Emergency Pauser Controls</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Property Purchase Modal */}
      <PropertyPurchaseModal
        property={selectedPropertyForPurchase}
        isOpen={Boolean(selectedPropertyForPurchase)}
        onClose={() => setSelectedPropertyForPurchase(null)}
        onSuccess={() => {
          refreshInvestorStaking();
        }}
      />

      {/* Property Details Modal */}
      <PropertyDetailsModal
        property={selectedPropertyForDetails}
        isOpen={Boolean(selectedPropertyForDetails)}
        onClose={() => setSelectedPropertyForDetails(null)}
        onRefresh={() => {
          refreshInvestorStaking();
        }}
      />
    </div>
  );
}
