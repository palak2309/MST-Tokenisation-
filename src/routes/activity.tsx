import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { useActivity } from "@/lib/activity";
import { chainConfig, isLiveConfigured } from "@/lib/blockchain";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Blockchain Activity · Transaction Records" },
      { name: "description", content: "Simulated and on-chain records of document fingerprints and contributions." },
      { property: "og:title", content: "Blockchain Activity · Verify Before You Invest" },
      { property: "og:description", content: "Inspect document fingerprint and contribution records." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const rows = useActivity();
  const live = isLiveConfigured();
  return (
    <>
      <PageHeader title="Blockchain Activity" subtitle="Every record is labelled as simulated or on-chain. Simulated records are never presented as real transactions." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4"><p className="text-xs text-muted-foreground">Network</p><p className="font-semibold">{live ? chainConfig.networkName : "Not configured"}</p></div>
        <div className="panel p-4"><p className="text-xs text-muted-foreground">Mode</p><p className="font-semibold">{live ? "Live (testnet)" : "Demo Mode"}</p></div>
        <div className="panel p-4"><p className="text-xs text-muted-foreground">Registry contract</p><p className="truncate font-mono text-xs">{chainConfig.contractAddress ?? "—"}</p></div>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="px-5 py-3">Time</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Property</th><th className="px-3 py-3">Detail</th><th className="px-3 py-3">Reference</th><th className="px-5 py-3">Source</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 text-xs">{new Date(r.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="px-3 py-3 font-medium">{r.kind}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.propertyId}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{r.detail}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  {r.explorerUrl ? <a href={r.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">{r.txHash?.slice(0, 12)}… <ExternalLink className="h-3 w-3" /></a> : r.txHash ?? "—"}
                </td>
                <td className="px-5 py-3"><Pill tone={r.source === "onchain" ? "success" : "neutral"}>{r.source === "onchain" ? "On-chain" : "Simulated"}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6"><Disclaimer>References starting with “DEMO-” are simulated identifiers, not blockchain transaction hashes. Only fingerprints (hashes) and property IDs would ever be written on-chain — never document contents or personal data.</Disclaimer></div>
    </>
  );
}
