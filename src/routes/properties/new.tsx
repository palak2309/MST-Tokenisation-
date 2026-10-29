import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  FileCheck2,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclaimer, PageHeader, Pill } from "@/components/AppShell";
import {
  calculatePropertyFinances,
  FINANCIAL_DISCLAIMER,
  type PropertyFinancialResults,
} from "@/lib/finance";
import {
  generatePropertyId,
  getPropertyById,
  isSampleProperty,
  saveUserProperty,
  updateUserProperty,
} from "@/lib/propertyStore";
import { ALLOWED_TYPES, MAX_BYTES, sha256Hex } from "@/lib/blockchain";
import { addActivity } from "@/lib/activity";
import { inr, type Property, type PropertyDoc } from "@/lib/data";
import prop1 from "@/assets/prop1.jpg";
import prop2 from "@/assets/prop2.jpg";
import prop3 from "@/assets/prop3.jpg";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";

interface FormErrors {
  propertyId?: string;
  name?: string;
  location?: string;
  indicativeValue?: string;
  monthlyRent?: string;
  vacancyPct?: string;
  monthlyOperating?: string;
  monthlyMaintenance?: string;
  capRatePct?: string;
  unitPrice?: string;
  tokenPool?: string;
}

interface NewPropertySearch {
  edit?: string;
}

