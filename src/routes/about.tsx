import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FlaskConical } from "lucide-react";
import { Disclaimer, PageHeader } from "@/components/AppShell";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About the Prototype · Capabilities & Limitations" },
      {
        name: "description",
        content:
          "What is implemented, what is simulated, and how MST Blockchain integration is prepared.",
      },
      { property: "og:title", content: "About the Prototype · Verify Before You Invest" },
      {
        property: "og:description",
        content: "Implemented vs simulated features of this buildathon prototype.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: AboutWithGuard,
});

function AboutWithGuard() {
  return (
    <ProtectedRoute>
      <About />
    </ProtectedRoute>
  );
}

const IMPLEMENTED = [
  "Responsive dashboard, sidebar and mobile navigation",
  "In-browser SHA-256 hashing of PDF and image files (Web Crypto API)",
  "Hash comparison: Match, Mismatch or No Registered Reference",
  "Due-diligence checklist with editable review statuses",
  "Fractional contribution and rental income calculators",
  "BridgeKey wallet connection via EIP-6963 and ethers.js",
  "Solidity registry contract and Hardhat-ready blockchain service",
];
const SIMULATED = [
  "All properties, documents, values and investors are fictional",
  "Fingerprint registration and contributions in Demo Mode (session only)",
  "Transaction references starting with DEMO-",
  "Live MST testnet submissions until network values are verified and configured",
];

const JOURNEY = [
  {
    step: "1",
    title: "Upload & Hash Locally",
    desc: "A user selects a title deed or municipal record. The browser computes its SHA-256 fingerprint client-side using Web Crypto. The file is never uploaded to any server.",
  },
  {
    step: "2",
    title: "Query the Registry",
    desc: "The app queries PropertyDocumentRegistry on MST Blockchain using the property ID and document fingerprint to check if a prior record exists.",
  },
  {
    step: "3",
    title: "Verify or Register",
    desc: "If registered, the submitter address and block timestamp are shown as proof of prior existence. If new, an authorized user can submit the fingerprint on-chain.",
  },
  {
    step: "4",
    title: "Simulate Fractional Units",
    desc: "Once documents are reviewed, users explore fractional share allocation and rental distributions with transparent mathematical models.",
  },
];

function About() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="About the Prototype"
        subtitle="Educational prototype for property document verification and fractional real-estate tokenisation on MST Blockchain."
      />

      <div className="panel p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">How It Works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map(({ step, title, desc }) => (
            <div key={step} className="space-y-1.5 rounded-lg border bg-background p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {step}
              </span>
              <p className="font-semibold text-sm text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="panel p-6 space-y-3">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Implemented Features</span>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {IMPLEMENTED.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-primary font-bold">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-6 space-y-3">
          <div className="flex items-center gap-2 text-warning font-semibold text-sm">
            <FlaskConical className="h-4 w-4" />
            <span>Simulated / Demo Features</span>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {SIMULATED.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-warning font-bold">~</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
