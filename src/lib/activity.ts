import { useSyncExternalStore } from "react";

export interface ActivityRecord {
  id: string;
  time: string; // ISO
  kind: "Document hashed" | "Hash compared" | "Fingerprint registered" | "Contribution" | "Status update";
  propertyId: string;
  detail: string;
  /** "demo" = simulated, never a real chain record. "onchain" = confirmed on a real network. */
  source: "demo" | "onchain";
  txHash?: string;
  explorerUrl?: string;
}

const SEED: ActivityRecord[] = [
  { id: "s1", time: "2026-10-20T09:12:00Z", kind: "Fingerprint registered", propertyId: "PRP-PUN-0142", detail: "Sale deed fingerprint registered (simulated)", source: "demo", txHash: "DEMO-0001" },
  { id: "s2", time: "2026-10-21T14:40:00Z", kind: "Contribution", propertyId: "PRP-MUM-0087", detail: "Hypothetical contribution of ₹2,50,000 (sample investor)", source: "demo", txHash: "DEMO-0002" },
  { id: "s3", time: "2026-10-22T11:05:00Z", kind: "Status update", propertyId: "PRP-PUN-0142", detail: "Mutation entry marked Requires Attention", source: "demo" },
  { id: "s4", time: "2026-10-23T16:20:00Z", kind: "Contribution", propertyId: "PRP-NSK-0219", detail: "Hypothetical contribution of ₹1,00,000 (sample investor)", source: "demo", txHash: "DEMO-0003" },
];

let records: ActivityRecord[] = SEED;
const listeners = new Set<() => void>();
let counter = 4;

export function addActivity(r: Omit<ActivityRecord, "id" | "time"> & { time?: string }) {
  counter += 1;
  const rec: ActivityRecord = { id: `r${counter}`, time: r.time ?? new Date().toISOString(), ...r };
  if (rec.source === "demo" && rec.txHash === undefined && (rec.kind === "Contribution" || rec.kind === "Fingerprint registered"))
    rec.txHash = `DEMO-${String(counter).padStart(4, "0")}`;
  records = [rec, ...records];
  listeners.forEach((l) => l());
  return rec;
}

export function useActivity() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => records,
    () => SEED,
  );
}

/** In-session demo reference fingerprints registered by the user (never sent anywhere). */
const demoRefs = new Map<string, string>();
export const demoRefKey = (propertyId: string, docId: string) => `${propertyId}:${docId}`;
export function setDemoRef(key: string, hash: string) {
  demoRefs.set(key, hash);
}
export function getDemoRef(key: string) {
  return demoRefs.get(key);
}
