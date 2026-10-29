import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthContext";
import { RoleBadge } from "@/lib/auth/guards";
import type { AppRole } from "@/lib/auth/types";
import { redirectIfAuthenticatedLoader } from "@/lib/auth/routeAuth";

interface LoginSearch {
  redirect?: string | undefined;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const r = search["redirect"];
    return {
      redirect: typeof r === "string" ? r : undefined,
    };
  },
  beforeLoad: async ({ search }) => {
    await redirectIfAuthenticatedLoader({ redirectTarget: search.redirect });
  },
  component: LoginPage,
});

const DEMO_PRESETS: Array<{
  role: AppRole;
  label: string;
  email: string;
  pass: string;
  description: string;
}> = [
  {
    role: "ADMIN",
    label: "Admin",
    email: "admin@tokenestate.mst",
    pass: "MSTAdmin2026!",
    description: "Full user management & contract controls",
  },
  {
    role: "PROPERTY_ISSUER",
    label: "Issuer",
    email: "issuer@tokenestate.mst",
    pass: "MSTIssuer2026!",
    description: "Property onboarding & token issuance",
  },
  {
    role: "COMPLIANCE_OFFICER",
    label: "Compliance",
    email: "compliance@tokenestate.mst",
    pass: "MSTCompliance2026!",
    description: "Investor KYC whitelisting & approvals",
  },
  {
    role: "INVESTOR",
    label: "Investor",
    email: "investor@tokenestate.mst",
    pass: "MSTInvestor2026!",
    description: "Portfolio views & fractional token purchases",
  },
  {
    role: "EMERGENCY_PAUSER",
    label: "Pauser",
    email: "pauser@tokenestate.mst",
    pass: "MSTPauser2026!",
    description: "Circuit breaker to pause/unpause tokens",
  },
];

function LoginPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const { login, user, isAuthenticated, logout } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const loggedIn = await login(email, password);
      toast.success(`Welcome back, ${loggedIn.name}!`);
      const destination =
        search.redirect && search.redirect !== "/login" && search.redirect !== "/signup"
          ? search.redirect
          : "/dashboard";
      router.navigate({ to: destination });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPreset = (preset: (typeof DEMO_PRESETS)[0]) => {
    setEmail(preset.email);
    setPassword(preset.pass);
    setErrorMsg(null);
  };

  if (isAuthenticated && user) {
    return (
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F799B3] text-[#202938] font-bold shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            MST TokenEstate
          </h1>
          <p className="text-xs text-muted-foreground">Active Session Detected</p>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">You are signed in</p>
                <p className="text-xs text-muted-foreground">
                  {user.name} ({user.email})
                </p>
              </div>
            </div>
            <RoleBadge role={user.role} />
          </div>
          <div className="flex gap-2.5 pt-2">
            <Link to="/dashboard" className="flex-1">
              <Button className="w-full">Open Dashboard</Button>
            </Link>
            <Button variant="outline" onClick={() => logout()}>
              Log Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Centered MST TokenEstate Branding */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F799B3] text-[#202938] font-bold shadow-sm mb-1 ring-2 ring-[#F799B3]/40">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          MST TokenEstate
        </h1>
        <p className="text-xs text-muted-foreground font-medium">
          Verify Before You Invest · Institutional Real-Estate Tokenisation
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-card space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Sign In</h2>
          <p className="text-xs text-muted-foreground">
            Enter your credentials to access your authorized role hub.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email" className="text-xs font-semibold">
              Email Address
            </Label>
            <div className="relative">
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.com"
                required
                autoComplete="email"
                className="pl-9 text-sm"
              />
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password" className="text-xs font-semibold">
              Password
            </Label>
            <div className="relative">
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                className="pl-9 text-sm"
              />
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-10 font-semibold shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4" />
                Sign In to Platform
              </>
            )}
          </Button>
        </form>

        {/* Buildathon Fast Preset Selector (Gated in Production) */}
        {(!import.meta.env.PROD || import.meta.env["VITE_ENABLE_DEMO_ACCOUNTS"] === "true") && (
          <div className="pt-2 border-t space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                <Sparkles className="h-3 w-3 text-primary" />
                Buildathon Role Test Profiles:
              </span>
              <span className="text-[10px] text-muted-foreground">Click to fill</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {DEMO_PRESETS.map((preset) => (
                <button
                  key={preset.role}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="rounded-md border border-border bg-muted/40 hover:bg-[#F799B3]/20 hover:border-[#F799B3]/50 px-1.5 py-1 text-center transition-all group"
                  title={`${preset.label}: ${preset.email} (${preset.description})`}
                >
                  <div className="text-[10px] font-semibold text-foreground group-hover:text-primary truncate">
                    {preset.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtle BridgeKey Security Note */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
          <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">BridgeKey Security Note:</span>{" "}
            Credentials authenticate platform roles. Connected BridgeKey wallet signs on-chain
            transactions on MST Testnet (Chain ID 91562037).
          </div>
        </div>

        <div className="pt-2 text-center text-xs text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            Register as an Investor
          </Link>
        </div>
      </div>
    </div>
  );
}
