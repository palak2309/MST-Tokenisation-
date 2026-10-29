import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CircleHelp, FileUp, Loader2, MapPin, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill, statusTone } from "@/components/AppShell";
import PropertyRegistry from "@/PropertyRegistry";
import { DEFAULT_PROPERTY, getProperty, inr, outstandingChecks, type DocStatus } from "@/lib/data";
import { addActivity, demoRefKey, getDemoRef, setDemoRef, useActivity } from "@/lib/activity";
import { useAllProperties } from "@/lib/propertyStore";
import {
  ALLOWED_TYPES,
  chainConfig,
  compareOnChainFingerprint,
  explorerTxUrl,
  getRecordOnChain,
  getRegistryConfigurationMessage,
  isLiveConfigured,
  isMainnetRegistryUnavailable,
  MAX_BYTES,
  registerOnChain,
  sha256Hex,
  walletErrorMessage,
} from "@/lib/blockchain";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";

interface VerifySearch {
  property?: string;
}

export const Route = createFileRoute("/verify")({
  validateSearch: (s: Record<string, unknown>): VerifySearch => {
    const property = s["property"];
    return typeof property === "string" && property.trim() !== ""
      ? { property: property.trim() }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Property Verification · Document Fingerprints" },
      {
        name: "description",
        content:
          "Hash property documents with SHA-256, compare fingerprints and track due-diligence checks.",
      },
      { property: "og:title", content: "Property Verification · Verify Before You Invest" },
      {
        property: "og:description",
        content: "Hash documents in your browser and compare against registered fingerprints.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({ location });
  },
  component: VerifyPageWithGuard,
});

function VerifyPageWithGuard() {
  return (
    <ProtectedRoute>
      <VerifyPage />
    </ProtectedRoute>
  );
}

type Result = "Match" | "Mismatch" | "No Registered Reference";
type TxState = {
  stage: "idle" | "submitting" | "pending" | "success" | "error";
  hash?: string;
  error?: string;
};

function VerifyPage() {
  const { property } = Route.useSearch();
  const navigate = useNavigate({ from: "/verify" });
  const { role } = useAuth();
  const canRegisterDocuments = role === "PROPERTY_ISSUER" || role === "ADMIN";
  const allProperties = useAllProperties();
  const prop =
    (property ? getProperty(property) : undefined) ?? allProperties[0] ?? DEFAULT_PROPERTY;

  const [statuses, setStatuses] = useState<Record<string, DocStatus>>({});
  const [docId, setDocId] = useState(prop.docs[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonSource, setComparisonSource] = useState<"onchain" | "demo" | null>(null);
  const [tx, setTx] = useState<TxState>({ stage: "idle" });
  const activity = useActivity().filter((a) => a.propertyId === prop.id);

  const doc = prop.docs.find((d) => d.id === docId) ?? prop.docs[0];
  const statusOf = (id: string, fallback: DocStatus) => statuses[`${prop.id}:${id}`] ?? fallback;
  const reset = () => {
    setFile(null);
    setHash(null);
    setResult(null);
    setComparisonSource(null);
    setTx({ stage: "idle" });
  };

  async function onFile(f: File | undefined) {
    reset();
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("Unsupported file", { description: "Use PDF, PNG, JPG or WEBP." });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File too large", { description: "Maximum size is 10 MB." });
      return;
    }
    setFile(f);
    setHashing(true);
    const h = await sha256Hex(f);
    setHashing(false);
    setHash(h);
    addActivity({
      kind: "Document hashed",
      propertyId: prop.id,
      detail: `${doc?.type ?? "Document"}: ${f.name} hashed locally`,
      source: "demo",
    });
  }

  async function compare() {
    if (!hash || comparing) return;
    setComparing(true);
    setResult(null);
    try {
      let r: Result;
      let source: "onchain" | "demo" = "demo";
      const referenceHash = doc?.registeredHash || doc?.sha256;

      if (isLiveConfigured()) {
        const candidate = await getRecordOnChain(prop.id, hash);
        let referenceRegistered = false;
        if (referenceHash) {
          const reference =
            hash.toLowerCase() === referenceHash.toLowerCase()
              ? candidate
              : await getRecordOnChain(prop.id, referenceHash);
          referenceRegistered = reference.exists;
        }
        r = compareOnChainFingerprint(
          hash,
          referenceHash ?? "",
          candidate.exists,
          referenceRegistered,
        );
        source = "onchain";
      } else {
        const ref = (doc ? getDemoRef(demoRefKey(prop.id, doc.id)) : undefined) ?? referenceHash;
        r = !ref
          ? "No Registered Reference"
          : ref.toLowerCase() === hash.toLowerCase()
            ? "Match"
            : "Mismatch";
      }
      setResult(r);
      setComparisonSource(source);
      addActivity({
        kind: "Hash compared",
        propertyId: prop.id,
        detail: `${doc?.type ?? "Document"}: ${r}`,
        source,
      });
    } catch (e) {
      toast.error("Could not check the document registry", {
        description: walletErrorMessage(e),
      });
    } finally {
      setComparing(false);
    }
  }

  async function register() {
    if (!hash) return;
    if (!canRegisterDocuments) {
      toast.error(
        "Unauthorized: Only Property Issuers or Administrators can register document fingerprints.",
      );
      return;
    }
    if (isMainnetRegistryUnavailable()) {
      setTx({ stage: "error", error: getRegistryConfigurationMessage() });
      return;
    }
    if (!isLiveConfigured()) {
      if (doc) setDemoRef(demoRefKey(prop.id, doc.id), hash);
      addActivity({
        kind: "Fingerprint registered",
        propertyId: prop.id,
        detail: `${doc?.type ?? "Document"} fingerprint registered (simulated, this session only)`,
        source: "demo",
      });
      setTx({ stage: "success" });
      toast.success("Registered in Demo Mode", {
        description: "Simulated only — no blockchain transaction was sent.",
      });
      return;
    }
    setTx({ stage: "submitting" });
    try {
      const r = await registerOnChain(prop.id, hash, (h) => setTx({ stage: "pending", hash: h }));
      setTx({ stage: "success", hash: r.txHash });
      addActivity({
        kind: "Fingerprint registered",
        propertyId: prop.id,
        detail: `${doc?.type ?? "Document"} fingerprint, block ${r.blockNumber}`,
        source: "onchain",
        txHash: r.txHash,
        explorerUrl: explorerTxUrl(r.txHash),
      });
    } catch (e) {
      setTx({ stage: "error", error: walletErrorMessage(e) });
    }
  }

  const reviewed = prop.docs.filter((d) => statusOf(d.id, d.status) === "Reviewed").length;
  const ResultIcon =
    result === "Match" ? CheckCircle2 : result === "Mismatch" ? XCircle : CircleHelp;

  return (
    <>
      <PageHeader
        title="Property Verification"
        subtitle="Select a property, review its records and calculate/compare document SHA-256 fingerprints in your browser."
      />

      <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
        {allProperties.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              navigate({ search: { property: p.id } });
              setDocId(p.docs[0]?.id ?? "");
              reset();
            }}
            className={`panel min-w-56 p-3 text-left transition-colors ${
              p.id === prop.id ? "border-primary ring-2 ring-primary/20" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
              {p.isUserCreated && <Pill tone="warning">Demo</Pill>}
            </div>
            <p className="text-sm font-semibold truncate mt-1">{p.name}</p>
            <p className="text-xs text-muted-foreground">
              {p.docs.length > 0
                ? `${outstandingChecks(p)} checks outstanding`
                : "No docs attached"}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <section className="panel overflow-hidden">
            <div className="flex flex-col sm:flex-row">
              <img
                src={prop.image}
                alt={prop.name}
                width={1024}
                height={640}
                className="h-40 w-full object-cover sm:h-auto sm:w-56"
              />
              <div className="flex-1 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">{prop.name}</h2>
                  {prop.isUserCreated ? (
                    <Pill tone="warning">Local Demo Property</Pill>
                  ) : (
                    <Pill tone="neutral">Sample Property (Simulated Data)</Pill>
                  )}
                </div>
                {!prop.isUserCreated && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sample property for buildathon demonstration. Values, document references, and
                    hashes are fictional mock data.
                  </p>
                )}
                <p className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {prop.location} · {prop.kind}
                </p>
                <p className="mt-2 text-sm">
                  Indicative value {inr(prop.indicativeValue)}{" "}
                  <span className="text-xs text-muted-foreground">(illustrative)</span>
                </p>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Due-diligence progress</span>
                    <span>
                      {reviewed}/{prop.docs.length} reviewed
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{
                        width: `${prop.docs.length > 0 ? (reviewed / prop.docs.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel overflow-x-auto">
            <h3 className="p-5 pb-3 font-semibold">Due-diligence checklist</h3>
            {prop.docs.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No documents are attached to this property yet. You can calculate and register
                fingerprints below.
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-y bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2">Category / document</th>
                    <th className="px-3 py-2">Reference no.</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-5 py-2">Review status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {prop.docs.map((d) => {
                    const st = statusOf(d.id, d.status);
                    return (
                      <tr key={d.id} className={d.id === doc?.id ? "bg-secondary/50" : ""}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{d.category}</p>
                          <p className="text-xs text-muted-foreground">{d.type}</p>
                          {d.sha256 && (
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate max-w-xs">
                              Hash: {d.sha256}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs">{d.reference}</td>
                        <td className="px-3 py-3 text-xs">{d.date}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Pill tone={statusTone(st)}>{st}</Pill>
                            <select
                              aria-label={`Change status for ${d.type}`}
                              className="rounded-md border bg-card px-1 py-0.5 text-xs"
                              value={st}
                              onChange={(e) => {
                                const v = e.target.value as DocStatus;
                                setStatuses((s) => ({ ...s, [`${prop.id}:${d.id}`]: v }));
                                addActivity({
                                  kind: "Status update",
                                  propertyId: prop.id,
                                  detail: `${d.type} marked ${v}`,
                                  source: "demo",
                                });
                              }}
                            >
                              {(
                                [
                                  "Pending Review",
                                  "Reviewed",
                                  "Missing",
                                  "Requires Attention",
                                ] as DocStatus[]
                              ).map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="p-5 pt-3 text-xs text-muted-foreground">
              7/12 extract, property card and mutation entries apply only where relevant to the
              property type and jurisdiction.
            </p>
          </section>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <section className="panel p-5">
            <h3 className="font-semibold">Document fingerprint</h3>
            <p className="text-xs text-muted-foreground">
              The file is hashed in your browser. Its contents are never uploaded.
            </p>
            {isMainnetRegistryUnavailable() && (
              <p
                className="mt-3 rounded-md bg-muted p-3 text-xs text-muted-foreground"
                role="status"
              >
                {getRegistryConfigurationMessage()} Demo comparisons use simulated references only.
              </p>
            )}

            {prop.docs.length > 0 && (
              <>
                <label className="mt-4 block text-xs font-medium">Document to Verify</label>
                <select
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  value={doc?.id ?? ""}
                  onChange={(e) => {
                    setDocId(e.target.value);
                    reset();
                  }}
                >
                  {prop.docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.type} {d.fileName ? `(${d.fileName})` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/50">
              <FileUp className="h-6 w-6 text-gold" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose a PDF or image"}
              </span>
              <span className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP · max 10 MB</span>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>

            {hashing && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating SHA-256…
              </p>
            )}

            {hash && (
              <div className="mt-4">
                <p className="text-xs font-medium">Calculated SHA-256 Fingerprint</p>
                <p className="mt-1 break-all rounded-md bg-muted p-2 font-mono text-xs">{hash}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={compare} disabled={comparing || hashing}>
                    {comparing ? "Checking registry…" : "Compare with reference"}
                  </Button>
                  {canRegisterDocuments ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={register}
                      disabled={
                        tx.stage === "submitting" ||
                        tx.stage === "pending" ||
                        isMainnetRegistryUnavailable()
                      }
                    >
                      {isMainnetRegistryUnavailable()
                        ? "Mainnet contract unavailable"
                        : isLiveConfigured()
                          ? `Register on ${chainConfig.networkName ?? "MST"}`
                          : "Register (Demo Mode)"}
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground self-center italic">
                      Document registration restricted to Property Issuers / Admins.
                    </span>
                  )}
                </div>
              </div>
            )}

            {result && (
              <div
                className={`mt-4 flex gap-3 rounded-lg border p-3 text-sm ${
                  result === "Match"
                    ? "border-success/40 bg-success/10"
                    : result === "Mismatch"
                      ? "border-destructive/40 bg-destructive/10"
                      : "bg-muted"
                }`}
              >
                <ResultIcon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">{result}</p>
                  <p className="text-xs text-muted-foreground">
                    {result === "Match" &&
                      "The file is identical to the reference fingerprint. This does not confirm ownership, legal title, or authenticity."}
                    {result === "Mismatch" &&
                      "The file differs from the reference fingerprint. It may be a different version or modified document."}
                    {result === "No Registered Reference" &&
                      "No registered reference fingerprint was found for this document slot. You can register this fingerprint in demo mode or on-chain."}
                  </p>
                  {comparisonSource && (
                    <p className="mt-2 text-[11px] uppercase tracking-wide">
                      {comparisonSource === "onchain"
                        ? "Checked against configured on-chain registry"
                        : "Checked against local demo reference"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {tx.stage !== "idle" && (
              <div className="mt-3 text-xs">
                {tx.stage === "submitting" && (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Awaiting wallet confirmation…
                  </p>
                )}
                {tx.stage === "pending" && (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Pending: <span className="font-mono">{tx.hash}</span>
                  </p>
                )}
                {tx.stage === "success" &&
                  (tx.hash ? (
                    <p className="text-success">
                      Confirmed:{" "}
                      {explorerTxUrl(tx.hash) ? (
                        <a
                          className="font-mono underline"
                          href={explorerTxUrl(tx.hash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {tx.hash}
                        </a>
                      ) : (
                        <span className="font-mono">{tx.hash}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Simulated registration saved for this session. No blockchain transaction was
                      sent.
                    </p>
                  ))}
                {tx.stage === "error" && <p className="text-destructive">Error: {tx.error}</p>}
              </div>
            )}
          </section>

          <PropertyRegistry />

          <section className="panel p-5">
            <h3 className="mb-3 font-semibold">Activity timeline</h3>
            <ol className="space-y-3 border-l pl-4">
              {activity.slice(0, 8).map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  <p className="text-sm font-medium">
                    {a.kind}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {a.source === "onchain" ? "on-chain confirmed" : "simulated local event"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </li>
              ))}
              {!activity.length && (
                <li className="text-sm text-muted-foreground">No activity yet.</li>
              )}
            </ol>
          </section>
        </div>
      </div>

      <div className="mt-6">
        <Disclaimer>
          This tool does not independently verify government records, confirm legal ownership, or
          establish that a property is free of litigation. A hash match only shows that a file is
          identical to a previously registered fingerprint. Consult a qualified advocate for title
          due diligence. Document contents are never written to a blockchain.
        </Disclaimer>
      </div>
    </>
  );
}
