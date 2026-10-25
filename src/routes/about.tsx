import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { Disclaimer, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Prototype · Capabilities & Limitations" },
      { name: "description", content: "What is implemented, what is simulated, and how MST Blockchain integration is prepared." },
      { property: "og:title", content: "About the Prototype · Verify Before You Invest" },
      { property: "og:description", content: "Implemented vs simulated features of this buildathon prototype." },
    ],
  }),
  component: About,
});

const IMPLEMENTED = [
  "Responsive dashboard, sidebar and mobile navigation",
  "In-browser SHA-256 hashing of PDF and image files (Web Crypto API)",
  "Hash comparison: Match, Mismatch or No Registered Reference",
  "Due-diligence checklist with editable review statuses",
  "Fractional contribution and rental income calculators",
  "MetaMask wallet connection via ethers.js",
  "Solidity registry contract and Hardhat-ready blockchain service",
];
const SIMULATED = [
  "All properties, documents, values and investors are fictional",
  "Fingerprint registration and contributions in Demo Mode (session only)",
  "Transaction references starting with DEMO-",
  "Live MST testnet submissions until network values are verified and configured",
];

const JOURNEY = ["Select a sample property", "Review its documents", "Calculate and compare a document hash", "Identify outstanding checks", "Explore a hypothetical fractional investment", "Calculate illustrative rental income", "Inspect transaction records"];

function About() {
  return (
    <>
      <PageHeader title="About the Prototype" subtitle="A student blockchain buildathon project. Verify Before You Invest." />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-5">
          <h3 className="mb-3 font-semibold">Implemented</h3>
          <ul className="space-y-2 text-sm">{IMPLEMENTED.map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" />{t}</li>)}</ul>
        </section>
        <section className="panel p-5">
          <h3 className="mb-3 font-semibold">Simulated</h3>
          <ul className="space-y-2 text-sm">{SIMULATED.map((t) => <li key={t} className="flex gap-2"><FlaskConical className="h-4 w-4 shrink-0 text-gold" />{t}</li>)}</ul>
        </section>
        <section className="panel p-5 md:col-span-2">
          <h3 className="mb-3 font-semibold">Demo journey</h3>
          <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map((s, i) => <li key={s} className="rounded-lg bg-secondary p-3"><span className="font-display text-lg text-gold">{i + 1}</span><p>{s}</p></li>)}
          </ol>
        </section>
        <section className="panel p-5 md:col-span-2 text-sm">
          <h3 className="mb-2 font-semibold">MST Blockchain readiness</h3>
          <p className="text-muted-foreground">Network RPC URL, chain ID, contract address and explorer are read from environment variables. None are invented. Before going live, confirm the official MST network configuration, wallet compatibility, testnet, faucet and explorer, deploy the registry contract, and set those values.</p>
        </section>
      </div>
      <div className="mt-6"><Disclaimer>This prototype is not a legal property-verification service or a live investment marketplace. It does not confirm ownership, verify government records, or promise returns.</Disclaimer></div>
    </>
  );
}
