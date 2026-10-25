import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Disclaimer, PageHeader } from "@/components/AppShell";
import { PROPERTIES, inr } from "@/lib/data";
import { rental } from "@/lib/finance";

export const Route = createFileRoute("/rental")({
  head: () => ({
    meta: [
      { title: "Rental Income Calculator · Illustrative Estimates" },
      { name: "description", content: "Calculate net distributable rental income and a hypothetical investor allocation." },
      { property: "og:title", content: "Rental Income Calculator · Verify Before You Invest" },
      { property: "og:description", content: "Estimate illustrative monthly and annual rental distributions." },
    ],
  }),
  component: RentalPage,
});

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}{suffix && <span className="text-muted-foreground"> ({suffix})</span>}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm" />
    </label>
  );
}

function RentalPage() {
  const [gross, setGross] = useState(PROPERTIES[0].monthlyRent);
  const [operating, setOperating] = useState(4_000);
  const [maintenance, setMaintenance] = useState(3_500);
  const [vacancyPct, setVacancy] = useState(5);
  const [sharePct, setShare] = useState(1);
  const r = rental({ gross, operating, maintenance, vacancyPct, share: sharePct / 100 });

  const chart = [
    { name: "Gross", v: gross },
    { name: "Operating", v: operating },
    { name: "Maint./mgmt", v: maintenance },
    { name: "Vacancy", v: r.vacancy },
    { name: "Net", v: r.net },
  ];

  return (
    <>
      <PageHeader title="Rental Income Calculator" subtitle="Change any input and the results update instantly. All figures are monthly unless stated." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-medium">Prefill from sample property</span>
            <select className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm" onChange={(e) => setGross(PROPERTIES.find((p) => p.id === e.target.value)!.monthlyRent)}>
              {PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.name} ({inr(p.monthlyRent)}/mo)</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly gross rental income" suffix="₹" value={gross} onChange={setGross} />
            <Field label="Operating expenses" suffix="₹" value={operating} onChange={setOperating} />
            <Field label="Maintenance & management" suffix="₹" value={maintenance} onChange={setMaintenance} />
            <Field label="Vacancy allowance" suffix="% of gross" value={vacancyPct} onChange={setVacancy} />
            <Field label="Hypothetical investor share" suffix="%" value={sharePct} onChange={(n) => setShare(Math.min(100, n))} />
          </div>
          <div className="rounded-lg border p-4 font-mono text-xs leading-6">
            <p>Net distributable = {inr(gross)} − {inr(operating)} − {inr(maintenance)} − {inr(r.vacancy)} = <b>{inr(r.net)}</b></p>
            <p>Investor allocation = {inr(r.net)} × {sharePct}% = <b>{inr(r.monthly)}</b> / month</p>
          </div>
        </section>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Net distributable</p><p className="text-xl font-semibold">{inr(r.net)}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Est. monthly</p><p className="text-xl font-semibold text-primary">{inr(r.monthly)}</p></div>
            <div className="panel p-4"><p className="text-xs text-muted-foreground">Est. annual</p><p className="text-xl font-semibold text-accent-foreground">{inr(r.annual)}</p></div>
          </div>
          <section className="panel p-5">
            <h3 className="mb-2 font-semibold">Monthly income waterfall</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chart}>
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="v" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
      <div className="mt-6"><Disclaimer>Results are illustrative estimates, not guaranteed returns. Actual income depends on occupancy, taxes, costs and the legal structure of any arrangement.</Disclaimer></div>
    </>
  );
}
