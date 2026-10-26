import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ALLOWED_TYPES,
  chainConfig,
  explorerTxUrl,
  getRecordOnChain,
  isLiveConfigured,
  MAX_BYTES,
  registerOnChain,
  sha256Hex,
} from "@/lib/blockchain";

type RegistryResult =
  | { type: "pending"; txHash: string }
  | { type: "not-found"; hash: string }
  | { type: "found"; hash: string; submitter: string; timestamp: string }
  | { type: "registered"; hash: string; txHash: string }
  | { type: "error"; message: string };

export default function PropertyRegistry() {
  const [propertyId, setPropertyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<RegistryResult | null>(null);
  const [loading, setLoading] = useState<"register" | "verify" | null>(null);

  async function runRegistryAction(action: "register" | "verify") {
    if (loading) return;
    setResult(null);

    const id = propertyId.trim();
    const idLength = new TextEncoder().encode(id).length;
    if (!id || idLength > 64) {
      setResult({ type: "error", message: "Enter a property ID between 1 and 64 UTF-8 bytes." });
      return;
    }
    if (!file) {
      setResult({ type: "error", message: "Choose a document file first." });
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setResult({ type: "error", message: "Choose a PDF, PNG, JPG, or WEBP document." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setResult({ type: "error", message: "The document must be 10 MB or smaller." });
      return;
    }
    if (!isLiveConfigured()) {
      setResult({
        type: "error",
        message:
          "The MST registry is not configured. Copy .env.example to .env and set the VITE_MST_* values.",
      });
      return;
    }

    setLoading(action);
    try {
      const hash = await sha256Hex(file);
      if (action === "verify") {
        const record = await getRecordOnChain(id, hash);
        setResult(
          record.exists
            ? { type: "found", hash, submitter: record.submitter, timestamp: record.timestamp }
            : { type: "not-found", hash },
        );
        return;
      }

      const registration = await registerOnChain(id, hash, (txHash) => {
        setResult({ type: "pending", txHash });
      });
      setResult({ type: "registered", hash, txHash: registration.txHash });
    } catch (error: unknown) {
      setResult({
        type: "error",
        message: error instanceof Error ? error.message : "The registry request failed.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="property-registry-heading">
      <div>
        <h3 id="property-registry-heading" className="font-semibold">
          On-chain document registry
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The file is SHA-256 hashed in your browser. Only its fingerprint and property ID are sent
          to the contract.
        </p>
      </div>

      <div>
        <label htmlFor="registry-property-id" className="text-xs font-medium">
          Property ID
        </label>
        <input
          id="registry-property-id"
          className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
          placeholder="e.g. PRP-PUN-0142"
          maxLength={64}
          autoComplete="off"
        />
      </div>

      <div>
        <label
          htmlFor="registry-document"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center hover:bg-muted/50"
        >
          <FileUp className="h-5 w-5 text-gold" />
          <span className="text-sm font-medium">{file ? file.name : "Choose a document"}</span>
          <span className="text-xs text-muted-foreground">PDF, PNG, JPG, WEBP · max 10 MB</span>
        </label>
        <input
          id="registry-document"
          type="file"
          className="sr-only"
          accept=".pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
      </div>

      {!isLiveConfigured() && (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Live registry actions are disabled until MST Testnet settings are configured. The existing
          verification flow remains available in Demo Mode.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void runRegistryAction("register")}
          disabled={loading !== null || !isLiveConfigured()}
        >
          {loading === "register" && <Loader2 className="animate-spin" />}
          Register Document
        </Button>
        <Button
          variant="outline"
          onClick={() => void runRegistryAction("verify")}
          disabled={loading !== null || !isLiveConfigured()}
        >
          {loading === "verify" && <Loader2 className="animate-spin" />}
          Verify Document
        </Button>
      </div>

      {result && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.type === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : result.type === "not-found"
                ? "border-warning/40 bg-warning/10 text-foreground"
                : "border-success/30 bg-success/10 text-foreground"
          }`}
          role={result.type === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {result.type === "error" && <p>{result.message}</p>}
          {result.type === "pending" && (
            <p className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Transaction submitted; waiting for confirmation.{" "}
              <span className="break-all font-mono">{result.txHash}</span>
            </p>
          )}
          {result.type === "not-found" && (
            <>
              <p className="font-semibold">No registered record found</p>
              <p className="mt-1 text-xs">
                No record exists for this property ID and document hash.
              </p>
              <p className="mt-2 break-all font-mono text-xs">SHA-256: {result.hash}</p>
            </>
          )}
          {result.type === "found" && (
            <>
              <p className="font-semibold">Document verified</p>
              <p className="mt-1 text-xs">
                Submitter: <span className="break-all font-mono">{result.submitter}</span>
              </p>
              <p className="text-xs">
                Registered: {new Date(Number(result.timestamp) * 1000).toLocaleString()}
              </p>
              <p className="mt-2 break-all font-mono text-xs">SHA-256: {result.hash}</p>
            </>
          )}
          {result.type === "registered" && (
            <>
              <p className="font-semibold">Registration confirmed on-chain</p>
              <p className="mt-1 break-all font-mono text-xs">{result.txHash}</p>
              {explorerTxUrl(result.txHash) && (
                <a
                  className="mt-2 inline-block underline"
                  href={explorerTxUrl(result.txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction on {chainConfig.networkName ?? "network"} explorer
                </a>
              )}
              <p className="mt-2 break-all font-mono text-xs">SHA-256: {result.hash}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