export const Route = createFileRoute("/properties/new")({
  validateSearch: (s: Record<string, unknown>): NewPropertySearch => {
    const edit = s["edit"];
    return typeof edit === "string" && edit.trim() !== "" ? { edit: edit.trim() } : {};
  },
  head: () => ({
    meta: [
      { title: "Add Property · Tokenisation Proposal & Document Hashing" },
      {
        name: "description",
        content:
          "Register a demo property, hash supporting title documents locally with SHA-256, and compute illustrative financial returns.",
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    return await requireAuthLoader({
      location,
      requiredRole: ["PROPERTY_ISSUER", "ADMIN"],
    });
  },
  component: AddPropertyPageWithGuard,
});

function AddPropertyPageWithGuard() {
  return (
    <ProtectedRoute requiredRole={["PROPERTY_ISSUER", "ADMIN"]}>
      <AddPropertyPage />
    </ProtectedRoute>
  );
}

const DOCUMENT_CATEGORIES = [
  "Sale deed / title",
  "Property tax receipt",
  "Approved building plan",
  "Encumbrance certificate",
  "7/12 extract / City survey",
  "Mutation entries",
  "Identity or ownership-supporting documents",
] as const;

interface UploadedDocItem {
  id: string;
  category: string;
  type: string;
  reference: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  sha256: string;
  status: "Hash calculated";
  date: string;
}

function AddPropertyPage() {
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isEditing = Boolean(edit);

  // Form states
  const [propertyId, setPropertyId] = useState(() => (edit ? "" : generatePropertyId()));
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState<"residential" | "commercial" | "land">(
    "residential",
  );
  const [location, setLocation] = useState("");
  const [indicativeValue, setIndicativeValue] = useState<number>(12_500_000);
  const [monthlyRent, setMonthlyRent] = useState<number>(45_000);
  const [vacancyPct, setVacancyPct] = useState<number>(5);
  const [monthlyOperating, setMonthlyOperating] = useState<number>(4_000);
  const [monthlyMaintenance, setMonthlyMaintenance] = useState<number>(3_500);
  const [capRatePct, setCapRatePct] = useState<number>(6.0);
  const [tokenPool, setTokenPool] = useState<number>(10_000_000);
  const [unitPrice, setUnitPrice] = useState<number>(1_000);
  const [description, setDescription] = useState("");

  // Document upload states
  const [docs, setDocs] = useState<UploadedDocItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [hashingFile, setHashingFile] = useState(false);

  // Review step toggle
  const [previewMode, setPreviewMode] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or load edit data
  useEffect(() => {
    if (edit) {
      const existing = getPropertyById(edit);
      if (existing) {
        setPropertyId(existing.id);
        setName(existing.name);
        setPropertyType(existing.propertyType || "residential");
        setLocation(existing.location);
        setIndicativeValue(existing.indicativeValue);
        setMonthlyRent(existing.monthlyRent);
        setVacancyPct(existing.vacancyPct ?? 5);
        setMonthlyOperating(existing.monthlyOperating ?? 0);
        setMonthlyMaintenance(existing.monthlyMaintenance ?? 0);
        setCapRatePct(existing.capRatePct ?? 6);
        setTokenPool(existing.poolSize);
        setUnitPrice(existing.unitPrice);
        setDescription(existing.description ?? "");

        if (existing.docs) {
          const loadedDocs: UploadedDocItem[] = existing.docs.map((d, index) => ({
            id: d.id || `D${index + 1}`,
            category: d.category,
            type: d.type,
            reference: d.reference,
            fileName: d.fileName || `${d.type}.pdf`,
            fileSize: d.fileSize || 512000,
            fileType: d.fileType || "application/pdf",
            sha256: d.sha256 || d.registeredHash || "0".repeat(64),
            status: "Hash calculated",
            date: d.date || new Date().toISOString().split("T")[0]!,
          }));
          setDocs(loadedDocs);
        }
      } else {
        toast.error(`Property "${edit}" not found.`);
        navigate({ to: "/properties/new", search: () => ({}) });
      }
    }
  }, [edit, navigate]);

  // Financial calculations
  const finances: PropertyFinancialResults = useMemo(() => {
    return calculatePropertyFinances({
      monthlyGrossRent: monthlyRent,
      vacancyPct,
      monthlyOperatingExpenses: monthlyOperating,
      monthlyMaintenanceExpenses: monthlyMaintenance,
      indicativeMarketValue: indicativeValue,
      capRatePct,
      tokenisationPool: tokenPool,
      tokenPricePerUnit: unitPrice,
    });
  }, [
    monthlyRent,
    vacancyPct,
    monthlyOperating,
    monthlyMaintenance,
    indicativeValue,
    capRatePct,
    tokenPool,
    unitPrice,
  ]);

  // Validation function
  function validateForm(): boolean {
    const errs: FormErrors = {};

    if (!propertyId.trim()) {
      errs.propertyId = "Property ID is required.";
    } else {
      const bytes = new TextEncoder().encode(propertyId.trim()).length;
      if (bytes < 1 || bytes > 64) {
        errs.propertyId = "Property ID must be between 1 and 64 UTF-8 bytes.";
      } else if (!/^[a-zA-Z0-9_-]+$/.test(propertyId.trim())) {
        errs.propertyId = "ID may only contain letters, numbers, hyphens, and underscores.";
      } else if (!isEditing && isSampleProperty(propertyId.trim())) {
        errs.propertyId = "This ID matches a protected sample property. Choose a different ID.";
      } else if (!isEditing && getPropertyById(propertyId.trim())) {
        errs.propertyId = `A property with ID "${propertyId.trim()}" already exists.`;
      }
    }

    if (!name.trim()) errs.name = "Property name is required.";
    if (!location.trim()) errs.location = "Full location is required.";

    if (!indicativeValue || indicativeValue <= 0) {
      errs.indicativeValue = "Indicative market value must be greater than zero.";
    }

    if (monthlyRent < 0) {
      errs.monthlyRent = "Monthly rent cannot be negative.";
    }

    if (vacancyPct < 0 || vacancyPct > 100) {
      errs.vacancyPct = "Vacancy allowance must be between 0% and 100%.";
    }

    if (monthlyOperating < 0) {
      errs.monthlyOperating = "Operating expenses cannot be negative.";
    }

    if (monthlyMaintenance < 0) {
      errs.monthlyMaintenance = "Maintenance expenses cannot be negative.";
    }

    if (capRatePct <= 0) {
      errs.capRatePct = "Cap rate must be greater than 0% for valuation.";
    }

    if (unitPrice <= 0) {
      errs.unitPrice = "Token unit price must be greater than zero.";
    }

    if (tokenPool <= 0) {
      errs.tokenPool = "Tokenisation pool must be greater than zero.";
    } else if (tokenPool < unitPrice) {
      errs.tokenPool = `Tokenisation pool must be at least the price of one unit (${inr(unitPrice)}).`;
    } else if (tokenPool % unitPrice !== 0) {
      errs.tokenPool = `Tokenisation pool must divide evenly by token price (${inr(unitPrice)}) for whole tokens. Suggested: ${inr(Math.floor(tokenPool / unitPrice) * unitPrice)}.`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // Handle document file selections
  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setHashingFile(true);

    const newDocs: UploadedDocItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!;

      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" rejected`, {
          description: "Unsupported file type. Accepted: PDF, PNG, JPG/JPEG, WEBP.",
        });
        continue;
      }

      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}" rejected`, {
          description: "File size exceeds 10 MB limit.",
        });
        continue;
      }

      try {
        const hash = await sha256Hex(file);
        const docItem: UploadedDocItem = {
          id: `DOC-${Date.now().toString().slice(-4)}-${i + 1}`,
          category: selectedCategory,
          type: selectedCategory,
          reference: `REF-${file.name
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 8)
            .toUpperCase()}`,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          sha256: hash,
          status: "Hash calculated",
          date: new Date().toISOString().split("T")[0]!,
        };
        newDocs.push(docItem);

        addActivity({
          kind: "Document hashed",
          propertyId: propertyId.trim() || "PRP-DEMO",
          detail: `${file.name} hashed with SHA-256: ${hash.slice(0, 16)}…`,
          source: "demo",
        });
      } catch (err) {
        console.error("Hashing error:", err);
        toast.error(`Failed to hash ${file.name}`);
      }
    }

    setHashingFile(false);
    if (newDocs.length > 0) {
      setDocs((prev) => [...prev, ...newDocs]);
      toast.success(`Hashed ${newDocs.length} file(s) with Web Crypto SHA-256.`);
    }
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  function handleProceedToPreview(e: React.FormEvent) {
    e.preventDefault();
    if (validateForm()) {
      setPreviewMode(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      toast.error("Please correct the form validation errors before preview.");
    }
  }

  function handleSaveProperty() {
    if (!validateForm()) {
      setPreviewMode(false);
      return;
    }

    setIsSubmitting(true);

    const propertyDocs: PropertyDoc[] = docs.map((d) => ({
      id: d.id,
      category: d.category,
      type: d.type,
      reference: d.reference,
      date: d.date,
      status: "Reviewed",
      registeredHash: d.sha256,
      fileName: d.fileName,
      fileSize: d.fileSize,
      fileType: d.fileType,
      sha256: d.sha256,
      fingerprintStatus: "Hash calculated",
    }));

    const propertyRecord: Property = {
      id: propertyId.trim(),
      name: name.trim(),
      location: location.trim(),
      kind:
        propertyType === "residential"
          ? "Residential apartment"
          : propertyType === "commercial"
            ? "Commercial office"
            : "Land parcel",
      propertyType,
      image: propertyType === "commercial" ? prop2 : propertyType === "land" ? prop3 : prop1,
      indicativeValue,
      poolSize: tokenPool,
      unitPrice,
      monthlyRent,
      vacancyPct,
      monthlyOperating,
      monthlyMaintenance,
      capRatePct,
      maxSupply: finances.maximumTokenSupply,
      description: description.trim() || undefined,
      docs: propertyDocs,
      isUserCreated: true,
    };

    if (role !== "PROPERTY_ISSUER" && role !== "ADMIN") {
      setIsSubmitting(false);
      toast.error(
        "Unauthorized: Only Property Issuers or Administrators can create or update properties.",
      );
      return;
    }

    let result;
    if (isEditing) {
      result = updateUserProperty(propertyRecord.id, propertyRecord);
    } else {
      result = saveUserProperty(propertyRecord);
    }

    setIsSubmitting(false);

    if (result.success) {
      toast.success(
        isEditing
          ? `Property "${propertyRecord.name}" updated successfully.`
          : `Property "${propertyRecord.name}" saved to local demo records.`,
      );
      navigate({ to: "/" });
    } else {
      toast.error(result.error || "Failed to save property.");
    }
  }

  return (
    <>
      <PageHeader
        title={isEditing ? "Edit Demo Property" : "Add Property"}
        subtitle={
          isEditing
            ? `Editing local demo property ${propertyId}. Changes are persisted in your browser.`
            : "Propose a property for fractional tokenisation. Calculate financial metrics and hash documents locally."
        }
      >
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
      </PageHeader>

      {/* Review Screen (Preview Mode) */}
      {previewMode ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <div>
                <h2 className="font-semibold text-foreground">Review &amp; Calculation Preview</h2>
                <p className="text-xs text-muted-foreground">
                  Verify the property inputs and financial algorithms below before saving.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewMode(false)}>
                Back to Edit
              </Button>
              <Button onClick={handleSaveProperty} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save Demo Property
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Property Overview */}
            <section className="panel space-y-4 p-5">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-semibold">Property Summary</h3>
                <Pill tone="warning">Local Demo Record</Pill>
              </div>

              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Property ID</dt>
                  <dd className="font-mono font-medium">{propertyId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Type</dt>
                  <dd className="capitalize font-medium">{propertyType}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Property Name</dt>
                  <dd className="text-base font-semibold">{name}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd className="text-muted-foreground">{location}</dd>
                </div>
                {description && (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Description</dt>
                    <dd className="text-xs text-muted-foreground">{description}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Tokenisation Proposal Breakdown */}
            <section className="panel space-y-4 p-5">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-semibold">Tokenisation Proposal</h3>
                <Pill tone="neutral">Illustrative Proposal</Pill>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Proposed Pool</p>
                  <p className="text-base font-semibold text-primary">{inr(tokenPool)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit Price</p>
                  <p className="text-base font-semibold">{inr(unitPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max Supply</p>
                  <p className="text-base font-semibold text-gold">
                    {finances.maximumTokenSupply.toLocaleString("en-IN")} units
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  • <strong>Formula:</strong> Max token supply = floor(Tokenisation Pool / Price per
                  unit)
                </p>
                <p>
                  • <strong>Divisibility:</strong>{" "}
                  {finances.isPoolDivisible ? (
                    <span className="text-success font-medium">
                      Pool divides evenly into whole units.
                    </span>
                  ) : (
                    <span className="text-destructive font-medium">Non-integer pool division.</span>
                  )}
                </p>
                <p className="rounded bg-accent/40 p-2 text-[11px] text-accent-foreground">
                  <strong>Notice:</strong> Proposed token supply is an informational calculation
                  only. No tokens are minted or issued on-chain until an authorised transaction is
                  broadcast to the network.
                </p>
              </div>
            </section>
          </div>

          {/* Real Property Financial Algorithm Breakdown */}
          <section className="panel space-y-5 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-semibold">Financial Algorithm Breakdown</h3>
                <p className="text-xs text-muted-foreground">
                  Exact mathematical pipeline based on rental revenue, vacancy allowance, expenses,
                  and cap rate.
                </p>
              </div>
              <Pill tone="neutral">All values illustrative</Pill>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <span className="text-xs text-muted-foreground">Annual Gross Rent</span>
                <p className="mt-1 text-xl font-semibold">{inr(finances.annualGrossRent)}</p>
                <span className="text-[11px] text-muted-foreground">
                  {inr(monthlyRent)}/mo × 12
                </span>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <span className="text-xs text-muted-foreground">
                  Vacancy Allowance ({vacancyPct}%)
                </span>
                <p className="mt-1 text-xl font-semibold text-destructive/90">
                  −{inr(finances.annualVacancyAllowance)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Effective: {inr(finances.effectiveAnnualRentalIncome)}
                </span>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <span className="text-xs text-muted-foreground">Annual Expenses</span>
                <p className="mt-1 text-xl font-semibold text-destructive/90">
                  −{inr(finances.annualOperatingExpenses)}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Op: {inr(monthlyOperating * 12)} | Maint: {inr(monthlyMaintenance * 12)}
                </span>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <span className="text-xs text-muted-foreground">Net Operating Income (NOI)</span>
                <p
                  className={`mt-1 text-xl font-semibold ${finances.netOperatingIncome >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {inr(finances.netOperatingIncome)}
                </p>
                <span className="text-[11px] text-muted-foreground">Effective Rent − Expenses</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Net Rental Yield
                  </span>
                  <Pill tone="success">Yield</Pill>
                </div>
                <p className="mt-2 text-2xl font-bold">{finances.netRentalYield.toFixed(2)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Formula: (NOI {inr(finances.netOperatingIncome)} / Market Value{" "}
                  {inr(indicativeValue)}) × 100
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Income-Based Valuation
                  </span>
                  <Pill tone="neutral">Cap rate {capRatePct}%</Pill>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {finances.incomeBasedValuation
                    ? inr(finances.incomeBasedValuation)
                    : "Not applicable (NOI ≤ 0)"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Formula: NOI {inr(finances.netOperatingIncome)} / ({capRatePct}% / 100)
                </p>
              </div>
            </div>
          </section>

          {/* Supporting Documents & SHA-256 Hashes */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-semibold">
                  Supporting Documents &amp; Browser SHA-256 Fingerprints
                </h3>
                <p className="text-xs text-muted-foreground">
                  Documents are processed in the browser. Contents are not uploaded anywhere.
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {docs.length} document(s) attached
              </span>
            </div>

            {docs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No supporting documents attached yet. You can still save the demo property and add
                documents later.
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium truncate">{d.fileName}</span>
                        <Pill tone="neutral">{d.category}</Pill>
                      </div>
                      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span>SHA-256:</span>
                        <span className="truncate">{d.sha256}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Size: {(d.fileSize / 1024).toFixed(1)} KB · Date: {d.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone="warning">Hash calculated (Local)</Pill>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-accent-foreground">
              <strong>Notice:</strong> Document fingerprints are calculated locally using the
              browser's Web Crypto API. A SHA-256 hash alone does not prove legal title, ownership,
              or authenticity without independent legal review.
            </div>
          </section>

          {/* Review Actions */}
          <div className="flex items-center justify-between rounded-xl border bg-card p-4">
            <Button variant="outline" onClick={() => setPreviewMode(false)}>
              <ArrowLeft className="h-4 w-4" /> Back to Edit
            </Button>
            <Button onClick={handleSaveProperty} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save Demo Property
            </Button>
          </div>

          <Disclaimer>{FINANCIAL_DISCLAIMER}</Disclaimer>
        </div>
      ) : (
        /* Form Edit Mode */
        <form onSubmit={handleProceedToPreview} className="space-y-6">
          {/* Section 1: Property Identification & Details */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-semibold text-lg">1. Property Identification</h2>
              <span className="text-xs text-muted-foreground">Required fields marked *</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="property-id" className="text-xs font-medium">
                  Unique Property ID *
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="property-id"
                    type="text"
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    disabled={isEditing}
                    placeholder="e.g. PRP-DEMO-1234"
                    className="w-full rounded-md border bg-card px-3 py-2 font-mono text-sm uppercase"
                  />
                  {!isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPropertyId(generatePropertyId())}
                      title="Generate new ID"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {errors.propertyId && (
                  <p className="mt-1 text-xs text-destructive">{errors.propertyId}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  1-64 UTF-8 bytes. Compatible with on-chain registry contracts.
                </p>
              </div>

              <div>
                <label htmlFor="property-type" className="text-xs font-medium">
                  Property Type *
                </label>
                <select
                  id="property-type"
                  value={propertyType}
                  onChange={(e) =>
                    setPropertyType(e.target.value as "residential" | "commercial" | "land")
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <option value="residential">Residential Apartment / Villa</option>
                  <option value="commercial">Commercial Office / Retail</option>
                  <option value="land">Land Parcel / Plot</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="property-name" className="text-xs font-medium">
                  Property Name *
                </label>
                <input
                  id="property-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Palm Meadows Residency, Tower A"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="property-location" className="text-xs font-medium">
                  Full Location *
                </label>
                <input
                  id="property-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Koregaon Park, Pune, Maharashtra"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.location && (
                  <p className="mt-1 text-xs text-destructive">{errors.location}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="property-desc" className="text-xs font-medium">
                  Property Description
                </label>
                <textarea
                  id="property-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of property specs, amenities, tenant profiles, or due diligence notes..."
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Financial & Valuation Inputs */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-semibold text-lg">2. Financial &amp; Valuation Inputs</h2>
              <span className="text-xs text-muted-foreground">Currency in Indian Rupees (₹)</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="market-val" className="text-xs font-medium">
                  Indicative Market Value (₹) *
                </label>
                <input
                  id="market-val"
                  type="number"
                  min={1}
                  step={50000}
                  value={indicativeValue}
                  onChange={(e) => setIndicativeValue(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.indicativeValue && (
                  <p className="mt-1 text-xs text-destructive">{errors.indicativeValue}</p>
                )}
              </div>

              <div>
                <label htmlFor="monthly-rent" className="text-xs font-medium">
                  Monthly Gross Rental Income (₹) *
                </label>
                <input
                  id="monthly-rent"
                  type="number"
                  min={0}
                  step={1000}
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.monthlyRent && (
                  <p className="mt-1 text-xs text-destructive">{errors.monthlyRent}</p>
                )}
              </div>

              <div>
                <label htmlFor="vacancy-pct" className="text-xs font-medium">
                  Vacancy Allowance (% of gross) *
                </label>
                <input
                  id="vacancy-pct"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={vacancyPct}
                  onChange={(e) =>
                    setVacancyPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.vacancyPct && (
                  <p className="mt-1 text-xs text-destructive">{errors.vacancyPct}</p>
                )}
              </div>

              <div>
                <label htmlFor="monthly-operating" className="text-xs font-medium">
                  Monthly Operating Expenses (₹) *
                </label>
                <input
                  id="monthly-operating"
                  type="number"
                  min={0}
                  step={500}
                  value={monthlyOperating}
                  onChange={(e) => setMonthlyOperating(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.monthlyOperating && (
                  <p className="mt-1 text-xs text-destructive">{errors.monthlyOperating}</p>
                )}
              </div>

              <div>
                <label htmlFor="monthly-maintenance" className="text-xs font-medium">
                  Monthly Maintenance &amp; Mgmt (₹) *
                </label>
                <input
                  id="monthly-maintenance"
                  type="number"
                  min={0}
                  step={500}
                  value={monthlyMaintenance}
                  onChange={(e) => setMonthlyMaintenance(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.monthlyMaintenance && (
                  <p className="mt-1 text-xs text-destructive">{errors.monthlyMaintenance}</p>
                )}
              </div>

              <div>
                <label htmlFor="cap-rate" className="text-xs font-medium">
                  Capitalisation Rate (%) *
                </label>
                <input
                  id="cap-rate"
                  type="number"
                  min={0.1}
                  max={30}
                  step={0.1}
                  value={capRatePct}
                  onChange={(e) => setCapRatePct(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.capRatePct && (
                  <p className="mt-1 text-xs text-destructive">{errors.capRatePct}</p>
                )}
              </div>
            </div>

            {/* Live Financial Metrics Summary Card */}
            <div className="mt-4 rounded-lg bg-muted/30 p-4 border text-xs">
              <span className="font-semibold text-foreground">Live Calculation Preview:</span>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-muted-foreground">Annual Gross Rent:</span>
                  <p className="font-semibold">{inr(finances.annualGrossRent)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Effective Rent:</span>
                  <p className="font-semibold">{inr(finances.effectiveAnnualRentalIncome)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Operating Income (NOI):</span>
                  <p className="font-semibold text-primary">{inr(finances.netOperatingIncome)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Rental Yield:</span>
                  <p className="font-semibold">{finances.netRentalYield.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Tokenisation Parameters */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="font-semibold text-lg">3. Tokenisation Proposal</h2>
              <span className="text-xs text-muted-foreground">ERC-1155 Compatible Pool</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="token-pool" className="text-xs font-medium">
                  Proposed Tokenisation Pool (₹) *
                </label>
                <input
                  id="token-pool"
                  type="number"
                  min={1}
                  step={10000}
                  value={tokenPool}
                  onChange={(e) => setTokenPool(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.tokenPool && (
                  <p className="mt-1 text-xs text-destructive">{errors.tokenPool}</p>
                )}
              </div>

              <div>
                <label htmlFor="unit-price" className="text-xs font-medium">
                  Price per Token/Unit (₹) *
                </label>
                <input
                  id="unit-price"
                  type="number"
                  min={1}
                  step={100}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                />
                {errors.unitPrice && (
                  <p className="mt-1 text-xs text-destructive">{errors.unitPrice}</p>
                )}
              </div>

              <div>
                <label htmlFor="max-supply" className="text-xs font-medium">
                  Calculated Maximum Token Supply
                </label>
                <input
                  id="max-supply"
                  type="text"
                  readOnly
                  value={`${finances.maximumTokenSupply.toLocaleString("en-IN")} units`}
                  className="mt-1 w-full rounded-md border bg-muted px-3 py-2 text-sm font-semibold"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  = floor(Pool {inr(tokenPool)} / Unit Price {inr(unitPrice)})
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Document Uploads & SHA-256 Fingerprinting */}
          <section className="panel space-y-4 p-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="font-semibold text-lg">
                  4. Document Uploads &amp; Real SHA-256 Hashing
                </h2>
                <p className="text-xs text-muted-foreground">
                  Upload deeds, tax receipts, or encumbrance certificates. SHA-256 is computed
                  locally in your browser.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label htmlFor="doc-category" className="text-xs font-medium">
                  Document Category
                </label>
                <select
                  id="doc-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium">
                  Select Files (PDF, PNG, JPG, WEBP &le; 10 MB)
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    {hashingFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>{hashingFile ? "Calculating SHA-256..." : "Choose Documents"}</span>
                    <input
                      type="file"
                      multiple
                      accept={ALLOWED_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                      disabled={hashingFile}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">
                    Multiple files supported. Kept strictly on your device.
                  </span>
                </div>
              </div>
            </div>

            {/* List of Attached Documents */}
            {docs.length > 0 && (
              <div className="mt-4 space-y-2">
                <span className="text-xs font-semibold">Attached Document Fingerprints:</span>
                <div className="divide-y rounded-lg border">
                  {docs.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{d.fileName}</span>
                          <Pill tone="neutral">{d.category}</Pill>
                        </div>
                        <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <span>SHA-256:</span>
                          <span className="truncate">{d.sha256}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {(d.fileSize / 1024).toFixed(1)} KB · {d.date}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone="warning">Hash calculated</Pill>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDoc(d.id)}
                          aria-label={`Remove ${d.fileName}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-accent-foreground">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Privacy &amp; Title Notice:</strong> Documents remain entirely in your
                  browser memory and are never uploaded to any cloud server or public storage. A
                  calculated SHA-256 fingerprint proves data integrity, but does not prove
                  ownership, authenticity, or legal title to real estate.
                </span>
              </div>
            </div>
          </section>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button variant="outline" asChild>
              <Link to="/">Cancel</Link>
            </Button>
            <Button type="submit">
              Review &amp; Preview Calculations <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
