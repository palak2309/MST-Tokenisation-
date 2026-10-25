import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Building2, Calculator, Coins, Info, LayoutDashboard, Menu, ShieldCheck, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { WalletButton } from "./WalletButton";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/verify", label: "Property Verification", icon: ShieldCheck },
  { to: "/invest", label: "Fractional Investment", icon: Coins },
  { to: "/rental", label: "Rental Income Calculator", icon: Calculator },
  { to: "/activity", label: "Blockchain Activity", icon: Activity },
  { to: "/about", label: "About the Prototype", icon: Info },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Building2 className="h-5 w-5" />
      </div>
      <div>
        <p className="font-display text-sm leading-tight font-semibold">Property Verification &amp; Fractional Investment Platform</p>
        <p className="mt-1 text-xs text-sidebar-primary">Verify Before You Invest.</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col gap-8 bg-sidebar p-5 text-sidebar-foreground lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
          Prototype for a student buildathon. All properties and figures are fictional.
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur lg:px-8">
        <button className="rounded-md p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Demo Mode · Fictional data</span>
        <WalletButton />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-8 bg-sidebar p-5 text-sidebar-foreground">
            <div className="flex justify-between gap-2">
              <Brand />
              <button aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gold/50 bg-accent/60 p-4 text-sm text-accent-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const TONES = {
  success: "bg-success/12 text-success border-success/30",
  warning: "bg-warning/15 text-accent-foreground border-warning/40",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const statusTone = (s: string): keyof typeof TONES =>
  s === "Reviewed" ? "success" : s === "Pending Review" ? "warning" : s === "Missing" || s === "Requires Attention" ? "destructive" : "neutral";
