import prop1 from "@/assets/prop1.jpg";
import prop2 from "@/assets/prop2.jpg";
import prop3 from "@/assets/prop3.jpg";

export type DocStatus = "Pending Review" | "Reviewed" | "Missing" | "Requires Attention";

export interface PropertyDoc {
  id: string;
  category: string;
  type: string;
  reference: string;
  date: string;
  status: DocStatus;
  /** Fictional reference fingerprint (SHA-256 hex) registered for this document, if any. */
  registeredHash?: string;
}

export interface Property {
  id: string;
  name: string;
  location: string;
  kind: string;
  image: string;
  indicativeValue: number; // INR, illustrative
  poolSize: number; // INR, illustrative pool open for fractional contribution
  unitPrice: number; // INR per hypothetical unit
  monthlyRent: number; // INR, illustrative
  docs: PropertyDoc[];
}

const H = (seed: string) => seed.padEnd(64, "0").slice(0, 64);

export const PROPERTIES: Property[] = [
  {
    id: "PRP-PUN-0142",
    name: "Sample Residency, Tower B",
    location: "Baner, Pune, Maharashtra",
    kind: "Residential apartment",
    image: prop1,
    indicativeValue: 12_500_000,
    poolSize: 10_000_000,
    unitPrice: 1_000,
    monthlyRent: 42_000,
    docs: [
      { id: "D1", category: "Sale deed / title", type: "Registered sale deed", reference: "SD-DEMO-2019-4471", date: "2019-08-14", status: "Reviewed", registeredHash: H("9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6") },
      { id: "D2", category: "7/12 extract", type: "Satbara utara (7/12)", reference: "712-DEMO-BNR-118", date: "2024-02-03", status: "Pending Review" },
      { id: "D3", category: "Property card", type: "City survey property card", reference: "PC-DEMO-3390", date: "2023-11-21", status: "Reviewed" },
      { id: "D4", category: "Mutation entries", type: "Ferfar / mutation entry", reference: "MUT-DEMO-772", date: "2020-01-10", status: "Requires Attention" },
      { id: "D5", category: "Encumbrance records", type: "Encumbrance search report", reference: "ENC-DEMO-0912", date: "2024-05-30", status: "Missing" },
      { id: "D6", category: "Court & dispute checks", type: "Litigation search summary", reference: "LIT-DEMO-0045", date: "2024-06-02", status: "Pending Review" },
      { id: "D7", category: "Property tax", type: "Property tax receipt FY24", reference: "PTX-DEMO-2024-88", date: "2024-04-18", status: "Reviewed" },
    ],
  },
  {
    id: "PRP-MUM-0087",
    name: "Sample Commerce House",
    location: "Andheri East, Mumbai, Maharashtra",
    kind: "Commercial office",
    image: prop2,
    indicativeValue: 48_000_000,
    poolSize: 30_000_000,
    unitPrice: 5_000,
    monthlyRent: 260_000,
    docs: [
      { id: "D1", category: "Sale deed / title", type: "Conveyance deed", reference: "CD-DEMO-2016-2208", date: "2016-03-09", status: "Reviewed" },
      { id: "D2", category: "Property card", type: "Property card extract", reference: "PC-DEMO-8812", date: "2024-01-15", status: "Reviewed" },
      { id: "D3", category: "Encumbrance records", type: "Encumbrance search report", reference: "ENC-DEMO-5521", date: "2024-03-11", status: "Pending Review" },
      { id: "D4", category: "Court & dispute checks", type: "Litigation search summary", reference: "LIT-DEMO-0310", date: "2024-03-12", status: "Requires Attention" },
      { id: "D5", category: "Property tax", type: "Property tax receipt FY24", reference: "PTX-DEMO-2024-12", date: "2024-04-02", status: "Reviewed" },
      { id: "D6", category: "Supporting records", type: "Occupancy certificate", reference: "OC-DEMO-0077", date: "2015-12-01", status: "Missing" },
    ],
  },
  {
    id: "PRP-NSK-0219",
    name: "Sample Garden Villa 12",
    location: "Gangapur Road, Nashik, Maharashtra",
    kind: "Independent villa",
    image: prop3,
    indicativeValue: 18_500_000,
    poolSize: 12_000_000,
    unitPrice: 2_000,
    monthlyRent: 55_000,
    docs: [
      { id: "D1", category: "Sale deed / title", type: "Registered sale deed", reference: "SD-DEMO-2021-0193", date: "2021-07-22", status: "Reviewed" },
      { id: "D2", category: "7/12 extract", type: "Satbara utara (7/12)", reference: "712-DEMO-GNP-044", date: "2024-02-19", status: "Reviewed" },
      { id: "D3", category: "Mutation entries", type: "Ferfar / mutation entry", reference: "MUT-DEMO-311", date: "2021-09-05", status: "Reviewed" },
      { id: "D4", category: "Encumbrance records", type: "Encumbrance search report", reference: "ENC-DEMO-7710", date: "2024-06-10", status: "Pending Review" },
      { id: "D5", category: "Court & dispute checks", type: "Litigation search summary", reference: "LIT-DEMO-0128", date: "2024-06-11", status: "Reviewed" },
      { id: "D6", category: "Property tax", type: "Property tax receipt FY24", reference: "PTX-DEMO-2024-51", date: "2024-05-01", status: "Pending Review" },
    ],
  },
];

export function getProperty(id: string) {
  return PROPERTIES.find((p) => p.id === id);
}

export function outstandingChecks(p: Property) {
  return p.docs.filter((d) => d.status !== "Reviewed").length;
}

export function verificationLabel(p: Property): { label: string; tone: "success" | "warning" | "destructive" } {
  if (p.docs.some((d) => d.status === "Missing" || d.status === "Requires Attention"))
    return { label: "Checks outstanding", tone: "destructive" };
  if (p.docs.some((d) => d.status === "Pending Review")) return { label: "Under review", tone: "warning" };
  return { label: "Documents reviewed", tone: "success" };
}

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
