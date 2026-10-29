import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ClipboardList,
  Coins,
  Edit2,
  FileCheck2,
  MapPin,
  PlusCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { inr, outstandingChecks, verificationLabel, type Property } from "@/lib/data";
import { useActivity } from "@/lib/activity";
import { deleteUserProperty, useAllProperties, useUserProperties } from "@/lib/propertyStore";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Property Verification & Fractional Investment" },
      {
        name: "description",
        content:
          "Overview of sample properties, document reviews, due-diligence checks and illustrative investments.",
      },
      { property: "og:title", content: "Dashboard · Verify Before You Invest" },
      {
        property: "og:description",
        content: "Overview of sample properties, document reviews and illustrative investments.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: DashboardWithGuard,
});

function DashboardWithGuard() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}

function Dashboard() {
  const { role } = useAuth();
  const canManageProperties = role === "PROPERTY_ISSUER" || role === "ADMIN";
  const activity = useActivity();
  const allProperties = useAllProperties();
  const userProperties = useUserProperties();
  const sampleProperties = allProperties.filter((p) => !p.isUserCreated);

  const [propertyToDelete, setPropertyToDelete] = useState<Property | null>(null);

  const allDocs = allProperties.flatMap((p) => p.docs);
  const reviewed = allDocs.filter((d) => d.status === "Reviewed").length;
  const outstanding = allProperties.reduce((s, p) => s + outstandingChecks(p), 0);
  const contributions = 350_000; // sum of seeded sample contributions (illustrative)

  const stats = [
    { label: "Total properties", value: allProperties.length, icon: Building2 },
    { label: "Documents reviewed", value: `${reviewed} / ${allDocs.length}`, icon: FileCheck2 },
    { label: "Outstanding checks", value: outstanding, icon: ClipboardList },
    { label: "Sample contributions (illustrative)", value: inr(contributions), icon: Coins },
  ];

  function confirmDelete() {
    if (!propertyToDelete) return;
    if (!canManageProperties) {
      toast.error(
        "Unauthorized: Only Property Issuers and Administrators can delete demo properties.",
      );
      setPropertyToDelete(null);
      return;
    }
    const res = deleteUserProperty(propertyToDelete.id);
    if (res.success) {
      toast.success(`Demo property "${propertyToDelete.name}" deleted.`);
    } else {
      toast.error(res.error || "Failed to delete property.");
    }
    setPropertyToDelete(null);
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Verify Before You Invest. Select a property, review its records, explore fractional investment, or propose a new property."
      >
        <div className="flex flex-wrap gap-2">
          {canManageProperties && (
            <Button asChild className="font-semibold shadow-sm">
              <Link to="/properties/new">
                <PlusCircle className="h-4 w-4" /> Add Property
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/verify">
              <ShieldCheck className="h-4 w-4" /> Verify a Property
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/invest">
              <Coins className="h-4 w-4" /> Fractional Investment
            </Link>
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
        <section className="space-y-6 xl:col-span-2">
          {/* User-created demo properties section */}
          {userProperties.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">User-Created Demo Properties</h2>
                  <p className="text-xs text-muted-foreground">
                    Locally saved records. Persisted in browser localStorage.
                  </p>
                </div>
                <Pill tone="warning">Local Demo Records</Pill>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {userProperties.map((p) => {
                  const v = verificationLabel(p);
                  return (
                    <div
                      key={p.id}
                      className="panel group overflow-hidden border-warning/30 bg-card"
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {p.id}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Pill tone="warning">Demo</Pill>
                            <Pill tone={v.tone}>{v.label}</Pill>
                          </div>
                        </div>

                        <h3 className="mt-2 text-base font-semibold">{p.name}</h3>
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{p.location}</span>
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Market Value</span>
                            <p className="font-semibold">{inr(p.indicativeValue)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Token Pool</span>
                            <p className="font-semibold text-primary">{inr(p.poolSize)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t pt-3">
                          <Link
                            to="/verify"
                            search={{ property: p.id }}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            Review ({p.docs.length} docs) <ArrowRight className="h-3.5 w-3.5" />
                          </Link>

                          {canManageProperties && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 px-2 text-xs"
                              >
                                <Link to="/properties/new" search={{ edit: p.id }}>
                                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" /> Edit
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => setPropertyToDelete(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sample Properties section */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sample Properties (Fictional Data)</h2>
                <p className="text-xs text-muted-foreground">
                  Seeded demo properties for buildathon evaluation. Prices, document records, and
                  hashes are fictional and not real-world facts.
                </p>
              </div>
              <Pill tone="neutral">Sample Demo</Pill>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {sampleProperties.map((p, i) => {
                const v = verificationLabel(p);
                return (
                  <Link
                    key={p.id}
                    to="/verify"
                    search={{ property: p.id }}
                    className="panel group overflow-hidden transition-shadow hover:shadow-md"
                  >
                    <img
                      src={p.image}
                      alt={p.name}
                      width={1024}
                      height={640}
                      loading={i ? "lazy" : undefined}
                      className="aspect-[16/10] w-full object-cover"
                    />
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                        <div className="flex items-center gap-1.5">
                          <Pill tone="neutral">Sample</Pill>
                          <Pill tone={v.tone}>{v.label}</Pill>
                        </div>
                      </div>
                      <h3 className="mt-2 font-semibold">{p.name}</h3>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{p.location}</span>
                      </p>
                      <p className="mt-2 text-sm">
                        Indicative value{" "}
                        <span className="font-semibold">{inr(p.indicativeValue)}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          (illustrative estimate)
                        </span>
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-sm font-medium text-primary">
                        Review documents{" "}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent activity column */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <Link to="/activity" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="panel divide-y">
            {activity.slice(0, 6).map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{a.kind}</p>
                  <Pill tone={a.source === "onchain" ? "success" : "neutral"}>
                    {a.source === "onchain" ? "On-Chain Confirmed" : "Simulated Local Event"}
                  </Pill>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {a.propertyId} ·{" "}
                  {new Date(a.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {propertyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="panel max-w-md w-full p-6 space-y-4 bg-card shadow-xl border-destructive/30">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-destructive/10 p-2 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Delete Demo Property?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you sure you want to delete <strong>{propertyToDelete.name}</strong> (
                  {propertyToDelete.id}) from local demo storage? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPropertyToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete Property
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <Disclaimer>
          All sample properties, values, and document fingerprints are fictional educational data.
          This prototype does not verify real-world legal ownership, title authenticity, or offer
          investments.
        </Disclaimer>
      </div>
    </>
  );
}
