import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Calculator, Coins } from "lucide-react";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { DEFAULT_PROPERTY, inr } from "@/lib/data";
import { hypotheticalUnits, investorShare } from "@/lib/finance";
import { addActivity, useActivity } from "@/lib/activity";
import { useAllProperties } from "@/lib/propertyStore";
import { TokenisationWorkspace } from "@/components/TokenisationWorkspace";
import { PropertyPurchaseModal } from "@/components/PropertyPurchaseModal";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";

export const Route = createFileRoute("/invest")({
  head: () => ({
    meta: [
      { title: "Fractional Investment · Illustrative Calculator" },
      {
        name: "description",
        content:
          "Explore hypothetical fractional contributions, pool share and units with transparent formulas.",
      },
      { property: "og:title", content: "Fractional Investment · Verify Before You Invest" },
      {
        property: "og:description",
        content: "Educational fractional investment calculator with fictional properties.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: InvestPageWithGuard,
});

function InvestPageWithGuard() {
  return (
    <ProtectedRoute>
      <InvestPage />
    </ProtectedRoute>
  );
}

function InvestPage() {
  const allProperties = useAllProperties();
  const [activeTab, setActiveTab] = useState<"tokenisation" | "calculator">("tokenisation");
  const [pid, setPid] = useState(allProperties[0]?.id ?? DEFAULT_PROPERTY.id);
  const [amount, setAmount] = useState(100_000);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  const p = allProperties.find((x) => x.id === pid) ?? allProperties[0] ?? DEFAULT_PROPERTY;
  const eligibleContribution = Math.min(
    Number.isFinite(amount) ? Math.max(0, amount) : 0,
    p.poolSize,
  );
  const exceedsPool = amount > p.poolSize;
  const share = investorShare(eligibleContribution, p.poolSize);
  const units = hypotheticalUnits(amount, p.unitPrice, p.poolSize);
  const txs = useActivity().filter((a) => a.kind === "Contribution");

  const pie = [
    { name: "Your hypothetical contribution", value: eligibleContribution },
    { name: "Rest of illustrative pool", value: Math.max(0, p.poolSize - eligibleContribution) },
  ];

  return (
    <>
      <PageHeader
        title="Fractional Investment & Property Tokens"
        subtitle="Manage on-chain property tokens, investor compliance whitelisting, and authorized unit issuance on MST Testnet."
      />

      {/* Mode / Workflow Tab Switcher */}
      <div className="flex border-b mb-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("tokenisation")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "tokenisation"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Coins className="h-4 w-4" />
          <span>On-Chain Tokenisation & Issuance</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calculator")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "calculator"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>Illustrative Model & Calculator</span>
        </button>
      </div>

      {activeTab === "tokenisation" ? (
        <TokenisationWorkspace />
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-xs text-foreground/90 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-warning-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Educational Simulation Notice</span>
            </div>
            <p>
              This calculator is an educational mathematical model. It computes hypothetical units
              and illustrative distributions based on user parameters. To issue real units on-chain,
              switch to the "On-Chain Tokenisation & Issuance" tab.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel space-y-4 p-5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Select Property</label>
                  {p.isUserCreated ? (
                    <Pill tone="warning">Local Demo Record</Pill>
                  ) : (
                    <Pill tone="neutral">Sample Property</Pill>
                  )}
                </div>
                <select
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  value={p.id}
                  onChange={(e) => setPid(e.target.value)}
                >
                  {allProperties.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} — {x.id} {x.isUserCreated ? "(Local Demo)" : "(Sample)"}
                    </option>
                  ))}
                </select>
              </div>

              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Indicative value</dt>
                  <dd className="font-semibold">{inr(p.indicativeValue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Illustrative pool</dt>
                  <dd className="font-semibold">{inr(p.poolSize)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Unit price</dt>
                  <dd className="font-semibold">{inr(p.unitPrice)}</dd>
                </div>
              </dl>

              <div>
                <label className="text-xs font-medium">Hypothetical contribution (₹)</label>
                <input
                  type="number"
                  min={0}
                  max={p.poolSize}
                  step={1000}
                  value={amount}
                  aria-label="Hypothetical contribution in rupees"
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                <input
                  type="range"
                  min={0}
                  max={p.poolSize}
                  step={p.unitPrice}
                  value={Math.min(amount, p.poolSize)}
                  aria-label="Adjust hypothetical contribution"
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="mt-3 w-full accent-primary"
                />
                {exceedsPool && (
                  <p
                    role="status"
                    className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-accent-foreground"
                  >
                    This amount exceeds the illustrative pool. Calculations below are capped at{" "}
                    {inr(p.poolSize)}.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-4">
                  <p className="text-xs text-muted-foreground">Share of pool</p>
                  <p className="text-2xl font-semibold">{(share * 100).toFixed(3)}%</p>
                </div>
                <div className="rounded-lg bg-accent p-4">
                  <p className="text-xs text-accent-foreground/80">Hypothetical units</p>
                  <p className="text-2xl font-semibold">{units.toLocaleString("en-IN")}</p>
                </div>
              </div>

              <div className="rounded-lg border p-4 text-sm">
                <p className="font-semibold">Formula</p>
                <p className="mt-1 font-mono text-xs">
                  Investor share = {inr(eligibleContribution)} / {inr(p.poolSize)} ={" "}
                  {(share * 100).toFixed(3)}%
                </p>
                <p className="font-mono text-xs">
                  Units = floor({inr(eligibleContribution)} / {inr(p.unitPrice)}) = {units}
                </p>
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  <li>The pool and unit price are illustrative parameters.</li>
                  <li>Contributions and units are capped to the illustrative pool size.</li>
                  <li>The share is a share of the pool, not legal ownership of the real estate.</li>
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setPurchaseModalOpen(true)}
                  className="gap-1.5 bg-primary hover:bg-primary/90"
                >
                  <Coins className="h-4 w-4" />
                  <span>Buy Demo Units ({p.name})</span>
                </Button>
                <Button
                  variant="outline"
                  disabled={amount <= 0}
                  onClick={() => {
                    addActivity({
                      kind: "Contribution",
                      propertyId: p.id,
                      detail: `Hypothetical contribution of ${inr(eligibleContribution)} → ${units} units`,
                      source: "demo",
                    });
                    toast.success("Simulated contribution recorded", {
                      description: "Local session simulation — no funds or tokens moved.",
                    });
                  }}
                >
                  Record simulated contribution (session only)
                </Button>
              </div>
            </section>

            <div className="space-y-6">
              <section className="panel p-5">
                <h3 className="font-semibold">Sample breakdown</h3>
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pie}
                        dataKey="value"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        <Cell fill="var(--pink)" />
                        <Cell fill="var(--lavender)" />
                      </Pie>
                      <Tooltip formatter={(v: number) => inr(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 text-xs font-medium">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-pink border border-pink/60" />
                    Your contribution
                  </span>
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-lavender border border-lavender/60" />
                    Rest of pool
                  </span>
                </div>
              </section>

              <section className="panel p-5">
                <h3 className="mb-3 font-semibold">Simulated Contribution History</h3>
                <div className="divide-y text-sm">
                  {txs.map((t) => (
                    <div key={t.id} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <p>{t.detail}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {t.propertyId} · {t.txHash}
                        </p>
                      </div>
                      <Pill tone="neutral">Simulated Local Event</Pill>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="mt-6">
            <Disclaimer>
              Tokens and units in this prototype are simulated. They do not establish legal property
              ownership, are not securities offered for sale, and carry no guaranteed financial
              return.
            </Disclaimer>
          </div>
        </>
      )}

      {/* Property Purchase Modal */}
      <PropertyPurchaseModal
        property={p}
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
      />
    </>
  );
}
