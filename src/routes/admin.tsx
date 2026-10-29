import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute, RoleBadge } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { APP_ROLES, type AppRole, type AuditLogEntry, type User } from "@/lib/auth/types";
import { clientGetAllUsers, clientGetAuditLogs } from "@/lib/auth/clientAuth";
import {
  chainConfig,
  connectWallet,
  explorerTxUrl,
  grantRoleOnChain,
  hasRoleOnChain,
  parseContractError,
  ROLES,
  subscribeToBridgeKeyEvents,
  TESTNET_ADMIN_ACCOUNT,
  walletErrorMessage,
} from "@/lib/blockchain";
import { useNetwork } from "@/contractConfig";
import { requireAuthLoader } from "@/lib/auth/routeAuth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location, requiredRole: "ADMIN" });
  },
  component: AdminPageWithGuard,
});

function AdminPageWithGuard() {
  return (
    <ProtectedRoute requiredRole="ADMIN">
      <AdminPageContent />
    </ProtectedRoute>
  );
}

function AdminPageContent() {
  const { assignRole, user: currentAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"users" | "audit" | "system">("users");

  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const loadData = async () => {
    setLoading(true);
    try {
      const [uList, lList] = await Promise.all([clientGetAllUsers(), clientGetAuditLogs()]);
      setUsers(uList);
      setAuditLogs(lList);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRoleChange = async (targetUserId: string, newRole: AppRole) => {
    setUpdatingUserId(targetUserId);
    try {
      await assignRole(targetUserId, newRole);
      toast.success(`Role updated successfully to ${newRole}`);
      startTransition(() => {
        loadData();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role.");
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Platform Administration Console"
          subtitle="Manage user permissions, review cryptographic audit trails, and oversee system deployment status."
        />
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </Button>
      </div>

      {/* Temporary Testnet Admin Action: Grant On-Chain COMPLIANCE_ROLE */}
      <TemporaryComplianceRoleGrantAction />

      {/* Tabs */}
      <div className="flex border-b gap-2 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "users"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>User Management & Roles ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "audit"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Security Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "system"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>System & Chain Architecture</span>
        </button>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Security Callout: Tier 1 vs Tier 2 Role Separation */}
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
            <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                Tier 1 (Application) vs. Tier 2 (On-Chain) Security Architecture
              </p>
              <p className="text-[11px] leading-relaxed">
                Role modifications here govern application navigation, portal views, and off-chain
                access (Tier 1). Changing an application role does <strong>not</strong> silently
                grant or revoke on-chain smart contract permissions (
                <code className="text-foreground">DEFAULT_ADMIN_ROLE</code>,{" "}
                <code className="text-foreground">ISSUER_ROLE</code>,{" "}
                <code className="text-foreground">COMPLIANCE_ROLE</code>,{" "}
                <code className="text-foreground">PAUSER_ROLE</code>). On-chain roles require
                separate cryptographic transactions signed by the contract administrator using
                BridgeKey on MST Testnet.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-4 border-b bg-muted/20">
              <h3 className="font-semibold text-foreground text-sm">
                Registered Platform Participants
              </h3>
              <p className="text-xs text-muted-foreground">
                Role modifications require server-side administrator authorization, prevent
                self-demotion or removing the last administrator, and are permanently recorded in
                the security audit trail.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/10 text-muted-foreground text-left">
                    <th className="p-3 font-medium">Participant</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Current Role</th>
                    <th className="p-3 font-medium">Linked Wallet</th>
                    <th className="p-3 font-medium">Registered</th>
                    <th className="p-3 font-medium text-right">Assign New Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => {
                    const isSelf = currentAdmin?.id === u.id;
                    const isUpdating = updatingUserId === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{u.name}</span>
                            {isSelf && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{u.id}</p>
                        </td>
                        <td className="p-3 font-mono">{u.email}</td>
                        <td className="p-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {u.linkedWalletAddress ? (
                            <span className="text-foreground">
                              {u.linkedWalletAddress.slice(0, 6)}...
                              {u.linkedWalletAddress.slice(-4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">None linked</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin ml-auto text-primary" />
                          ) : (
                            <select
                              aria-label={`Assign role for ${u.name}`}
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as AppRole)}
                              disabled={isSelf && u.role === "ADMIN"}
                              title={
                                isSelf && u.role === "ADMIN"
                                  ? "Self-demotion prevented: Another administrator must change your role"
                                  : `Assign role for ${u.name}`
                              }
                              className="rounded border border-input bg-background px-2 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {APP_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT TRAIL */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-4 border-b bg-muted/20">
              <h3 className="font-semibold text-foreground text-sm">Security Audit Trail</h3>
              <p className="text-xs text-muted-foreground">
                Immutable chronological log of authentication events, role escalations, unauthorized
                attempts, and administrative updates.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/10 text-muted-foreground text-left">
                    <th className="p-3 font-medium">Timestamp</th>
                    <th className="p-3 font-medium">Action</th>
                    <th className="p-3 font-medium">Actor</th>
                    <th className="p-3 font-medium">Target Participant</th>
                    <th className="p-3 font-medium">Event Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[11px]">
                  {auditLogs.map((log) => {
                    const isViolation = log.action === "UNAUTHORIZED_ATTEMPT";
                    return (
                      <tr
                        key={log.id}
                        className={`transition-colors ${
                          isViolation ? "bg-destructive/10 text-destructive" : "hover:bg-muted/10"
                        }`}
                      >
                        <td className="p-3 text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isViolation
                                ? "bg-destructive text-destructive-foreground"
                                : log.action === "ROLE_ASSIGNED"
                                  ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isViolation && <ShieldAlert className="h-3 w-3" />}
                            {log.action}
                          </span>
                        </td>
                        <td className="p-3 font-medium">{log.actorEmail}</td>
                        <td className="p-3">{log.targetUserEmail ?? "—"}</td>
                        <td className="p-3 font-sans text-xs">{JSON.stringify(log.details)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM ARCHITECTURE & BLOCKCHAIN STATUS */}
      {activeTab === "system" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span>Two-Tier Security Architecture</span>
            </h3>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="font-semibold text-foreground">Tier 1: Application RBAC</p>
                <p>
                  Governs access to platform dashboards, off-chain draft records, user management,
                  and compliance reviews. Strictly enforced by server session tokens.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="font-semibold text-foreground">
                  Tier 2: On-Chain Smart Contract AccessControl
                </p>
                <p>
                  Governs real blockchain state transitions (`PropertyDocumentRegistry` and
                  `PropertyToken`). Real transactions require cryptographic signatures from
                  authorized addresses holding `ISSUER_ROLE`, `COMPLIANCE_ROLE`, or `PAUSER_ROLE`.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Current MST Blockchain Configuration</span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Target Network:</span>
                <span className="font-semibold text-foreground">
                  {chainConfig.networkName ?? "MST Testnet"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Chain ID:</span>
                <span className="font-mono text-foreground">
                  {chainConfig.chainId ?? "91562037"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Document Registry:</span>
                <span className="font-mono text-[11px] text-foreground">
                  {chainConfig.contractAddress ?? "0x6883929b0A46dC2f301D294719954313b979dc14"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">PropertyToken Status:</span>
                <span className="font-mono text-[11px] text-foreground">
                  {chainConfig.tokenContractAddress
                    ? chainConfig.tokenContractAddress
                    : "Not configured (Pre-deployment ready)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemporaryComplianceRoleGrantAction() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [checkingRoles, setCheckingRoles] = useState(false);
  const [signerHasAdmin, setSignerHasAdmin] = useState<boolean | null>(null);
  const [recipientHasCompliance, setRecipientHasCompliance] = useState<boolean | null>(null);
  const [granting, setGranting] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);
  const [verifiedOnChain, setVerifiedOnChain] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { isTestnet, config } = useNetwork();
  const contractAddress =
    config.tokenContractAddress || "0x681Ef61D12372e040EE5f6e058932818aA29407F";
  const expectedAdmin = TESTNET_ADMIN_ACCOUNT;

  const refreshRecipientStatus = useCallback(async () => {
    if (!isTestnet) return;
    try {
      const hasCompliance = await hasRoleOnChain(ROLES.COMPLIANCE_ROLE, expectedAdmin);
      setRecipientHasCompliance(hasCompliance);
      if (hasCompliance) {
        setVerifiedOnChain(true);
      }
    } catch {
      // Ignored if offline
    }
  }, [isTestnet, expectedAdmin]);

  const verifySignerRole = useCallback(
    async (address: string) => {
      setCheckingRoles(true);
      try {
        const hasAdmin = await hasRoleOnChain(ROLES.DEFAULT_ADMIN_ROLE, address);
        setSignerHasAdmin(hasAdmin);
        const hasCompliance = await hasRoleOnChain(ROLES.COMPLIANCE_ROLE, expectedAdmin);
        setRecipientHasCompliance(hasCompliance);
      } catch {
        setSignerHasAdmin(false);
      } finally {
        setCheckingRoles(false);
      }
    },
    [expectedAdmin],
  );

  useEffect(() => {
    refreshRecipientStatus();
  }, [refreshRecipientStatus]);

  const handleConnectWallet = async () => {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const conn = await connectWallet();
      setWalletAddress(conn.address);
      setWalletChainId(conn.chainId);
      subscribeToBridgeKeyEvents(conn.provider, {
        accountsChanged: (accs) => {
          const next = accs[0] ?? null;
          setWalletAddress(next);
          if (next) verifySignerRole(next);
          else setSignerHasAdmin(null);
        },
        chainChanged: (chain) => {
          try {
            setWalletChainId(BigInt(chain).toString());
          } catch {
            setWalletChainId(chain);
          }
        },
        disconnect: () => {
          setWalletAddress(null);
          setWalletChainId(null);
          setSignerHasAdmin(null);
        },
      });
      await verifySignerRole(conn.address);
      toast.success("BridgeKey connected", {
        description: `Connected: ${conn.address.slice(0, 6)}...${conn.address.slice(-4)}`,
      });
    } catch (err) {
      const msg = walletErrorMessage(err);
      setErrorMsg(msg);
      toast.error("BridgeKey connection failed", { description: msg });
    } finally {
      setConnecting(false);
    }
  };

  const isSignerAccount1 = Boolean(
    walletAddress && walletAddress.toLowerCase() === expectedAdmin.toLowerCase(),
  );
  const isWalletOnTestnet = walletChainId === "91562037";
  const canGrant =
    isTestnet &&
    isWalletOnTestnet &&
    isSignerAccount1 &&
    signerHasAdmin === true &&
    !recipientHasCompliance &&
    !granting;

  const handleGrantRole = async () => {
    if (!canGrant) return;
    setGranting(true);
    setErrorMsg(null);
    setConfirmedTxHash(null);
    setVerifiedOnChain(null);

    try {
      const result = await grantRoleOnChain(ROLES.COMPLIANCE_ROLE, expectedAdmin, (txHash) =>
        setPendingTxHash(txHash),
      );
      setConfirmedTxHash(result.txHash);
      setPendingTxHash(null);

      const isNowCompliance = await hasRoleOnChain(ROLES.COMPLIANCE_ROLE, expectedAdmin);
      setVerifiedOnChain(isNowCompliance);
      setRecipientHasCompliance(isNowCompliance);

      toast.success("COMPLIANCE_ROLE granted on MST Testnet!", {
        description: `Tx: ${result.txHash.slice(0, 10)}... | hasRole verified on-chain.`,
      });
    } catch (err) {
      const msg = parseContractError(err);
      setErrorMsg(msg);
      toast.error("Grant role failed", { description: msg });
    } finally {
      setGranting(false);
      setPendingTxHash(null);
    }
  };

  return (
    <div className="rounded-xl border-2 border-amber-500/40 bg-card p-5 space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground text-sm">Grant On-Chain Compliance Role</h3>
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Temporary Testnet Admin Action
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allows the verified MST Testnet contract administrator to invoke{" "}
              <code className="text-foreground">grantRole(COMPLIANCE_ROLE, Account 1)</code> via
              BridgeKey.
            </p>
          </div>
        </div>

        {!walletAddress ? (
          <Button
            size="sm"
            onClick={handleConnectWallet}
            disabled={connecting || !isTestnet}
            className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
            <span>Connect BridgeKey</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Connected Signer:</span>
            <code className="font-mono bg-muted px-2 py-0.5 rounded text-[11px] text-foreground">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </code>
          </div>
        )}
      </div>

      {/* Network restriction banner */}
      {!isTestnet && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            This action is strictly restricted to <strong>MST Testnet (Chain ID 91562037)</strong>.
            Switch network to Testnet to enable.
          </span>
        </div>
      )}

      {/* Pre-flight Checks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Network
          </span>
          <div className="flex items-center gap-1.5 font-medium">
            {isTestnet ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
            <span className="truncate">
              {chainConfig.networkName} ({chainConfig.chainId})
            </span>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            BridgeKey Network
          </span>
          <div className="flex items-center gap-1.5 font-medium">
            {!walletChainId ? (
              <span className="text-muted-foreground italic">Wallet not connected</span>
            ) : isWalletOnTestnet ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span>Testnet (91562037)</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-destructive truncate">Wrong Chain ({walletChainId})</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Signer Identity
          </span>
          <div className="flex items-center gap-1.5 font-medium">
            {!walletAddress ? (
              <span className="text-muted-foreground italic">Connect wallet</span>
            ) : isSignerAccount1 ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-success font-semibold">Account 1 (Admin)</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-destructive truncate">Not Account 1</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Signer Admin Role
          </span>
          <div className="flex items-center gap-1.5 font-medium">
            {checkingRoles ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : !walletAddress ? (
              <span className="text-muted-foreground italic">—</span>
            ) : signerHasAdmin === true ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-success font-semibold">DEFAULT_ADMIN_ROLE</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="text-destructive">Not Role Admin</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Summary Box */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
        <div className="font-semibold text-foreground flex items-center justify-between">
          <span>Transaction Confirmation Summary</span>
          <span className="font-mono text-[10px] text-muted-foreground">Value: 0 MST</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div>
            <span className="text-muted-foreground">Target Contract: </span>
            <a
              href={`https://testnet.mstscan.com/address/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline inline-flex items-center gap-1"
            >
              <span>
                {contractAddress.slice(0, 10)}...{contractAddress.slice(-8)}
              </span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div>
            <span className="text-muted-foreground">Target Network: </span>
            <span className="font-mono text-foreground">MST Testnet (Chain ID 91562037)</span>
          </div>
          <div>
            <span className="text-muted-foreground">Admin Signer (From): </span>
            <span className="font-mono text-foreground">{expectedAdmin}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Recipient (Account 1): </span>
            <span className="font-mono text-foreground">{expectedAdmin}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Role Hash: </span>
            <span className="font-mono text-[10px] text-foreground break-all">
              {ROLES.COMPLIANCE_ROLE} (COMPLIANCE_ROLE)
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted-foreground">Action: </span>
            <code className="text-foreground font-semibold">
              grantRole(COMPLIANCE_ROLE, Account1)
            </code>
          </div>
        </div>
      </div>

      {/* Status Banners */}
      {recipientHasCompliance && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold text-success">Account 1 Already Holds COMPLIANCE_ROLE</p>
            <p className="text-[11px] opacity-90">
              Verified on-chain via <code className="text-foreground">hasRole</code> on contract{" "}
              <code className="text-foreground">{contractAddress.slice(0, 8)}...</code>. No further
              action needed.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {pendingTxHash && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Transaction Submitted - Awaiting Block Confirmation</p>
            <p className="font-mono text-[11px] break-all">Tx Hash: {pendingTxHash}</p>
          </div>
        </div>
      )}

      {confirmedTxHash && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-foreground space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span>Transaction Confirmed Successfully!</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Transaction Hash:</span>
            <a
              href={
                explorerTxUrl(confirmedTxHash) ||
                `https://testnet.mstscan.com/tx/${confirmedTxHash}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline inline-flex items-center gap-1 break-all"
            >
              <span>{confirmedTxHash}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          {verifiedOnChain !== null && (
            <div className="text-[11px]">
              <span className="text-muted-foreground">On-Chain Verification: </span>
              <span className="font-semibold text-success">
                {verifiedOnChain
                  ? "hasRole(COMPLIANCE_ROLE, Account1) === true"
                  : "Pending verification"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grant Action Button */}
      {!recipientHasCompliance && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-muted-foreground">
            Clicking below will invoke BridgeKey to request your wallet signature. The transaction
            will never be broadcast automatically.
          </p>
          <Button
            onClick={handleGrantRole}
            disabled={!canGrant}
            className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {granting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Waiting for BridgeKey...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Grant On-Chain Compliance Role</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
