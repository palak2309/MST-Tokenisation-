import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/AppShell";
import { inr, type Property } from "@/lib/data";
import { useAllProperties } from "@/lib/propertyStore";
import { addActivity } from "@/lib/activity";
import { useAuth } from "@/lib/auth/AuthContext";
import { RoleBadge } from "@/lib/auth/guards";
import {
  chainConfig,
  checkInvestorEligibilityOnChain,
  checkUserRolesOnChain,
  connectWallet,
  explorerTxUrl,
  getInvestorTokenBalanceOnChain,
  getPropertyTokenOnChain,
  getTokenRegistryConfigurationMessage,
  isContractPausedOnChain,
  isTokenLiveConfigured,
  issueUnitsOnChain,
  parseContractError,
  pauseContractOnChain,
  registerPropertyTokenOnChain,
  setInvestorEligibilityOnChain,
  setTransfersEnabledOnChain,
  subscribeToBridgeKeyEvents,
  unpauseContractOnChain,
  type OnChainPropertyTokenInfo,
  type UserRoleStatus,
} from "@/lib/blockchain";

export function TokenisationWorkspace() {
  const { user: authUser, role: appRole } = useAuth();
  const allProperties = useAllProperties();
  const [selectedPid, setSelectedPid] = useState(allProperties[0]?.id ?? "");

  // Wallet and role state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [roles, setRoles] = useState<UserRoleStatus>({
    isAdmin: false,
    isIssuer: false,
    isCompliance: false,
    isPauser: false,
  });
  const [isSelfEligible, setIsSelfEligible] = useState<boolean | null>(null);
  const [userTokenBalance, setUserTokenBalance] = useState<bigint | null>(null);

  // Property token state
  const [tokenInfo, setTokenInfo] = useState<OnChainPropertyTokenInfo | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  // Whitelist manager state
  const [targetInvestor, setTargetInvestor] = useState("");
  const [targetEligibility, setTargetEligibility] = useState<boolean | null>(null);
  const [checkingTarget, setCheckingTarget] = useState(false);
  const [updatingEligibility, setUpdatingEligibility] = useState(false);

  // Registration state
  const [registering, setRegistering] = useState(false);
  const [regMaxSupply, setRegMaxSupply] = useState(10000);
  const [regUnitPrice, setRegUnitPrice] = useState(1000);

  // Issuance state
  const [issueRecipient, setIssueRecipient] = useState("");
  const [issueAmount, setIssueAmount] = useState(100);
  const [recipientEligible, setRecipientEligible] = useState<boolean | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);
  const [issuing, setIssuing] = useState(false);

  // Transfers toggle state
  const [togglingTransfers, setTogglingTransfers] = useState(false);

  // Active transaction state
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const selectedProp = allProperties.find((p) => p.id === selectedPid) ?? allProperties[0];
  const isTokenConfigured = isTokenLiveConfigured();

  // Load on-chain state for selected property
  const reloadOnChainProperty = useCallback(async () => {
    if (!isTokenConfigured || !selectedProp) {
      setTokenInfo(null);
      return;
    }
    setLoadingToken(true);
    try {
      const info = await getPropertyTokenOnChain(selectedProp.id);
      setTokenInfo(info);
      if (walletAddress && info.tokenId > 0n) {
        const bal = await getInvestorTokenBalanceOnChain(walletAddress, info.tokenId);
        setUserTokenBalance(bal);
      } else {
        setUserTokenBalance(0n);
      }
    } catch {
      setTokenInfo(null);
      setUserTokenBalance(null);
    } finally {
      setLoadingToken(false);
    }
  }, [isTokenConfigured, selectedProp, walletAddress]);

  // Load wallet roles & eligibility
  const reloadWalletState = useCallback(
    async (address: string) => {
      if (!isTokenConfigured) return;
      try {
        const [userRoles, eligible] = await Promise.all([
          checkUserRolesOnChain(address),
          checkInvestorEligibilityOnChain(address),
        ]);
        setRoles(userRoles);
        setIsSelfEligible(eligible);
      } catch {
        setRoles({ isAdmin: false, isIssuer: false, isCompliance: false, isPauser: false });
        setIsSelfEligible(null);
      }
    },
    [isTokenConfigured],
  );

  useEffect(() => {
    reloadOnChainProperty();
  }, [reloadOnChainProperty]);

  useEffect(() => {
    if (walletAddress) {
      reloadWalletState(walletAddress);
    }
  }, [walletAddress, reloadWalletState]);

  // Connect wallet
  async function onConnect() {
    setConnecting(true);
    try {
      const res = await connectWallet();
      setWalletAddress(res.address);
      setIssueRecipient(res.address);
      setTargetInvestor(res.address);
      await reloadWalletState(res.address);
      toast.success("BridgeKey connected", {
        description: `Account: ${res.address.slice(0, 6)}…${res.address.slice(-4)}`,
      });

      subscribeToBridgeKeyEvents(res.provider, {
        accountsChanged: (accounts) => {
          const next = accounts[0] ?? null;
          setWalletAddress(next);
          if (next) reloadWalletState(next);
        },
        chainChanged: () => {
          window.location.reload();
        },
        disconnect: () => {
          setWalletAddress(null);
          setRoles({ isAdmin: false, isIssuer: false, isCompliance: false, isPauser: false });
        },
      });
    } catch (err) {
      toast.error("BridgeKey connection failed", {
        description: parseContractError(err),
      });
    } finally {
      setConnecting(false);
    }
  }

  // Check target investor eligibility
  async function onCheckTargetEligibility() {
    if (!targetInvestor.trim()) return;
    setCheckingTarget(true);
    try {
      const el = await checkInvestorEligibilityOnChain(targetInvestor.trim());
      setTargetEligibility(el);
    } catch (err) {
      toast.error("Query failed", { description: parseContractError(err) });
    } finally {
      setCheckingTarget(false);
    }
  }

  // Toggle target investor eligibility (COMPLIANCE_ROLE)
  async function onUpdateTargetEligibility(newStatus: boolean) {
    if (!targetInvestor.trim()) return;
    if (appRole !== "COMPLIANCE_OFFICER" && appRole !== "ADMIN") {
      toast.error("Application permission required", {
        description: "Your platform account must have COMPLIANCE_OFFICER or ADMIN role.",
      });
      return;
    }
    if (!roles.isCompliance) {
      toast.error("On-chain COMPLIANCE_ROLE required", {
        description:
          "The connected wallet does not hold COMPLIANCE_ROLE on PropertyToken. Application roles never override on-chain authorization.",
      });
      return;
    }
    setUpdatingEligibility(true);
    setPendingTxHash(null);
    try {
      const res = await setInvestorEligibilityOnChain(targetInvestor.trim(), newStatus, (hash) =>
        setPendingTxHash(hash),
      );
      setLastTxHash(res.txHash);
      setPendingTxHash(null);
      setTargetEligibility(newStatus);
      if (targetInvestor.toLowerCase() === walletAddress?.toLowerCase()) {
        setIsSelfEligible(newStatus);
      }
      addActivity({
        kind: "Investor Eligibility",
        propertyId: selectedProp?.id,
        detail: `${newStatus ? "Granted" : "Revoked"} eligibility for ${targetInvestor.slice(0, 8)}…`,
        source: "onchain",
        txHash: res.txHash,
      });
      toast.success(
        newStatus ? "Investor marked eligible on-chain" : "Investor eligibility revoked on-chain",
        { description: `Block #${res.blockNumber}` },
      );
    } catch (err) {
      toast.error("Eligibility update failed", {
        description: parseContractError(err),
      });
    } finally {
      setUpdatingEligibility(false);
      setPendingTxHash(null);
    }
  }

  // Check recipient eligibility for issuance
  async function onCheckRecipient() {
    if (!issueRecipient.trim()) return;
    setCheckingRecipient(true);
    try {
      const el = await checkInvestorEligibilityOnChain(issueRecipient.trim());
      setRecipientEligible(el);
    } catch {
      setRecipientEligible(null);
    } finally {
      setCheckingRecipient(false);
    }
  }

  // Register property on PropertyToken (ISSUER_ROLE)
  async function onRegisterProperty() {
    if (!selectedProp) return;
    if (appRole !== "PROPERTY_ISSUER" && appRole !== "ADMIN") {
      toast.error("Application permission required", {
        description:
          "Your platform account must have PROPERTY_ISSUER or ADMIN role to register properties.",
      });
      return;
    }
    if (!roles.isIssuer) {
      toast.error("On-chain ISSUER_ROLE required", {
        description:
          "The connected wallet does not hold ISSUER_ROLE on PropertyToken. Application roles never override on-chain authorization.",
      });
      return;
    }
    setRegistering(true);
    setPendingTxHash(null);
    try {
      const docHash =
        selectedProp.docs[0]?.registeredHash || selectedProp.docs[0]?.sha256 || "0".repeat(64);
      const res = await registerPropertyTokenOnChain(
        selectedProp.id,
        docHash,
        BigInt(regMaxSupply),
        BigInt(regUnitPrice * 100), // convert to paise
        `ipfs://mst/${selectedProp.id}`,
        (hash) => setPendingTxHash(hash),
      );
      setLastTxHash(res.txHash);
      setPendingTxHash(null);
      addActivity({
        kind: "Property Registered",
        propertyId: selectedProp.id,
        detail: `Registered token for ${selectedProp.id} (Max Supply: ${regMaxSupply.toLocaleString()})`,
        source: "onchain",
        txHash: res.txHash,
      });
      toast.success("Property registered on PropertyToken contract", {
        description: `Tx: ${res.txHash.slice(0, 10)}… (Block #${res.blockNumber})`,
      });
      await reloadOnChainProperty();
    } catch (err) {
      toast.error("Registration failed", {
        description: parseContractError(err),
      });
    } finally {
      setRegistering(false);
      setPendingTxHash(null);
    }
  }

  // Issue units (ISSUER_ROLE)
  async function onIssueUnits() {
    if (!tokenInfo || tokenInfo.tokenId === 0n || !issueRecipient.trim()) return;
    if (appRole !== "PROPERTY_ISSUER" && appRole !== "ADMIN") {
      toast.error("Application permission required", {
        description:
          "Your platform account must have PROPERTY_ISSUER or ADMIN role to issue units.",
      });
      return;
    }
    if (!roles.isIssuer) {
      toast.error("On-chain ISSUER_ROLE required", {
        description:
          "The connected wallet does not hold ISSUER_ROLE on PropertyToken. Application roles never override on-chain authorization.",
      });
      return;
    }
    setIssuing(true);
    setPendingTxHash(null);
    try {
      const res = await issueUnitsOnChain(
        tokenInfo.tokenId,
        issueRecipient.trim(),
        BigInt(issueAmount),
        (hash) => setPendingTxHash(hash),
      );
      setLastTxHash(res.txHash);
      setPendingTxHash(null);
      addActivity({
        kind: "Units Issued",
        propertyId: selectedProp?.id,
        detail: `Issued ${issueAmount.toLocaleString()} units of token #${tokenInfo.tokenId.toString()} to ${issueRecipient.slice(0, 8)}…`,
        source: "onchain",
        txHash: res.txHash,
      });
      toast.success("Units issued successfully on-chain", {
        description: `Block #${res.blockNumber}`,
      });
      await reloadOnChainProperty();
    } catch (err) {
      toast.error("Unit issuance failed", {
        description: parseContractError(err),
      });
    } finally {
      setIssuing(false);
      setPendingTxHash(null);
    }
  }

  // Toggle secondary transfers (COMPLIANCE_ROLE)
  async function onToggleTransfers(enabled: boolean) {
    if (!tokenInfo || tokenInfo.tokenId === 0n) return;
    if (appRole !== "COMPLIANCE_OFFICER" && appRole !== "ADMIN") {
      toast.error("Application permission required", {
        description:
          "Your platform account must have COMPLIANCE_OFFICER or ADMIN role to manage transfers.",
      });
      return;
    }
    if (!roles.isCompliance) {
      toast.error("On-chain COMPLIANCE_ROLE required", {
        description:
          "The connected wallet does not hold COMPLIANCE_ROLE on PropertyToken. Application roles never override on-chain authorization.",
      });
      return;
    }
    setTogglingTransfers(true);
    setPendingTxHash(null);
    try {
      const res = await setTransfersEnabledOnChain(tokenInfo.tokenId, enabled, (hash) =>
        setPendingTxHash(hash),
      );
      setLastTxHash(res.txHash);
      setPendingTxHash(null);
      addActivity({
        kind: "Transfers Updated",
        propertyId: selectedProp?.id,
        detail: `${enabled ? "Enabled" : "Disabled"} secondary transfers for token #${tokenInfo.tokenId.toString()}`,
        source: "onchain",
        txHash: res.txHash,
      });
      toast.success(`Transfers ${enabled ? "enabled" : "disabled"} on-chain`, {
        description: `Block #${res.blockNumber}`,
      });
      await reloadOnChainProperty();
    } catch (err) {
      toast.error("Transfer toggle failed", {
        description: parseContractError(err),
      });
    } finally {
      setTogglingTransfers(false);
      setPendingTxHash(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Network & Contract Configuration Status Banner */}
      {!isTokenConfigured ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-xs text-foreground/90 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-warning-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>PropertyToken Contract Not Configured</span>
          </div>
          <p>{getTokenRegistryConfigurationMessage()}</p>
          <div className="flex flex-wrap gap-4 pt-1 font-mono text-[11px] text-muted-foreground">
            <span>Target Network: {chainConfig.networkName ?? "MST"}</span>
            <span>Chain ID: {chainConfig.chainId ?? "—"}</span>
            <span>
              Document Registry:{" "}
              {chainConfig.contractAddress
                ? `${chainConfig.contractAddress.slice(0, 10)}… (Configured)`
                : "Not configured"}
            </span>
            <span>PropertyToken Address: Unset</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-foreground/90 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>PropertyToken Connected ({chainConfig.networkName})</span>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Contract: {chainConfig.tokenContractAddress}
            </p>
          </div>
          {chainConfig.tokenContractAddress && (
            <a
              href={`${chainConfig.explorerUrl?.replace(/\/$/, "")}/address/${chainConfig.tokenContractAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline text-xs"
            >
              <span>View Contract on Explorer</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Transaction in progress notice */}
      {pendingTxHash && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Transaction pending on {chainConfig.networkName ?? "MST"}…</span>
          </div>
          {explorerTxUrl(pendingTxHash) && (
            <a
              href={explorerTxUrl(pendingTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono underline"
            >
              <span>{pendingTxHash.slice(0, 12)}…</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Connected Wallet & Roles Banner */}
      <div className="panel p-5 space-y-4">
        {/* Tier 1: Application Role */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Application Authorization (Tier 1)
              </span>
              <RoleBadge role={appRole} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {authUser ? (
                <span>
                  Logged in as <strong className="text-foreground">{authUser.name}</strong> (
                  {authUser.email})
                </span>
              ) : (
                <span className="text-amber-500 font-medium">
                  Not authenticated with a platform account. Public visitors have read-only preview
                  permissions.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Tier 2: On-Chain Wallet Roles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              On-Chain Cryptographic Access (Tier 2)
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Smart contract permissions read live from PropertyToken on{" "}
              {chainConfig.networkName ?? "MST"}.
            </p>
          </div>
          {!walletAddress ? (
            <Button size="sm" onClick={onConnect} disabled={connecting}>
              {connecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Connect BridgeKey
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => reloadWalletState(walletAddress)}
                title="Refresh roles"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {walletAddress && (
          <div className="pt-2 border-t grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="p-2.5 rounded bg-card border space-y-1">
              <span className="text-muted-foreground text-[11px]">Issuer Role</span>
              <div>
                {roles.isIssuer ? (
                  <Pill tone="primary">ISSUER_ROLE Confirmed</Pill>
                ) : (
                  <Pill tone="neutral">No Issuer Access</Pill>
                )}
              </div>
            </div>

            <div className="p-2.5 rounded bg-card border space-y-1">
              <span className="text-muted-foreground text-[11px]">Compliance Role</span>
              <div>
                {roles.isCompliance ? (
                  <Pill tone="primary">COMPLIANCE_ROLE Confirmed</Pill>
                ) : (
                  <Pill tone="neutral">No Compliance Access</Pill>
                )}
              </div>
            </div>

            <div className="p-2.5 rounded bg-card border space-y-1">
              <span className="text-muted-foreground text-[11px]">Pauser Role</span>
              <div>
                {roles.isPauser ? (
                  <Pill tone="primary">PAUSER_ROLE Confirmed</Pill>
                ) : (
                  <Pill tone="neutral">Not Pauser</Pill>
                )}
              </div>
            </div>

            <div className="p-2.5 rounded bg-card border space-y-1">
              <span className="text-muted-foreground text-[11px]">Investor Eligibility</span>
              <div>
                {isSelfEligible === true ? (
                  <Pill tone="primary">Approved Eligible Investor</Pill>
                ) : isSelfEligible === false ? (
                  <Pill tone="warning">Not Whitelisted</Pill>
                ) : (
                  <Pill tone="neutral">Check Pending</Pill>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Property Token State & Issuance */}
        <div className="space-y-6">
          <section className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                <span>On-Chain Property Token State</span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={reloadOnChainProperty}
                disabled={loadingToken}
                className="h-7 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loadingToken ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div>
              <label className="text-xs font-medium">Select Property</label>
              <select
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                value={selectedPid}
                onChange={(e) => setSelectedPid(e.target.value)}
              >
                {allProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Token details or unregistered banner */}
            {tokenInfo?.exists ? (
              <div className="rounded-lg border bg-card/50 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-primary">
                    Token ID #{tokenInfo.tokenId.toString()}
                  </span>
                  {tokenInfo.transfersEnabled ? (
                    <Pill tone="primary">Transfers Enabled</Pill>
                  ) : (
                    <Pill tone="neutral">Transfers Disabled</Pill>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Maximum Supply</span>
                    <p className="font-semibold text-sm">
                      {tokenInfo.maxSupply.toLocaleString()} units
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Total Issued</span>
                    <p className="font-semibold text-sm">
                      {tokenInfo.totalSupply.toLocaleString()} units
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Remaining Cap</span>
                    <p className="font-semibold text-sm text-primary">
                      {tokenInfo.remainingSupply.toLocaleString()} units
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">
                      Your On-Chain Holdings
                    </span>
                    <p className="font-semibold text-sm">
                      {userTokenBalance !== null
                        ? `${userTokenBalance.toLocaleString()} units`
                        : "Connect wallet"}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t font-mono text-[11px] text-muted-foreground break-all space-y-1">
                  <p>Document Hash: {tokenInfo.documentHash}</p>
                  <p>Property Ref: {tokenInfo.propertyRef}</p>
                </div>

                {/* Transfer toggle control for Compliance role */}
                {(appRole === "COMPLIANCE_OFFICER" || appRole === "ADMIN") &&
                  roles.isCompliance && (
                    <div className="pt-2 flex items-center justify-between border-t">
                      <span className="text-muted-foreground">Compliance Action:</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => onToggleTransfers(!tokenInfo.transfersEnabled)}
                        disabled={togglingTransfers}
                      >
                        {togglingTransfers ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : null}
                        {tokenInfo.transfersEnabled ? "Disable Transfers" : "Enable Transfers"}
                      </Button>
                    </div>
                  )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-xs space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>This property is not yet registered on the PropertyToken contract.</span>
                </div>

                {(appRole === "PROPERTY_ISSUER" || appRole === "ADMIN") &&
                roles.isIssuer &&
                isTokenConfigured ? (
                  <div className="pt-2 border-t space-y-3">
                    <p className="font-medium">Register as Issuer (ISSUER_ROLE):</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Max Supply</label>
                        <input
                          type="number"
                          className="w-full rounded border bg-card px-2 py-1 text-xs"
                          value={regMaxSupply}
                          onChange={(e) => setRegMaxSupply(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Unit Price (₹)</label>
                        <input
                          type="number"
                          className="w-full rounded border bg-card px-2 py-1 text-xs"
                          value={regUnitPrice}
                          onChange={(e) => setRegUnitPrice(Math.max(1, Number(e.target.value)))}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={onRegisterProperty}
                      disabled={registering}
                      className="w-full text-xs"
                    >
                      {registering ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Register Property on PropertyToken
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-[11px]">
                    Registration requires an authorized account holding ISSUER_ROLE and an active
                    PropertyToken contract.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Unit Issuance Panel: Visible to authorized PROPERTY_ISSUER and ADMIN */}
          {appRole === "PROPERTY_ISSUER" || appRole === "ADMIN" ? (
            <section className="panel p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Coins className="h-4 w-4" />
                <span>Issue Fractional Units (Authorized Issuance)</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Mints new fractional units directly to an approved eligible investor. Enforces
                supply cap and investor whitelist.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-medium">Recipient Investor Address</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="0x…"
                      className="flex-1 rounded border bg-card px-3 py-1.5 text-xs font-mono"
                      value={issueRecipient}
                      onChange={(e) => {
                        setIssueRecipient(e.target.value);
                        setRecipientEligible(null);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={onCheckRecipient}
                      disabled={checkingRecipient || !issueRecipient.trim()}
                    >
                      {checkingRecipient ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                    </Button>
                  </div>
                  {recipientEligible === true && (
                    <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Recipient is an approved eligible
                      investor.
                    </p>
                  )}
                  {recipientEligible === false && (
                    <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Recipient is NOT an eligible investor
                      on-chain. Issuance will revert.
                    </p>
                  )}
                </div>

                <div>
                  <label className="font-medium">Units to Issue</label>
                  <input
                    type="number"
                    min={1}
                    max={Number(tokenInfo?.remainingSupply ?? 10000)}
                    className="w-full mt-1 rounded border bg-card px-3 py-1.5 text-xs"
                    value={issueAmount}
                    onChange={(e) => setIssueAmount(Math.max(1, Number(e.target.value)))}
                  />
                  {tokenInfo && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Remaining supply available: {tokenInfo.remainingSupply.toLocaleString()} units
                    </p>
                  )}
                </div>

                <Button
                  size="sm"
                  className="w-full mt-2"
                  onClick={onIssueUnits}
                  disabled={
                    issuing ||
                    !isTokenConfigured ||
                    !roles.isIssuer ||
                    !tokenInfo?.exists ||
                    recipientEligible === false
                  }
                >
                  {issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {!roles.isIssuer
                    ? "Requires ISSUER_ROLE to Mint"
                    : !tokenInfo?.exists
                      ? "Property Not Registered"
                      : `Mint ${issueAmount.toLocaleString()} Units to Recipient`}
                </Button>
              </div>
            </section>
          ) : (
            <section className="panel p-5 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Coins className="h-4 w-4" />
                <span>Fractional Unit Allocation & Holdings</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Fractional property units are issued by authorized Property Issuers holding
                ISSUER_ROLE upon property verification and investor KYC whitelisting.
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                <span className="font-medium text-foreground">Your Holdings:</span>
                <p className="text-muted-foreground">
                  Your current balance for this token:{" "}
                  <strong className="text-primary">
                    {userTokenBalance !== null
                      ? `${userTokenBalance.toLocaleString()} units`
                      : "Connect wallet"}
                  </strong>
                  .
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Investor Whitelist Management (COMPLIANCE_ROLE) & Info */}
        <div className="space-y-6">
          <section className="panel p-5 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Investor Eligibility & Whitelist (Compliance Office)</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Under SEBI / regulatory frameworks, fractional units may only be issued to or held by
              KYC-verified eligible investors.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium">Investor Wallet Address</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    placeholder="0x…"
                    className="flex-1 rounded border bg-card px-3 py-1.5 text-xs font-mono"
                    value={targetInvestor}
                    onChange={(e) => {
                      setTargetInvestor(e.target.value);
                      setTargetEligibility(null);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onCheckTargetEligibility}
                    disabled={checkingTarget || !targetInvestor.trim()}
                  >
                    {checkingTarget ? <Loader2 className="h-3 w-3 animate-spin" /> : "Check"}
                  </Button>
                </div>
              </div>

              {targetEligibility !== null && (
                <div className="p-3 rounded bg-card border flex items-center justify-between">
                  <span className="text-muted-foreground">Current Status:</span>
                  {targetEligibility ? (
                    <Pill tone="primary">Approved Eligible Investor</Pill>
                  ) : (
                    <Pill tone="warning">Not Whitelisted</Pill>
                  )}
                </div>
              )}

              {/* Compliance action buttons: Only visible to COMPLIANCE_OFFICER and ADMIN */}
              {appRole === "COMPLIANCE_OFFICER" || appRole === "ADMIN" ? (
                roles.isCompliance ? (
                  <div className="pt-2 border-t flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => onUpdateTargetEligibility(true)}
                      disabled={
                        updatingEligibility || !targetInvestor.trim() || targetEligibility === true
                      }
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      Approve Investor
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => onUpdateTargetEligibility(false)}
                      disabled={
                        updatingEligibility || !targetInvestor.trim() || targetEligibility === false
                      }
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" />
                      Revoke Eligibility
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-destructive pt-1">
                    Connected wallet lacks COMPLIANCE_ROLE on PropertyToken. Application roles never
                    override on-chain permissions.
                  </p>
                )
              ) : (
                <p className="text-[11px] text-muted-foreground pt-1 italic">
                  Investor eligibility management is restricted to Compliance Officers holding
                  COMPLIANCE_ROLE.
                </p>
              )}
            </div>
          </section>

          {/* Tokenisation Architecture & Rules Information */}
          <section className="panel p-5 space-y-3 text-xs">
            <h4 className="font-semibold text-sm">Tokenisation Lifecycle Reference</h4>
            <ol className="list-decimal pl-4 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Document Due Diligence:</strong> Title deed, tax
                receipts, and municipal approvals are hashed and registered on-chain in
                PropertyDocumentRegistry.
              </li>
              <li>
                <strong className="text-foreground">Property Token Registration:</strong> The issuer
                calls <code>registerProperty</code> with the verified document fingerprint to
                allocate a unique ERC-1155 token ID and fix the maximum supply cap.
              </li>
              <li>
                <strong className="text-foreground">Compliance Verification:</strong> The compliance
                officer verifies investor identity and calls <code>setInvestorEligibility</code> to
                whitelist their Ethereum address.
              </li>
              <li>
                <strong className="text-foreground">Primary Issuance:</strong> The issuer mints
                units directly to whitelisted investors up to the supply cap.
              </li>
              <li>
                <strong className="text-foreground">Controlled Secondary Transfers:</strong>{" "}
                Secondary trading remains disabled by default until compliance enables transfers.
                Both parties must remain eligible investors.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
