import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute, RoleBadge } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { APP_ROLES, type AppRole, type AuditLogEntry, type User } from "@/lib/auth/types";
import { clientGetAllUsers, clientGetAuditLogs } from "@/lib/auth/clientAuth";
import { chainConfig } from "@/lib/blockchain";
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
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
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
