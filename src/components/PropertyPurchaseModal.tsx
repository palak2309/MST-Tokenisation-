import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/AppShell";
import { inr, type Property } from "@/lib/data";
import { useNetwork } from "@/contractConfig";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/lib/auth/AuthContext";
import { addActivity } from "@/lib/activity";
import {
  checkInvestorEligibilityOnChain,
  explorerTxUrl,
  getInvestorTokenBalanceOnChain,
  getPropertyTokenOnChain,
  getPropertyTokenByIdOnChain,
  isTokenLiveConfigured,
  parseContractError,
  purchaseDemoUnitsOnChain,
  type OnChainPropertyTokenInfo,
} from "@/lib/blockchain";

export interface PropertyPurchaseModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PropertyPurchaseModal({
  property,
  isOpen,
  onClose,
  onSuccess,
}: PropertyPurchaseModalProps) {
  const { config, isTestnet, isMainnet } = useNetwork();
  const { account, isConnected, connect } = useWallet();
  const { role } = useAuth();

  const [quantity, setQuantity] = useState<string>("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingOnChain, setLoadingOnChain] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<OnChainPropertyTokenInfo | null>(null);
  const [investorBalance, setInvestorBalance] = useState<bigint>(0n);
  const [isKycEligible, setIsKycEligible] = useState<boolean | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);

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

  // Network mismatch check
  const isNetworkMismatch = Boolean(
    (isTestnet && (property?.network === "mainnet" || property?.id === "MST-DEMO-PUNE-002")) ||
    (isMainnet && (property?.network === "testnet" || property?.id === "PRP-TEST-SIM-001")),
  );

  const isTokenConfigured = isTokenLiveConfigured();

  // Load live on-chain token supply and investor status
  const loadOnChainStatus = useCallback(async () => {
    if (!property || !isOpen) return;
    setLoadingOnChain(true);

    try {
      if (isTokenConfigured && !isNetworkMismatch) {
        // Query token info by property ID first, then fallback to targetTokenId
        let info = await getPropertyTokenOnChain(property.id);
        if (!info.exists && targetTokenId > 0n) {
          info = await getPropertyTokenByIdOnChain(targetTokenId);
        }
        setTokenInfo(info);

        if (account && info.tokenId > 0n) {
          const [bal, eligible] = await Promise.all([
            getInvestorTokenBalanceOnChain(account, info.tokenId),
            checkInvestorEligibilityOnChain(account),
          ]);
          setInvestorBalance(bal);
          setIsKycEligible(eligible);
        } else if (account) {
          const eligible = await checkInvestorEligibilityOnChain(account);
          setIsKycEligible(eligible);
        }
      } else {
        setTokenInfo(null);
        setInvestorBalance(0n);
        setIsKycEligible(null);
      }
    } catch (err) {
      console.warn("Failed to query on-chain property token info:", err);
    } finally {
      setLoadingOnChain(false);
    }
  }, [property, isOpen, isTokenConfigured, isNetworkMismatch, targetTokenId, account]);

  useEffect(() => {
    if (isOpen) {
      setConfirmedTxHash(null);
      setPendingTxHash(null);
      setQuantity("10");
      loadOnChainStatus();
    }
  }, [isOpen, loadOnChainStatus]);

  if (!property) return null;

  // Supply and pricing
  const maxSupplyNum = tokenInfo?.exists
    ? Number(tokenInfo.maxSupply)
    : (property.maxSupply ?? 1500);

  const remainingSupplyNum = tokenInfo?.exists
    ? Number(tokenInfo.remainingSupply)
    : maxSupplyNum - (property.poolSize / (property.unitPrice || 1000)) * 0.1;

  const availableUnits = Math.max(0, Math.floor(remainingSupplyNum));
  const unitPriceInr = property.unitPrice || 1000;
  const parsedQuantity = Math.max(0, parseInt(quantity || "0", 10) || 0);
  const totalDemoValue = parsedQuantity * unitPriceInr;
  const exceedsSupply = parsedQuantity > availableUnits;
  const canPurchase =
    isConnected &&
    !isNetworkMismatch &&
    !isSubmitting &&
    parsedQuantity > 0 &&
    !exceedsSupply &&
    isKycEligible !== false;

  const handleConfirmPurchase = async () => {
    if (!canPurchase || isSubmitting) return;

    if (!isTokenConfigured) {
      toast.error("PropertyToken contract not configured", {
        description: "Set VITE_MST_TOKEN_CONTRACT_ADDRESS to enable on-chain demo purchase.",
      });
      return;
    }

    setIsSubmitting(true);
    setPendingTxHash(null);

    try {
      const amountBig = BigInt(parsedQuantity);
      const res = await purchaseDemoUnitsOnChain(targetTokenId, amountBig, (txHash) => {
        setPendingTxHash(txHash);
      });

      setConfirmedTxHash(res.txHash);
      setPendingTxHash(null);

      // Record activity with source "demo" (per AGENTS.md rule: simulated records must carry source "demo")
      addActivity({
        kind: "Demo Units Purchased",
        propertyId: property.id,
        detail: `Purchased ${parsedQuantity} demo units of ${property.name} (${inr(totalDemoValue)} demo valuation)`,
        source: "demo",
        txHash: res.txHash,
        explorerUrl: explorerTxUrl(res.txHash),
      });

      toast.success(`Purchased ${parsedQuantity} Demo Units!`, {
        description: `Tx: ${res.txHash.slice(0, 10)}... (Minted to wallet)`,
      });

      await loadOnChainStatus();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Purchase failed", {
        description: parseContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Coins className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base font-bold">Buy Demo Property Units</DialogTitle>
            </div>
            <div className="flex items-center gap-1.5">
              <Pill tone="warning">Demo Purchase</Pill>
              <Pill tone="neutral">Simulated</Pill>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Simulated fractional property unit purchase. Fully interactive on MST blockchain with
            zero real-money payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Property Summary Card */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm">{property.name}</span>
              <span className="font-mono text-[11px] bg-background px-2 py-0.5 rounded border text-muted-foreground">
                Token ID #{targetTokenId.toString()}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{property.location}</p>

            <div className="grid grid-cols-3 gap-2 pt-1 border-t text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Total Supply
                </span>
                <span className="font-semibold font-mono">
                  {maxSupplyNum.toLocaleString()} Units
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Available</span>
                <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                  {loadingOnChain ? "..." : `${availableUnits.toLocaleString()} Units`}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Demo Unit Price
                </span>
                <span className="font-semibold font-mono text-primary">{inr(unitPriceInr)}</span>
              </div>
            </div>
          </div>

          {/* Network Mismatch Warning */}
          {isNetworkMismatch && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Network Mismatch</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This property belongs to{" "}
                {property.network === "mainnet"
                  ? "MST Mainnet (Chain 4646)"
                  : "MST Testnet (Chain 91562037)"}
                . Please switch your active network in the top navigation bar to execute actions.
              </p>
            </div>
          )}

          {/* Wallet Connection / KYC Status */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Investor Wallet:</span>
              {isConnected && account ? (
                <span className="font-mono font-medium text-foreground">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => connect()}
                  className="h-6 text-xs gap-1"
                >
                  <Wallet className="h-3 w-3" /> Connect BridgeKey
                </Button>
              )}
            </div>

            {isConnected && account && (
              <div className="flex items-center justify-between text-xs pt-1 border-t">
                <span className="text-muted-foreground">Compliance / KYC Status:</span>
                {isKycEligible === null ? (
                  <span className="text-muted-foreground italic text-[11px]">Checking...</span>
                ) : isKycEligible ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" /> Whitelisted ✓
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <ShieldAlert className="h-3.5 w-3.5" /> KYC Whitelist Required
                  </span>
                )}
              </div>
            )}

            {isConnected && account && (
              <div className="flex items-center justify-between text-xs pt-1 border-t">
                <span className="text-muted-foreground">Current Wallet Balance:</span>
                <span className="font-mono font-semibold text-foreground">
                  {investorBalance.toString()} Units
                </span>
              </div>
            )}
          </div>

          {/* Quantity Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="purchase-qty" className="font-semibold text-foreground">
                Quantity to Purchase (Units):
              </label>
              <span className="text-[11px] text-muted-foreground">
                Max available:{" "}
                <span className="font-mono font-semibold">{availableUnits.toLocaleString()}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <input
                id="purchase-qty"
                type="number"
                min="1"
                max={availableUnits}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={isSubmitting || !isConnected}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Enter units"
              />
              <div className="flex gap-1">
                {[10, 25, 50, 100].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSubmitting || preset > availableUnits}
                    onClick={() => setQuantity(preset.toString())}
                    className="h-9 px-2 text-xs font-mono"
                  >
                    +{preset}
                  </Button>
                ))}
              </div>
            </div>
            {exceedsSupply && (
              <p className="text-[11px] text-destructive">
                Quantity exceeds available supply of {availableUnits.toLocaleString()} units.
              </p>
            )}
          </div>

          {/* Pre-Confirmation Demo Order Breakdown */}
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-xs">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Purchase Summary & Value Calculation
            </span>
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Quantity:</span>
              <span className="font-mono font-semibold text-foreground">
                {parsedQuantity} Units
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Demo Price Per Unit:</span>
              <span className="font-mono font-semibold text-foreground">{inr(unitPriceInr)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-bold">
              <span>Total Demo Value:</span>
              <span className="font-mono text-primary text-sm">{inr(totalDemoValue)}</span>
            </div>
          </div>

          {/* Prominent Legal & Demo Disclaimer */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Demo purchase — no real-money payment</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              No real-money payment, no MST payment transfer, no payment gateway, and no claim of
              legal property ownership. Holding units does not transfer legal title to any real
              estate. Secondary peer transfers remain disabled on-chain.
            </p>
          </div>

          {/* Transaction status tracker */}
          {pendingTxHash && (
            <div className="flex items-center gap-2 rounded bg-muted/60 p-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              <span>Broadcasting transaction...</span>
              <a
                href={explorerTxUrl(pendingTxHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary hover:underline ml-auto flex items-center gap-1"
              >
                <span>{pendingTxHash.slice(0, 8)}...</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {confirmedTxHash && (
            <div className="flex items-center gap-2 rounded bg-emerald-500/15 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Transaction confirmed! Tokens minted to your wallet.</span>
              <a
                href={explorerTxUrl(confirmedTxHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-emerald-800 dark:text-emerald-200 underline ml-auto flex items-center gap-1"
              >
                <span>{confirmedTxHash.slice(0, 8)}...</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>

          {!isConnected ? (
            <Button
              type="button"
              onClick={() => connect()}
              className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90"
            >
              <Wallet className="h-4 w-4" />
              <span>Connect BridgeKey to Buy</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleConfirmPurchase}
              disabled={!canPurchase}
              className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Confirming On-Chain...</span>
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4" />
                  <span>Confirm Demo Purchase ({parsedQuantity} Units)</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
