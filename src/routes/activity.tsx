import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, Info } from "lucide-react";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import { separateActivityRecords, useActivity } from "@/lib/activity";
import { chainConfig } from "@/lib/blockchain";
import { getNetworkStatusInfo } from "@/contractConfig";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Blockchain Activity · Transaction Records" },
      {
        name: "description",
        content: "Confirmed on-chain transactions and local simulation activity records.",
      },
      { property: "og:title", content: "Blockchain Activity · Verify Before You Invest" },
      {
        property: "og:description",
        content: "Inspect verified on-chain transactions and local demonstration events.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: ActivityPageWithGuard,
});

function ActivityPageWithGuard() {
  return (
    <ProtectedRoute>
      <ActivityPage />
    </ProtectedRoute>
  );
}

function ActivityPage() {
  const rows = useActivity();
  const networkStatus = getNetworkStatusInfo(chainConfig);
  const { confirmedOnChain, localSimulated } = separateActivityRecords(rows);

  return (
    <>
      <PageHeader
        title="Blockchain Activity"
        subtitle="Transparent distinction between confirmed on-chain transactions and local simulation events."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Configured Network</p>
          <p className="font-semibold">{chainConfig.networkName ?? "MST Testnet"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Registry Status</p>
          <div className="mt-1">
            <Pill tone={networkStatus.tone}>{networkStatus.label}</Pill>
          </div>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-muted-foreground">Registry Contract</p>
          <p className="truncate font-mono text-xs mt-1">
            {chainConfig.contractAddress || "Not configured"}
          </p>
        </div>
      </div>

      {/* Section 1: Confirmed On-chain Transactions */}
      <section className="space-y-3 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Confirmed On-Chain Transactions</h2>
            <p className="text-xs text-muted-foreground">
              Verified transactions broadcast to the configured MST network with receipts.
            </p>
          </div>
          <Pill tone={confirmedOnChain.length > 0 ? "success" : "neutral"}>
            {confirmedOnChain.length} Confirmed
          </Pill>
        </div>

        {confirmedOnChain.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">No confirmed on-chain transactions yet</p>
            <p>
              When you connect BridgeKey on a configured MST network and register a document
              fingerprint, the confirmed transaction hash and block explorer link will appear here.
            </p>
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Property</th>
                  <th className="px-3 py-3">Detail</th>
                  <th className="px-3 py-3">Tx Hash</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {confirmedOnChain.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-xs">
                      {new Date(r.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </td>
                    <td className="px-3 py-3 font-medium">{r.kind}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.propertyId}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{r.detail}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {r.explorerUrl ? (
                        <a
                          href={r.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline"
                        >
                          {r.txHash?.slice(0, 14)}… <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        (r.txHash ?? "—")
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Pill tone="success">Confirmed On-Chain</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: Local & Simulated Activity */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Local & Simulated Activity (Not on Blockchain)
            </h2>
            <p className="text-xs text-muted-foreground">
              Local demonstration events, in-browser document hashes, and mock session
              contributions.
            </p>
          </div>
          <Pill tone="neutral">{localSimulated.length} Local Events</Pill>
        </div>

        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Property</th>
                <th className="px-3 py-3">Detail</th>
                <th className="px-3 py-3">Identifier</th>
                <th className="px-5 py-3">Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {localSimulated.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-xs">
                    {new Date(r.time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-3 py-3 font-medium">{r.kind}</td>
                  <td className="px-3 py-3 font-mono text-xs">{r.propertyId}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{r.detail}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {r.txHash ?? "Local event"}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone="neutral">Simulated Local Event</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8">
        <Disclaimer>
          References starting with “DEMO-” are simulated local identifiers, not blockchain
          transaction hashes. Only fingerprints (hashes) and property IDs would ever be written
          on-chain — never document contents or personal data.
        </Disclaimer>
      </div>
    </>
  );
}
