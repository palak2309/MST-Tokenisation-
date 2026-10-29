import { Link } from "@tanstack/react-router";
import { AlertTriangle, Lock, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthContext";
import type { AppRole } from "./types";

export function RoleBadge({ role }: { role: AppRole | null }) {
  if (!role) return null;

  const styles: Record<AppRole, string> = {
    ADMIN: "bg-red-500/15 text-red-500 border-red-500/30",
    PROPERTY_ISSUER: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    COMPLIANCE_OFFICER: "bg-purple-500/15 text-purple-500 border-purple-500/30",
    INVESTOR: "bg-[#C9B8E8]/35 text-[#202938] border-[#C9B8E8]/70",
    EMERGENCY_PAUSER: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  };

  const labels: Record<AppRole, string> = {
    ADMIN: "Administrator",
    PROPERTY_ISSUER: "Property Issuer",
    COMPLIANCE_OFFICER: "Compliance Officer",
    INVESTOR: "Investor",
    EMERGENCY_PAUSER: "Emergency Pauser",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[role]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[role]}
    </span>
  );
}

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole | AppRole[];
  fallbackUrl?: string;
}

export function ProtectedRoute({
  children,
  requiredRole,
  fallbackUrl = "/login",
}: ProtectedRouteProps) {
  const { user, role, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">Verifying session permissions...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto max-w-lg my-12 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning mb-4">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Authentication Required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You must be logged in with a valid platform account to access this page.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to={fallbackUrl}>
            <Button>Log In to Continue</Button>
          </Link>
          <Link to="/signup">
            <Button variant="outline">Create Account</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!role || !allowedRoles.includes(role)) {
      return (
        <div className="mx-auto max-w-lg my-12 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-destructive">403 · Access Denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your current application role (
            <span className="font-semibold text-foreground">{role ?? "NONE"}</span>) does not have
            permission to access this section.
          </p>
          <div className="mt-4 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            Required role(s):{" "}
            <span className="font-semibold text-foreground">{allowedRoles.join(" or ")}</span>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/dashboard">
              <Button variant="outline">Go to Your Role Dashboard</Button>
            </Link>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

export function RoleGate({
  allowedRoles,
  children,
  fallback = null,
}: {
  allowedRoles: AppRole | AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = useAuth();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!role || !roles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
