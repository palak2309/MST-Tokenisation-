import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  History,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Unlock,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/AppShell";
import { inr, type Property } from "@/lib/data";
import { useNetwork } from "@/contractConfig";
import { useWallet } from "@/hooks/useWallet";
import { useActivity, addActivity } from "@/lib/activity";
import {
  checkInvestorEligibilityOnChain,
  explorerTxUrl,
  getInvestorTokenBalanceOnChain,
  getPropertyTokenOnChain,
  getPropertyTokenByIdOnChain,
  getStakeInfoOnChain,
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
} from "@/lib/blockchain";
import { PropertyPurchaseModal } from "./PropertyPurchaseModal";

export interface PropertyDetailsModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function PropertyDetailsModal({
  property,
  isOpen,
  onClose,
  onRefresh,
}: PropertyDetailsModalProps) {
  const { config, isTestnet, isMainnet } = useNetwork();
  const { account, isConnected, connect } = useWallet();
  const activity = useActivity();

  const [loading, setLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<OnChainPropertyTokenInfo | null>(null);
  const [walletUnits, setWalletUnits] = useState<bigint>(0n);
  const [stakedUnits, setStakedUnits] = useState<bigint>(0n);
  const [stakeInfo, setStakeInfo] = useState<OnChainStakeInfo | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);

  // Quick Action States
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [stakeActionLoading, setStakeActionLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState<string>("10");
  const [unstakeAmount, setUnstakeAmount] = useState<string>("10");
  const [activeAction, setActiveAction] = useState<"overview" | "stake" | "unstake">("overview");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Determine token ID for this property on active network
  const targetTokenId: bigint = (() => {
    if (!property) return 1n;
    if (property.id === "MST-DEMO-PUNE-002") {
      return isMainnet && config.tokenId ? BigInt(config.tokenId) : 1n;
    }
    if (property.id === "PRP-TEST-SIM-001") {
      return isTestnet && config.tokenId ? BigInt(config.tokenId) : 1n;
    }
    return property.tokenId ? BigInt(property.tokenId) : 1n;
  })();

  const isNetworkMismatch = Boolean(
    (isTestnet && (property?.network === "mainnet" || property?.id === "MST-DEMO-PUNE-002")) ||
    (isMainnet && (property?.network === "testnet" || property?.id === "PRP-TEST-SIM-001")),
  );

  const isTokenConfigured = isTokenLiveConfigured();
  const isStakingConfigured = isStakingLiveConfigured();

  const refreshPropertyBalances = useCallback(async () => {
    if (!property || !isOpen) return;
    setLoading(true);

    try {
      if (isNetworkMismatch) {
        setTokenInfo(null);
        setWalletUnits(0n);
        setStakedUnits(0n);
        setStakeInfo(null);
        return;
      }

      const targetAccount = account || (isTestnet ? TESTNET_ADMIN_ACCOUNT : undefined);

      if (isTokenConfigured) {
        let info = await getPropertyTokenOnChain(property.id);
        if (!info.exists && targetTokenId > 0n) {
          info = await getPropertyTokenByIdOnChain(targetTokenId);
        }
        setTokenInfo(info);

        const activeId = info.tokenId > 0n ? info.tokenId : targetTokenId;

        if (targetAccount && activeId > 0n) {
          const [bal, app, elig] = await Promise.all([
            getInvestorTokenBalanceOnChain(targetAccount, activeId),
            isStakingApprovedOnChain(targetAccount),
            checkInvestorEligibilityOnChain(targetAccount),
          ]);
          setWalletUnits(bal);
          setIsApproved(app);
          setIsEligible(elig);

          if (isStakingConfigured) {
            const st = await getStakeInfoOnChain(activeId, targetAccount);
            setStakeInfo(st);
            setStakedUnits(st.amount);
            if (st.amount > 0n) {
              setUnstakeAmount(st.amount.toString());
            }
          } else {
            setStakedUnits(0n);
            setStakeInfo(null);
          }
        }
      } else if (isTestnet && property.id === "PRP-TEST-SIM-001") {
        setWalletUnits(0n);
        setStakedUnits(10n);
        setIsApproved(true);
        setIsEligible(true);
      }
    } catch (err) {
      console.warn("Failed to fetch live property balances:", err);
    } finally {
      setLoading(false);
    }
  }, [
    property,
    isOpen,
    isNetworkMismatch,
    account,
    isTestnet,
    isTokenConfigured,
    isStakingConfigured,
    targetTokenId,
  ]);

  useEffect(() => {
    if (isOpen) {
      setActiveAction("overview");
      setLastTxHash(null);
      refreshPropertyBalances();
    }
  }, [isOpen, refreshPropertyBalances]);

  if (!property) return null;

  const propertyActivity = activity.filter(
    (a) =>
      a.propertyId === property.id ||
      (property.id === "PRP-TEST-SIM-001" && a.kind.includes("Staked")),
  );

  const totalUnitsOwned = walletUnits + stakedUnits;
  const maxSupplyNum = tokenInfo?.exists
    ? Number(tokenInfo.maxSupply)
    : (property.maxSupply ?? 1500);
  const remainingSupplyNum = tokenInfo?.exists ? Number(tokenInfo.remainingSupply) : maxSupplyNum;
  const unitPriceInr = property.unitPrice || 1000;

  const handleApprove = async () => {
    setStakeActionLoading(true);
    try {
      const res = await setStakingApprovalOnChain(true, (hash) => setLastTxHash(hash));
      setIsApproved(true);
      addActivity({
        kind: "Staking Approved",
        propertyId: property.id,
        detail: "Approved PropertyTokenStaking operator on-chain",
        source: "demo",
        txHash: res.txHash,
        explorerUrl: explorerTxUrl(res.txHash),
      });
      toast.success("Staking operator approved successfully!", {
        description: `Tx: ${res.txHash.slice(0, 10)}...`,
      });
      await refreshPropertyBalances();
    } catch (err) {
      toast.error("Operator approval failed", { description: parseContractError(err) });
    } finally {
      setStakeActionLoading(false);
    }
  };

  const handleStakeUnits = async () => {
    const amt = BigInt(Math.max(1, parseInt(stakeAmount || "10", 10)));
    if (amt > walletUnits) {
      toast.error("Insufficient wallet units to stake");
      return;
    }
    setStakeActionLoading(true);
    try {
      const res = await stakeUnitsOnChain(targetTokenId, amt, 0n, (hash) => setLastTxHash(hash));
      addActivity({
        kind: "Units Staked",
        propertyId: property.id,
        detail: `Staked ${amt.toString()} units of ${property.name} (0-Day lock)`,
        source: "demo",
        txHash: res.txHash,
        explorerUrl: explorerTxUrl(res.txHash),
      });
      toast.success(`Successfully staked ${amt.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}... (0-Day Lock)`,
      });
      await refreshPropertyBalances();
      if (onRefresh) onRefresh();
      setActiveAction("overview");
    } catch (err) {
      toast.error("Staking failed", { description: parseContractError(err) });
    } finally {
      setStakeActionLoading(false);
    }
  };

  const handleUnstakeUnits = async () => {
    const amt = BigInt(Math.max(1, parseInt(unstakeAmount || "10", 10)));
    if (amt > stakedUnits) {
      toast.error("Amount exceeds staked balance");
      return;
    }
    setStakeActionLoading(true);
    try {
      const res = await unstakeUnitsOnChain(targetTokenId, amt, (hash) => setLastTxHash(hash));
      addActivity({
        kind: "Units Unstaked",
        propertyId: property.id,
        detail: `Unstaked ${amt.toString()} units of ${property.name} back to wallet`,
        source: "demo",
        txHash: res.txHash,
        explorerUrl: explorerTxUrl(res.txHash),
      });
      toast.success(`Successfully unstaked ${amt.toString()} units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}... Units returned to wallet.`,
      });
      await refreshPropertyBalances();
      if (onRefresh) onRefresh();
      setActiveAction("overview");
    } catch (err) {
      toast.error("Unstaking failed", { description: parseContractError(err) });
    } finally {
      setStakeActionLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !stakeActionLoading && onClose()}>
        <DialogContent className="max-w-xl sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-bold text-foreground">
                    {property.name}
                  </DialogTitle>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded border text-muted-foreground">
                    Token ID #{targetTokenId.toString()}
                  </span>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{property.location}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={refreshPropertyBalances}
                  disabled={loading}
                  className="h-8 px-2 text-xs gap-1"
                  title="Refresh on-chain data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </Button>
                <Pill tone="neutral">Simulated</Pill>
              </div>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Live on-chain metrics, fractional ownership custody, and transaction lifecycle for
              this asset.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 text-xs">
            {/* Live On-Chain Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Total Supply
                </span>
                <p className="text-base font-bold font-mono text-foreground">
                  {maxSupplyNum.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">Max unit cap</p>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Available Units
                </span>
                <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {remainingSupplyNum.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">Remaining to mint</p>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  In Your Wallet
                </span>
                <p className="text-base font-bold font-mono text-foreground">
                  {walletUnits.toString()} Units
                </p>
                <p className="text-[10px] text-muted-foreground">Available to stake</p>
              </div>

              <div className="rounded-lg border bg-card p-3 space-y-1">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Staked in Vault
                </span>
                <p className="text-base font-bold font-mono text-primary">
                  {stakedUnits.toString()} Units
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {stakeInfo?.isLocked ? "Locked" : "0-Day Flexible"}
                </p>
              </div>
            </div>

            {/* Total Investor Portfolio Holdings For This Property */}
            <div className="rounded-lg border bg-muted/30 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Your Total Position
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold font-mono text-foreground">
                    {totalUnitsOwned.toString()} Units
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    ({inr(Number(totalUnitsOwned) * unitPriceInr)} Demo Valuation)
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {walletUnits.toString()} Units Available + {stakedUnits.toString()} Units Staked
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setPurchaseModalOpen(true)}
                  className="gap-1.5 bg-primary hover:bg-primary/90 text-xs h-8"
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>Buy Units</span>
                </Button>

                <Button
                  size="sm"
                  variant={activeAction === "stake" ? "default" : "outline"}
                  onClick={() => setActiveAction(activeAction === "stake" ? "overview" : "stake")}
                  disabled={walletUnits < 1n}
                  className="gap-1.5 text-xs h-8"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Stake</span>
                </Button>

                <Button
                  size="sm"
                  variant={activeAction === "unstake" ? "default" : "outline"}
                  onClick={() =>
                    setActiveAction(activeAction === "unstake" ? "overview" : "unstake")
                  }
                  disabled={stakedUnits < 1n}
                  className="gap-1.5 text-xs h-8"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Unstake</span>
                </Button>
              </div>
            </div>

            {/* Interactive Stake Panel */}
            {activeAction === "stake" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground text-sm">
                      Stake Property Units
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    Wallet: {walletUnits.toString()} Units
                  </span>
                </div>

                {!isApproved ? (
                  <div className="flex items-center justify-between gap-3 rounded bg-amber-500/10 border border-amber-500/30 p-2.5">
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      Operator approval required before custody staking.
                    </span>
                    <Button
                      size="sm"
                      onClick={handleApprove}
                      disabled={stakeActionLoading}
                      className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-xs shrink-0"
                    >
                      {stakeActionLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                      <span>Approve Staking Operator</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min="1"
                      max={walletUnits.toString()}
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="w-28 px-3 py-1.5 border rounded bg-background font-mono text-xs"
                      placeholder="Units"
                    />
                    <Button
                      size="sm"
                      onClick={handleStakeUnits}
                      disabled={stakeActionLoading || walletUnits < 1n}
                      className="gap-1.5 text-xs"
                    >
                      {stakeActionLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      <span>Confirm Stake (0-Day Flexible)</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveAction("overview")}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Unstake Panel */}
            {activeAction === "unstake" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-foreground text-sm">
                      Unstake Property Units
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    Staked: {stakedUnits.toString()} Units
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    max={stakedUnits.toString()}
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className="w-28 px-3 py-1.5 border rounded bg-background font-mono text-xs"
                    placeholder="Units"
                  />
                  <Button
                    size="sm"
                    onClick={handleUnstakeUnits}
                    disabled={stakeActionLoading || stakedUnits < 1n}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    {stakeActionLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                    <span>Confirm Unstake</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveAction("overview")}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Latest Transaction Feedback */}
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

            {/* Property Transaction History */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span>Property Transaction History</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {propertyActivity.length} Events recorded
                </span>
              </div>

              {propertyActivity.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3 text-center border rounded bg-muted/20">
                  No activity recorded for this property yet. Execute a purchase or stake to view
                  lifecycle events.
                </p>
              ) : (
                <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                  {propertyActivity.slice(0, 8).map((ev) => (
                    <div key={ev.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{ev.kind}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                            {ev.source === "demo" ? "Simulated" : "On-Chain"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{ev.detail}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-muted-foreground block">
                          {new Date(ev.time).toLocaleTimeString()}
                        </span>
                        {ev.txHash && (
                          <a
                            href={explorerTxUrl(ev.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[10px] text-primary hover:underline flex items-center justify-end gap-0.5"
                          >
                            <span>{ev.txHash.slice(0, 6)}...</span>
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
        </DialogContent>
      </Dialog>

      {/* Embedded Buy Units Modal */}
      <PropertyPurchaseModal
        property={property}
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        onSuccess={() => {
          refreshPropertyBalances();
          if (onRefresh) onRefresh();
        }}
      />
    </>
  );
}
