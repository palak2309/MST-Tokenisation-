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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Pill } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute, RoleBadge } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { useAllProperties } from "@/lib/propertyStore";
import { chainConfig, isTokenLiveConfigured } from "@/lib/blockchain";
import { inr } from "@/lib/data";
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

function DashboardPageContent() {
  const { user, role, linkWallet } = useAuth();
  const { account, isConnected } = useWallet();
  const allProperties = useAllProperties();
  const [linking, setLinking] = useState(false);

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
              {allProperties.slice(0, 3).map((prop) => (
                <div
                  key={prop.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground">
                      {prop.id}
                    </span>
                    <h3 className="font-semibold text-foreground text-sm mt-1">{prop.name}</h3>
                    <p className="text-xs text-muted-foreground">{prop.location}</p>
                    <p className="text-xs font-semibold text-primary mt-2">
                      Pool: {inr(prop.poolSize)}
                    </p>
                  </div>
                  <div className="pt-3 border-t flex gap-2">
                    <Link to="/invest" className="w-full">
                      <Button size="sm" variant="outline" className="w-full text-xs">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/invest">
                <Button className="gap-2">
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
    </div>
  );
}
