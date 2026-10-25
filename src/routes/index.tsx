import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, ClipboardList, Coins, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { PROPERTIES, inr, outstandingChecks, verificationLabel } from "@/lib/data";
import { useActivity } from "@/lib/activity";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Property Verification & Fractional Investment" },
      { name: "description", content: "Overview of sample properties, document reviews, due-diligence checks and illustrative investments." },
      { property: "og:title", content: "Dashboard · Verify Before You Invest" },
      { property: "og:description", content: "Overview of sample properties, document reviews and illustrative investments." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const activity = useActivity();
  const docs = PROPERTIES.flatMap((p) => p.docs);
  const reviewed = docs.filter((d) => d.status === "Reviewed").length;
  const outstanding = PROPERTIES.reduce((s, p) => s + outstandingChecks(p), 0);
  const contributions = 350_000; // sum of seeded sample contributions (illustrative)

  const stats = [
    { label: "Sample properties", value: PROPERTIES.length, icon: Building2 },
    { label: "Documents reviewed", value: `${reviewed} / ${docs.length}`, icon: FileCheck2 },
    { label: "Outstanding checks", value: outstanding, icon: ClipboardList },
    { label: "Contributions (illustrative)", value: inr(contributions), icon: Coins },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Verify Before You Invest. Select a sample property, review its records, then explore a hypothetical investment.">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/verify"><ShieldCheck className="h-4 w-4" /> Verify a Property</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/invest"><Coins className="h-4 w-4" /> Explore Fractional Investment</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel p-5">
            <Icon className="h-5 w-5 text-gold" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Sample properties</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {PROPERTIES.map((p, i) => {
              const v = verificationLabel(p);
              return (
                <Link key={p.id} to="/verify" search={{ property: p.id }} className="panel group overflow-hidden">
                  <img src={p.image} alt={p.name} width={1024} height={640} loading={i ? "lazy" : undefined} className="aspect-[16/10] w-full object-cover" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                      <Pill tone={v.tone}>{v.label}</Pill>
                    </div>
                    <h3 className="mt-2 font-semibold">{p.name}</h3>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{p.location}</p>
                    <p className="mt-2 text-sm">Indicative value <span className="font-semibold">{inr(p.indicativeValue)}</span> <span className="text-xs text-muted-foreground">(illustrative)</span></p>
                    <p className="mt-2 flex items-center gap-1 text-sm font-medium text-primary">Review documents <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          <div className="panel divide-y">
            {activity.slice(0, 6).map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{a.kind}</p>
                  <Pill tone={a.source === "onchain" ? "success" : "neutral"}>{a.source === "onchain" ? "On-chain" : "Simulated"}</Pill>
                </div>
                <p className="text-xs text-muted-foreground">{a.detail}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{a.propertyId} · {new Date(a.time).toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-8">
        <Disclaimer>All properties, values and records are fictional and illustrative. This prototype does not verify legal ownership or offer investments.</Disclaimer>
      </div>
    </>
  );
}
