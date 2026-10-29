import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Pill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute, RoleBadge } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { addActivity } from "@/lib/activity";
import {
  chainConfig,
  checkUserRolesOnChain,
  explorerTxUrl,
  isContractPausedOnChain,
  isTokenLiveConfigured,
  parseContractError,
  pauseContractOnChain,
  unpauseContractOnChain,
  type UserRoleStatus,
} from "@/lib/blockchain";
import { requireAuthLoader } from "@/lib/auth/routeAuth";

export const Route = createFileRoute("/pause")({
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({
      location,
      requiredRole: ["EMERGENCY_PAUSER", "ADMIN"],
    });
  },
  component: PauseRouteWithGuard,
});

function PauseRouteWithGuard() {
  return (
    <ProtectedRoute requiredRole={["EMERGENCY_PAUSER", "ADMIN"]}>
      <EmergencyPausePage />
    </ProtectedRoute>
  );
}

function EmergencyPausePage() {
  const { user, role } = useAuth();
  const { account, isConnected } = useWallet();

  const [contractPaused, setContractPaused] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [roles, setRoles] = useState<UserRoleStatus>({
    isAdmin: false,
    isIssuer: false,
    isCompliance: false,
    isPauser: false,
  });

  const isConfigured = isTokenLiveConfigured();

  const loadStatus = useCallback(async () => {
    if (!isConfigured) return;
    setCheckingStatus(true);
    try {
      const p = await isContractPausedOnChain();
      setContractPaused(p);
    } catch {
      setContractPaused(null);
    } finally {
      setCheckingStatus(false);
    }
  }, [isConfigured]);

  const loadRoles = useCallback(
    async (addr: string) => {
      if (!isConfigured) return;
      try {
        const r = await checkUserRolesOnChain(addr);
        setRoles(r);
      } catch {
        setRoles({ isAdmin: false, isIssuer: false, isCompliance: false, isPauser: false });
      }
    },
    [isConfigured],
  );

  useEffect(() => {
    loadStatus();
    if (account) {
      loadRoles(account);
    }
  }, [loadStatus, loadRoles, account]);

  const handleTogglePause = async (shouldPause: boolean) => {
    if (role !== "EMERGENCY_PAUSER" && role !== "ADMIN") {
      toast.error(
        "Application permission denied: Only Emergency Pausers or Admins can pause/unpause contracts.",
      );
      return;
    }

    if (!roles.isPauser) {
      toast.error("On-chain PAUSER_ROLE required", {
        description:
          "Your connected wallet does not hold PAUSER_ROLE on the PropertyToken contract. Application roles cannot bypass on-chain authorization.",
      });
      return;
    }

    setPausing(true);
    setPendingTxHash(null);
    try {
      const res = shouldPause
        ? await pauseContractOnChain((hash) => setPendingTxHash(hash))
        : await unpauseContractOnChain((hash) => setPendingTxHash(hash));

      setPendingTxHash(null);
      setContractPaused(shouldPause);

      addActivity({
        kind: shouldPause ? "Contract Paused" : "Contract Unpaused",
        detail: `Circuit breaker ${shouldPause ? "PAUSED" : "UNPAUSED"} PropertyToken contract`,
        source: "onchain",
        txHash: res.txHash,
        explorerUrl: explorerTxUrl(res.txHash),
      });

      toast.success(
        `PropertyToken successfully ${shouldPause ? "PAUSED" : "UNPAUSED"} on MST Testnet`,
        { description: `Block #${res.blockNumber}` },
      );
    } catch (err) {
      toast.error(`Emergency action failed`, {
        description: parseContractError(err),
      });
    } finally {
      setPausing(false);
      setPendingTxHash(null);
      loadStatus();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Emergency Pause Controls"
        subtitle="Scoped circuit breaker to pause or unpause token operations during critical security events."
      >
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={checkingStatus}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${checkingStatus ? "animate-spin" : ""}`} />
          Refresh On-Chain State
        </Button>
      </PageHeader>

      {/* Pending TX banner */}
      {pendingTxHash && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs text-primary flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Emergency transaction pending on MST Testnet…</span>
          </div>
          {explorerTxUrl(pendingTxHash) && (
            <a
              href={explorerTxUrl(pendingTxHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono underline"
            >
              <span>{pendingTxHash.slice(0, 10)}…</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {/* Contract & Role State Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Identity & Authorization
              </span>
              <RoleBadge role={role} />
            </div>
            <p className="text-sm font-semibold text-foreground mt-0.5">{user?.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{user?.email}</p>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Contract Circuit Breaker
            </span>
            <div className="mt-1">
              {contractPaused === true ? (
                <Pill tone="destructive">🔴 CONTRACT PAUSED</Pill>
              ) : contractPaused === false ? (
                <Pill tone="success">🟢 CONTRACT ACTIVE & OPERATIONAL</Pill>
              ) : (
                <Pill tone="neutral">Loading on-chain status…</Pill>
              )}
            </div>
          </div>
        </div>

        {/* Two-tier access checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" />
              <span>Tier 1: Application Permission</span>
            </span>
            <p className="text-[11px] text-muted-foreground">
              {role === "EMERGENCY_PAUSER" || role === "ADMIN" ? (
                <span className="text-success font-semibold">
                  ✓ Authorized platform role: {role}
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  ✗ Role {role ?? "NONE"} unauthorized for pause controls
                </span>
              )}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-primary" />
              <span>Tier 2: On-Chain PAUSER_ROLE</span>
            </span>
            <p className="text-[11px] text-muted-foreground">
              {!isConnected || !account ? (
                <span className="text-amber-500 font-medium">
                  Connect BridgeKey wallet to check on-chain role
                </span>
              ) : roles.isPauser ? (
                <span className="text-success font-semibold">
                  ✓ Wallet ({account.slice(0, 6)}...{account.slice(-4)}) holds PAUSER_ROLE
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  ✗ Connected wallet lacks PAUSER_ROLE on-chain
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">Operational Circuit Breaker</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pausing halts all PropertyToken transfers and unit minting operations across the
                entire platform. Existing token balances and document verification registries remain
                unaffected and inspectable.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="destructive"
              disabled={
                pausing ||
                contractPaused === true ||
                !roles.isPauser ||
                (role !== "EMERGENCY_PAUSER" && role !== "ADMIN")
              }
              onClick={() => handleTogglePause(true)}
              className="gap-2"
            >
              {pausing && contractPaused === false ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PauseCircle className="h-4 w-4" />
              )}
              <span>Execute Emergency Pause</span>
            </Button>

            <Button
              variant="outline"
              disabled={
                pausing ||
                contractPaused === false ||
                !roles.isPauser ||
                (role !== "EMERGENCY_PAUSER" && role !== "ADMIN")
              }
              onClick={() => handleTogglePause(false)}
              className="gap-2 text-primary hover:bg-[#C9B8E8]/20 font-semibold"
            >
              {pausing && contractPaused === true ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              <span>Resume Operations (Unpause)</span>
            </Button>

            <Link to="/activity">
              <Button variant="ghost" className="gap-2 text-xs">
                <History className="h-4 w-4" />
                <span>View Blockchain Activity</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
