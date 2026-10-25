import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { DEFAULT_PROPERTY, PROPERTIES, inr } from "@/lib/data";
import { hypotheticalUnits, investorShare } from "@/lib/finance";
import { addActivity, useActivity } from "@/lib/activity";

export const Route = createFileRoute("/invest")({
  head: () => ({
    meta: [
      { title: "Fractional Investment · Illustrative Calculator" },
      { name: "description", content: "Explore hypothetical fractional contributions, pool share and units with transparent formulas." },
      { property: "og:title", content: "Fractional Investment · Verify Before You Invest" },
      { property: "og:description", content: "Educational fractional investment calculator with fictional properties." },
    ],
  }),
  component: InvestPage,
});

function InvestPage() {
  const [pid, setPid] = useState(DEFAULT_PROPERTY.id);
  const [amount, setAmount] = useState(100_000);
  const p = (PROPERTIES.find((x) => x.id === pid) ?? DEFAULT_PROPERTY);
  const share = investorShare(amount, p.poolSize);
  const units = hypotheticalUnits(amount, p.unitPrice);
  const txs = useActivity().filter((a) => a.kind === "Contribution");

  const pie = [
    { name: "Your hypothetical contribution", value: Math.min(amount, p.poolSize) },
    { name: "Rest of illustrative pool", value: Math.max(0, p.poolSize - amount) },
  ];

  return (
    <>
      <PageHeader title="Fractional Investment" subtitle="An educational simulation of how contributions to an illustrative pool could be tracked transparently." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-4 p-5">
          <div>
            <label className="text-xs font-medium">Sample property</label>
            <select className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm" value={pid} onChange={(e) => setPid(e.target.value)}>
              {PROPERTIES.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.id}</option>)}
            </select>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Indicative value</dt><dd className="font-semibold">{inr(p.indicativeValue)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Illustrative pool</dt><dd className="font-semibold">{inr(p.poolSize)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Unit price</dt><dd className="font-semibold">{inr(p.unitPrice)}</dd></div>
          </dl>
          <div>
            <label className="text-xs font-medium">Hypothetical contribution (₹)</label>
            <input type="number" min={0} step={1000} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm" />
            <input type="range" min={0} max={p.poolSize / 10} step={p.unitPrice} value={Math.min(amount, p.poolSize / 10)} onChange={(e) => setAmount(Number(e.target.value))} className="mt-3 w-full accent-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary p-4"><p className="text-xs text-muted-foreground">Share of pool</p><p className="text-2xl font-semibold">{(share * 100).toFixed(3)}%</p></div>
            <div className="rounded-lg bg-accent p-4"><p className="text-xs text-accent-foreground/80">Hypothetical units</p><p className="text-2xl font-semibold">{units.toLocaleString("en-IN")}</p></div>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-semibold">Formula</p>
            <p className="mt-1 font-mono text-xs">Investor share = {inr(amount)} / {inr(p.poolSize)} = {(share * 100).toFixed(3)}%</p>
            <p className="font-mono text-xs">Units = floor({inr(amount)} / {inr(p.unitPrice)}) = {units}</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              <li>The pool and unit price are fictional assumptions.</li>
              <li>Contributions above the pool size are capped at 100%.</li>
              <li>The share is a share of the pool, not legal ownership of the property.</li>
            </ul>
          </div>
          <Button
            disabled={amount <= 0}
            onClick={() => {
              addActivity({ kind: "Contribution", propertyId: p.id, detail: `Hypothetical contribution of ${inr(amount)} → ${units} units`, source: "demo" });
              toast.success("Simulated contribution recorded", { description: "Demo Mode — no funds or tokens moved." });
            }}
          >
            Record simulated contribution
          </Button>
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h3 className="font-semibold">Sample breakdown</h3>
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    <Cell fill="var(--gold)" />
                    <Cell fill="var(--primary)" />
                  </Pie>
                  <Tooltip formatter={(v: number) => inr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold" />Your contribution</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Rest of pool</span>
            </div>
          </section>
          <section className="panel p-5">
            <h3 className="mb-3 font-semibold">Transaction history</h3>
            <div className="divide-y text-sm">
              {txs.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 py-2">
                  <div><p>{t.detail}</p><p className="font-mono text-[11px] text-muted-foreground">{t.propertyId} · {t.txHash}</p></div>
                  <Pill>Simulated</Pill>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="mt-6">
        <Disclaimer>Tokens and units in this prototype are simulated. They do not establish legal property ownership, are not securities offered for sale, and carry no guaranteed financial return.</Disclaimer>
      </div>
    </>
  );
}
