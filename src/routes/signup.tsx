import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthContext";
import { RoleBadge } from "@/lib/auth/guards";
import { redirectIfAuthenticatedLoader } from "@/lib/auth/routeAuth";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    await redirectIfAuthenticatedLoader();
  },
  component: SignupPage,
});

function SignupPage() {
  const router = useRouter();
  const { signup, isAuthenticated } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password !== confirmPassword) {
      const err = "Passwords do not match.";
      setErrorMsg(err);
      toast.error(err);
      return;
    }

    if (password.length < 8) {
      const err = "Password must be at least 8 characters long.";
      setErrorMsg(err);
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      const newUser = await signup({ name, email, password });
      toast.success(`Account created! Welcome, ${newUser.name}.`);
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            MST TokenEstate
          </h1>
          <p className="text-xs text-muted-foreground">Active Session Detected</p>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">
            You are already registered and logged in
          </h2>
          <p className="text-xs text-muted-foreground">
            Open your personal role dashboard to manage your assets and activities.
          </p>
          <Link to="/dashboard">
            <Button className="w-full">Open Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-6">
      {/* Centered MST TokenEstate Branding */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold shadow-sm mb-1 ring-1 ring-gold/30">
          <Building2 className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          MST TokenEstate
        </h1>
        <p className="text-xs text-muted-foreground font-medium">
          Investor Registration · Institutional Real-Estate Tokenisation
        </p>
      </div>

      {/* Main Registration Card */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-card space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Create Investor Account
          </h2>
          <p className="text-xs text-muted-foreground">
            Register to participate in verified tokenised real-estate opportunities on MST
            Blockchain.
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
            <Label htmlFor="signup-name" className="text-xs font-semibold">
              Full Name
            </Label>
            <div className="relative">
              <Input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                required
                className="pl-9 text-sm"
              />
              <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signup-email" className="text-xs font-semibold">
              Email Address
            </Label>
            <div className="relative">
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="priya@example.com"
                required
                autoComplete="email"
                className="pl-9 text-sm"
              />
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="signup-password" className="text-xs font-semibold">
                Password (min 8 chars)
              </Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="new-password"
                  className="pl-9 text-sm"
                />
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-confirm" className="text-xs font-semibold">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  id="signup-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="new-password"
                  className="pl-9 text-sm"
                />
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Locked Assigned Role Display */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Assigned Platform Role:</span>
              </span>
              <RoleBadge role="INVESTOR" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              By platform security policy, public registration assigns the Investor role. Privileged
              operational roles (Issuer, Compliance, Admin, Pauser) require administrator
              authorization.
            </p>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-10 font-semibold shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Investor Account...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Register as Investor
              </>
            )}
          </Button>
        </form>

        {/* Subtle BridgeKey Security Note */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
          <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">BridgeKey Security Note:</span>{" "}
            Credentials authenticate platform access. Your connected BridgeKey wallet will sign
            on-chain transactions on MST Testnet (Chain ID 91562037).
          </div>
        </div>

        <div className="pt-2 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}
