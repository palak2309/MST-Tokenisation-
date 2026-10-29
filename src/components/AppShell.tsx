import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Building2,
  Calculator,
  Coins,
  Info,
  LayoutDashboard,
  Menu,
  PlusCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NetworkSelector } from "./NetworkSelector";
import { WalletButton } from "./WalletButton";
import { useNetwork } from "@/contractConfig";
import { useAuth } from "@/lib/auth/AuthContext";
import { RoleBadge } from "@/lib/auth/guards";
import type { AppRole } from "@/lib/auth/types";
import { Button } from "./ui/button";

export function getSidebarLinksForRole(role: AppRole | null | undefined): Array<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}> {
  switch (role) {
    case "ADMIN":
      return [
        { to: "/", label: "Dashboard", icon: LayoutDashboard },
        { to: "/admin", label: "Admin Console", icon: Shield },
        { to: "/properties/new", label: "Add Property", icon: PlusCircle },
        { to: "/verify", label: "Property Verification", icon: ShieldCheck },
        { to: "/invest", label: "Fractional Investment / Tokenisation", icon: Coins },
        { to: "/pause", label: "Emergency Pause Controls", icon: AlertTriangle },
        { to: "/activity", label: "Blockchain Activity", icon: Activity },
        { to: "/about", label: "About the Prototype", icon: Info },
      ];
    case "PROPERTY_ISSUER":
      return [
        { to: "/", label: "Dashboard", icon: LayoutDashboard },
        { to: "/properties/new", label: "Add Property", icon: PlusCircle },
        { to: "/verify", label: "Property Verification", icon: ShieldCheck },
        { to: "/invest", label: "Fractional Investment / Tokenisation", icon: Coins },
        { to: "/activity", label: "Blockchain Activity", icon: Activity },
        { to: "/about", label: "About the Prototype", icon: Info },
      ];
    case "COMPLIANCE_OFFICER":
      return [
        { to: "/", label: "Dashboard", icon: LayoutDashboard },
        { to: "/verify", label: "Property Verification", icon: ShieldCheck },
        { to: "/invest", label: "Fractional Investment / Tokenisation", icon: Coins },
        { to: "/activity", label: "Blockchain Activity", icon: Activity },
        { to: "/about", label: "About the Prototype", icon: Info },
      ];
    case "EMERGENCY_PAUSER":
      return [
        { to: "/", label: "Dashboard", icon: LayoutDashboard },
        { to: "/pause", label: "Emergency Pause Controls", icon: AlertTriangle },
        { to: "/activity", label: "Blockchain Activity", icon: Activity },
        { to: "/about", label: "About the Prototype", icon: Info },
      ];
    case "INVESTOR":
    default:
      return [
        { to: "/", label: "Dashboard", icon: LayoutDashboard },
        { to: "/verify", label: "Property Verification", icon: ShieldCheck },
        { to: "/invest", label: "Fractional Investment", icon: Coins },
        { to: "/rental", label: "Rental Income Calculator", icon: Calculator },
        { to: "/activity", label: "Blockchain Activity", icon: Activity },
        { to: "/about", label: "About the Prototype", icon: Info },
      ];
  }
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { role } = useAuth();
  const links = getSidebarLinksForRole(role);

  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={`${to}-${label}`}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[#F799B3] text-[#202938] font-bold shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ inHeader = false }: { inHeader?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F799B3] text-[#202938] font-bold shadow-sm">
        <Building2 className="h-5 w-5" />
      </div>
      <div>
        <p
          className={`font-display text-sm font-semibold tracking-tight ${
            inHeader ? "text-foreground" : "text-sidebar-foreground"
          }`}
        >
          MST TokenEstate
        </p>
        <p
          className={`text-[11px] ${
            inHeader ? "text-muted-foreground" : "text-sidebar-foreground/60"
          }`}
        >
          Verify Before You Invest
        </p>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { statusInfo, isMainnet, setNetwork } = useNetwork();
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur sm:px-8">
          <Brand inHeader />
          <div className="flex items-center gap-3">
            <NetworkSelector />
            <div title={statusInfo.description} className="hidden sm:block">
              <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
            </div>
            <WalletButton />
          </div>
        </header>

        {isMainnet && (
          <div
            role="alert"
            className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 text-center"
          >
            <span>
              <strong>MST Mainnet Active (Chain ID 4646):</strong> Live operations use real MST.
            </span>
          </div>
        )}

        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
          {children}
        </main>

        <footer className="border-t py-4 text-center text-xs text-muted-foreground px-4">
          <p>
            MST TokenEstate · Institutional Real-Estate Tokenisation on MST Blockchain (Chain ID
            91562037)
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col gap-6 bg-sidebar p-5 text-sidebar-foreground lg:flex">
        <Brand />
        {isAuthenticated && user && (
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                Your Role
              </span>
              <RoleBadge role={user.role} />
            </div>
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-[11px] text-sidebar-foreground/60 font-mono truncate">
              {user.email}
            </p>
            <Link
              to="/dashboard"
              className="inline-block text-[11px] text-[#F799B3] hover:underline font-semibold pt-0.5"
            >
              Open Role Hub →
            </Link>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
          Prototype for a student buildathon. All properties and figures are fictional.
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <button
            className="rounded-md p-2 lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <NetworkSelector />
          <div title={statusInfo.description} className="hidden md:block">
            <Pill tone={statusInfo.tone}>{statusInfo.label}</Pill>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2 text-xs">
              <RoleBadge role={user.role} />
              <span className="hidden md:inline font-medium text-foreground">{user.name}</span>
              <button
                type="button"
                onClick={() => logout()}
                className="text-xs text-muted-foreground hover:text-foreground underline pl-1"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Link to="/login">
                <Button size="sm" variant="ghost" className="text-xs h-8 px-2.5">
                  Log In
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="text-xs h-8 px-2.5">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}

          <WalletButton />
        </div>
      </header>

      {isMainnet && (
        <div
          role="alert"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>MST Mainnet Active (Chain ID 4646):</strong> Live operations broadcast
                permanent on-chain records and consume real MST. Verify all parameters carefully in
                BridgeKey before signing.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNetwork("testnet")}
              className="shrink-0 font-semibold underline hover:no-underline text-amber-800 dark:text-amber-300 text-xs cursor-pointer"
            >
              Switch to Testnet
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-sidebar p-5 text-sidebar-foreground">
            <div className="flex justify-between gap-2">
              <Brand />
              <button aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            {isAuthenticated && user && (
              <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                    Your Role
                  </span>
                  <RoleBadge role={user.role} />
                </div>
                <p className="text-xs font-semibold text-sidebar-foreground truncate">
                  {user.name}
                </p>
                <p className="text-[11px] text-sidebar-foreground/60 font-mono truncate">
                  {user.email}
                </p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-xs text-accent-foreground">
      <p className="font-semibold text-warning-foreground">Important buildathon notice</p>
      <p className="mt-1 text-muted-foreground">
        {children ??
          "MST TokenEstate is a demonstration real-estate tokenisation platform built for MST Buildathon 2.0. Fractional tokens do not transfer legal property title; property documents registered on-chain record SHA-256 fingerprint proofs."}
      </p>
    </div>
  );
}

const TONES = {
  primary: "bg-[#F799B3]/25 text-[#202938] border-[#F799B3]/50 font-semibold",
  success: "bg-[#1E6B52]/15 text-[#1E6B52] border-[#1E6B52]/30 font-semibold",
  warning: "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/40",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-foreground border-border",
} as const;

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export const statusTone = (s: string): keyof typeof TONES =>
  s === "Reviewed"
    ? "success"
    : s === "Pending Review"
      ? "warning"
      : s === "Missing" || s === "Requires Attention"
        ? "destructive"
        : "neutral";
