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
  ExternalLink,
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
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  ALLOWED_TYPES,
  chainConfig,
  checkUserRolesOnChain,
  connectWallet,
  explorerTxUrl,
  getPropertyTokenOnChain,
  isTokenLiveConfigured,
  MAX_BYTES,
  parseContractError,
  registerPropertyTokenOnChain,
  sha256Hex,
  walletErrorMessage,
  type OnChainPropertyTokenInfo,
  type UserRoleStatus,
} from "@/lib/blockchain";
import { addActivity } from "@/lib/activity";
import { inr, type Property, type PropertyDoc } from "@/lib/data";
import prop1 from "@/assets/prop1.jpg";
import prop2 from "@/assets/prop2.jpg";
import prop3 from "@/assets/prop3.jpg";
import { requireAuthLoader } from "@/lib/auth/routeAuth";
import { ProtectedRoute } from "@/lib/auth/guards";
import { useAuth } from "@/lib/auth/AuthContext";
import { useNetwork } from "@/contractConfig";
import { id as keccak256Id } from "ethers";
import {
  type FormErrors,
  type PropertyFormInputs,
  validatePropertyForm,
} from "@/lib/propertyValidation";

export type { FormErrors, PropertyFormInputs };

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
  registeredHash?: string;
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

  const { isTestnet, isMainnet } = useNetwork();

  // On-Chain & BridgeKey states
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoleStatus | null>(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [checkingOnChain, setCheckingOnChain] = useState(false);
  const [onChainTokenInfo, setOnChainTokenInfo] = useState<OnChainPropertyTokenInfo | null>(null);

  // On-chain registration transaction states
  const [txStage, setTxStage] = useState<"idle" | "confirming" | "pending" | "confirmed" | "error">(
    "idle",
  );
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txBlockNumber, setTxBlockNumber] = useState<number | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [confirmedTokenId, setConfirmedTokenId] = useState<bigint | null>(null);

  const computedPropertyRef = useMemo(() => {
    try {
      return propertyId.trim() ? keccak256Id(propertyId.trim()) : "";
    } catch {
      return "";
    }
  }, [propertyId]);

  function handleLoadPuneDemoPreset() {
    setPropertyId("MST-DEMO-PUNE-002");
    setName("Pune Baner Tech Park - Unit B");
    setPropertyType("commercial");
    setLocation("Baner, Pune, Maharashtra");
    setIndicativeValue(15_000_000);
    setMonthlyRent(65_000);
    setVacancyPct(5);
    setMonthlyOperating(5_000);
    setMonthlyMaintenance(4_000);
    setCapRatePct(6.0);
    setTokenPool(1_500_000); // 1,500,000 / 1,000 = 1,500 whole units
    setUnitPrice(1_000); // 1,000 INR = 100,000 paise
    setDescription(
      "Commercial tech park fractional unit in Baner, Pune for on-chain MST Testnet tokenisation.",
    );
    setDocs([
      {
        id: "DOC-PUN-002-1",
        category: "Sale deed / title",
        type: "Registered sale deed",
        reference: "SD-DEMO-PUN-002",
        fileName: "Registered-Sale-Deed-PUNE-002.pdf",
        fileSize: 482000,
        fileType: "application/pdf",
        sha256: "9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6",
        status: "Hash calculated",
        date: new Date().toISOString().split("T")[0]!,
      },
    ]);
    setErrors({});
    toast.success("Loaded MST-DEMO-PUNE-002 Preset", {
      description: "Property ID: MST-DEMO-PUNE-002 · Max Supply: 1,500 units · Unit Price: ₹1,000",
    });
  }

  function handleAttachDemoDocument() {
    const demoDoc: UploadedDocItem = {
      id: `DOC-PUN-002-${Date.now().toString().slice(-4)}`,
      category: "Sale deed / title",
      type: "Registered sale deed",
      reference: "SD-DEMO-PUN-002",
      fileName: "Registered-Sale-Deed-PUNE-002.pdf",
      fileSize: 482000,
      fileType: "application/pdf",
      sha256: "9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6",
      status: "Hash calculated",
      date: new Date().toISOString().split("T")[0]!,
    };
    setDocs((prev) => (prev.length === 0 ? [demoDoc] : prev));
    toast.success("Attached Pune Demo Document with verified SHA-256 fingerprint.");
  }

  const checkOnChainStatus = useCallback(async (pid: string) => {
    if (!pid.trim() || !isTokenLiveConfigured()) return;
    setCheckingOnChain(true);
    try {
      const info = await getPropertyTokenOnChain(pid.trim());
      setOnChainTokenInfo(info);
      if (info.exists) {
        setConfirmedTokenId(info.tokenId);
        setTxStage("confirmed");
      }
    } catch (err) {
      console.warn("Could not query on-chain property:", err);
    } finally {
      setCheckingOnChain(false);
    }
  }, []);

  const handleConnectWallet = useCallback(async () => {
    setConnectingWallet(true);
    try {
      const conn = await connectWallet();
      setWalletAddress(conn.address);
      setWalletChainId(conn.chainId);
      const roleStatus = await checkUserRolesOnChain(conn.address);
      setUserRoles(roleStatus);
      toast.success("BridgeKey connected", {
        description: `Connected: ${conn.address.slice(0, 8)}… (Chain ${conn.chainId})`,
      });
    } catch (err) {
      toast.error("BridgeKey connection failed", {
        description: walletErrorMessage(err),
      });
    } finally {
      setConnectingWallet(false);
    }
  }, []);

  useEffect(() => {
    if (previewMode && propertyId.trim()) {
      checkOnChainStatus(propertyId.trim());
    }
  }, [previewMode, propertyId, checkOnChainStatus]);

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
    const errs = validatePropertyForm({
      propertyId,
      name,
      location,
      indicativeValue,
      monthlyRent,
      vacancyPct,
      monthlyOperating,
      monthlyMaintenance,
      capRatePct,
      unitPrice,
      tokenPool,
      isEditing,
    });
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

  async function handleRegisterOnChain() {
    if (!chainConfig.tokenContractAddress) {
      toast.error("Contract not configured", {
        description: `${chainConfig.networkName ?? "MST"} PropertyToken contract is not configured. Live on-chain registration is unavailable on this network.`,
      });
      return;
    }

    const docHash = docs[0]?.sha256 || docs[0]?.registeredHash;
    if (!docHash) {
      toast.error("Document fingerprint required", {
        description:
          "At least one document with a valid SHA-256 fingerprint is required to register on-chain.",
      });
      return;
    }

    if (role !== "PROPERTY_ISSUER" && role !== "ADMIN") {
      toast.error("Platform authorization required", {
        description:
          "Only users with PROPERTY_ISSUER or ADMIN roles can submit property registration proposals.",
      });
      return;
    }

    // Connect wallet if not already connected
    let currentAccount = walletAddress;
    if (!currentAccount) {
      try {
        const conn = await connectWallet();
        currentAccount = conn.address;
        setWalletAddress(conn.address);
        setWalletChainId(conn.chainId);
        const roleStatus = await checkUserRolesOnChain(conn.address);
        setUserRoles(roleStatus);
      } catch (err) {
        toast.error("Wallet connection failed", {
          description: walletErrorMessage(err),
        });
        return;
      }
    }

    setTxStage("confirming");
    setTxHash(null);
    setTxError(null);

    const supply = BigInt(finances.maximumTokenSupply);
    // Contract expects unit price reference in paise (smallest currency unit, 1 INR = 100 paise)
    const unitPriceInPaise = BigInt(Math.round(unitPrice * 100));
    const metadataURI = `ipfs://mst/${propertyId.trim()}`;

    try {
      const result = await registerPropertyTokenOnChain(
        propertyId.trim(),
        docHash,
        supply,
        unitPriceInPaise,
        metadataURI,
        (pendingHash) => {
          setTxHash(pendingHash);
          setTxStage("pending");
        },
      );

      setTxHash(result.txHash);
      setTxBlockNumber(result.blockNumber);
      if (result.tokenId) {
        setConfirmedTokenId(result.tokenId);
      }
      setTxStage("confirmed");

      // Add to platform audit/activity log
      addActivity({
        kind: "Property Registered",
        propertyId: propertyId.trim(),
        detail: `Registered token on ${chainConfig.networkName ?? "MST"} for ${propertyId.trim()} (Max Supply: ${finances.maximumTokenSupply} units, Unit Price: ${inr(unitPrice)})`,
        source: "onchain",
        txHash: result.txHash,
        explorerUrl: explorerTxUrl(result.txHash),
      });

      // Save/update locally with on-chain reference
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
      saveUserProperty(propertyRecord);

      toast.success(`Property registered on ${chainConfig.networkName ?? "MST"}!`, {
        description: `Tx: ${result.txHash.slice(0, 10)}… (Block #${result.blockNumber})`,
      });

      // Read back confirmed property from deployed contract
      try {
        const fresh = await getPropertyTokenOnChain(propertyId.trim());
        setOnChainTokenInfo(fresh);
        if (fresh.tokenId > 0n) {
          setConfirmedTokenId(fresh.tokenId);
        }
      } catch (readErr) {
        console.warn("Could not read back property record immediately:", readErr);
      }
    } catch (err) {
      const decoded = parseContractError(err);
      setTxError(decoded);
      setTxStage("error");
      toast.error("On-chain registration failed", {
        description: decoded,
      });
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
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setPreviewMode(false)}>
                Back to Edit
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveProperty}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save Demo Property
              </Button>
              <Button
                onClick={handleRegisterOnChain}
                disabled={
                  txStage === "confirming" ||
                  txStage === "pending" ||
                  !chainConfig.tokenContractAddress ||
                  docs.length === 0 ||
                  Boolean(onChainTokenInfo?.exists)
                }
                className="gap-1.5 font-semibold"
              >
                {txStage === "confirming" || txStage === "pending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : onChainTokenInfo?.exists ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {onChainTokenInfo?.exists
                  ? `Registered (Token #${onChainTokenInfo.tokenId.toString()})`
                  : !chainConfig.tokenContractAddress
                    ? `${chainConfig.networkName ?? "MST"} Contract Not Configured`
                    : `Register Property on ${chainConfig.networkName ?? "MST"}`}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Property Overview */}
            <section className="panel space-y-4 p-5">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-semibold">Property Summary</h3>
                <Pill tone={onChainTokenInfo?.exists ? "success" : "warning"}>
                  {onChainTokenInfo?.exists ? "Registered On-Chain" : "Local Demo Record"}
                </Pill>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-muted/40 p-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Proposed Pool</p>
                  <p className="text-base font-semibold text-primary">{inr(tokenPool)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unit Price</p>
                  <p className="text-base font-semibold">{inr(unitPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Whole-Unit Supply</p>
                  <p className="text-base font-bold text-primary">
                    {finances.maximumTokenSupply.toLocaleString("en-IN")} units
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Allocated Value</p>
                  <p className="text-base font-semibold text-foreground">
                    {inr(finances.allocatedPool)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  • <strong>Formula:</strong> Whole-unit supply = floor(Tokenisation Pool / Price
                  per unit)
                </p>
                <p>
                  • <strong>Allocation &amp; Remainder:</strong>{" "}
                  {finances.unusedPoolRemainder === 0 ? (
                    <span className="text-success font-medium">
                      Pool divides evenly into whole units (no remainder).
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {inr(finances.unusedPoolRemainder)} unallocated remainder (only whole units
                      are tokenised; partial units are not minted).
                    </span>
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
                    Calculated Net Rental Yield (NOI Yield)
                  </span>
                  <Pill tone="success">NOI Yield</Pill>
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
                  <Pill tone="neutral">Entered Cap Rate: {capRatePct}%</Pill>
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

          {/* Section: On-Chain Registration */}
          <section className="panel space-y-5 p-5 border-2 border-primary/40 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground">
                    {chainConfig.networkName ?? "MST"} On-Chain Registration (PropertyToken)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Direct interaction with the deployed PropertyToken smart contract via BridgeKey
                    wallet.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onChainTokenInfo?.exists ? (
                  <Pill tone="success">
                    Registered On-Chain · Token #{onChainTokenInfo.tokenId.toString()}
                  </Pill>
                ) : !chainConfig.tokenContractAddress ? (
                  <Pill tone="warning">Contract Not Configured</Pill>
                ) : (
                  <Pill tone="neutral">Ready to Register</Pill>
                )}
              </div>
            </div>

            {/* Network & Contract Metadata */}
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Target Blockchain:</span>
                <p className="font-medium text-foreground">
                  {chainConfig.networkName ?? "MST"} (Chain ID {chainConfig.chainId ?? "—"})
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Deployed PropertyToken Address:</span>
                <p className="font-mono font-medium truncate text-foreground">
                  {chainConfig.tokenContractAddress ? (
                    <a
                      href={`${chainConfig.explorerUrl?.replace(/\/$/, "")}/address/${chainConfig.tokenContractAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary inline-flex items-center gap-1"
                    >
                      {chainConfig.tokenContractAddress} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground font-sans">Not configured</span>
                  )}
                </p>
              </div>
            </div>

            {/* Unconfigured contract notice if token contract is absent on active network */}
            {!chainConfig.tokenContractAddress && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Contract not configured:</strong> The PropertyToken contract for{" "}
                  {chainConfig.networkName ?? "this network"} is not configured. Live on-chain
                  registration is unavailable until deployed and configured in environment
                  variables.
                </span>
              </div>
            )}

            {/* Document Hash Warning if missing */}
            {docs.length === 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Document Fingerprint Required:</strong> The contract requires a valid
                    SHA-256 document fingerprint to register.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAttachDemoDocument}
                  className="h-7 text-xs"
                >
                  Attach Pune Demo Document
                </Button>
              </div>
            )}

            {/* On-Chain Function Arguments Preview */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Transaction Arguments (registerProperty ABI):
              </span>
              <div className="rounded-lg border bg-card p-3 font-mono text-[11px] space-y-1.5 divide-y divide-border/40">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
                  <span className="text-muted-foreground">bytes32 propertyRef:</span>
                  <span
                    className="text-foreground truncate max-w-xs sm:max-w-md font-medium"
                    title={computedPropertyRef}
                  >
                    {computedPropertyRef ||
                      "0x0000000000000000000000000000000000000000000000000000000000000000"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground">bytes32 documentHash:</span>
                  <span className="text-foreground truncate max-w-xs sm:max-w-md font-medium">
                    {docs[0]?.sha256
                      ? `0x${docs[0].sha256}`
                      : "0x0000000000000000000000000000000000000000000000000000000000000000"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground">uint256 maxSupply:</span>
                  <span className="text-primary font-bold">
                    {finances.maximumTokenSupply.toLocaleString()} units
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground">uint256 unitPriceReference:</span>
                  <span className="text-foreground font-medium">
                    {(unitPrice * 100).toLocaleString()} paise ({inr(unitPrice)}/unit)
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
                  <span className="text-muted-foreground">string metadataURI:</span>
                  <span className="text-muted-foreground font-mono">
                    {`ipfs://mst/${propertyId.trim() || "PRP"}`}
                  </span>
                </div>
              </div>
            </div>

            {/* BridgeKey Wallet Connection & Role Status */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Connected BridgeKey Signer:
              </span>
              {!walletAddress ? (
                <div className="rounded-lg border border-dashed p-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
                  <div>
                    <p className="font-medium text-sm">BridgeKey Wallet Not Connected</p>
                    <p className="text-xs text-muted-foreground">
                      Connect your BridgeKey wallet on {chainConfig.networkName ?? "MST"} to sign
                      the registration transaction.
                    </p>
                  </div>
                  <Button
                    onClick={handleConnectWallet}
                    disabled={connectingWallet}
                    className="gap-2 shrink-0"
                  >
                    <Wallet className="h-4 w-4" />
                    {connectingWallet ? "Connecting…" : "Connect BridgeKey"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-mono font-medium">{walletAddress}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill
                        tone={
                          walletChainId === chainConfig.chainId ||
                          (chainConfig.chainId &&
                            walletChainId === `0x${BigInt(chainConfig.chainId).toString(16)}`)
                            ? "success"
                            : "destructive"
                        }
                      >
                        {walletChainId === chainConfig.chainId ||
                        (chainConfig.chainId &&
                          walletChainId === `0x${BigInt(chainConfig.chainId).toString(16)}`)
                          ? `${chainConfig.networkName ?? "MST"} (${chainConfig.chainId})`
                          : `Wrong Chain: ${walletChainId}`}
                      </Pill>
                    </div>
                  </div>

                  {/* Role status */}
                  <div className="flex flex-wrap items-center gap-3 pt-1 border-t text-[11px]">
                    <span className="text-muted-foreground">Contract Permissions:</span>
                    <span
                      className={
                        userRoles?.isIssuer
                          ? "text-success font-medium"
                          : "text-amber-600 dark:text-amber-400 font-medium"
                      }
                    >
                      ISSUER_ROLE: {userRoles?.isIssuer ? "✓ Granted" : "✗ Not Granted"}
                    </span>
                    <span className="text-muted-foreground">|</span>
                    <span
                      className={
                        userRoles?.isAdmin ? "text-success font-medium" : "text-muted-foreground"
                      }
                    >
                      ADMIN: {userRoles?.isAdmin ? "✓ Granted" : "–"}
                    </span>
                  </div>

                  {!userRoles?.isIssuer && !userRoles?.isAdmin && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded p-2">
                      <strong>Notice:</strong> Your connected wallet does not hold ISSUER_ROLE on
                      the deployed PropertyToken contract. If you broadcast without this role, the
                      transaction will revert on-chain.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Real-Time Transaction Feedback */}
            {txStage === "confirming" && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Awaiting Wallet Confirmation</p>
                  <p className="text-xs text-muted-foreground">
                    Please approve the transaction in your BridgeKey wallet extension.
                  </p>
                </div>
              </div>
            )}

            {txStage === "pending" && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">
                      Broadcasting to {chainConfig.networkName ?? "MST"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Transaction submitted. Waiting for block confirmation...
                    </p>
                  </div>
                </div>
                {txHash && (
                  <p className="font-mono text-xs">
                    Tx Hash:{" "}
                    <a
                      href={explorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary inline-flex items-center gap-1"
                    >
                      {txHash} <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                )}
              </div>
            )}

            {(txStage === "confirmed" || onChainTokenInfo?.exists) && (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="font-semibold text-sm text-success">
                      Confirmed On-Chain on {chainConfig.networkName ?? "MST"}!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Verified live on the deployed PropertyToken contract.
                    </p>
                  </div>
                </div>

                {/* Confirmed On-Chain Data Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-card/70 rounded-lg p-3 text-xs border">
                  <div>
                    <span className="text-muted-foreground">Token ID:</span>
                    <p className="font-mono font-bold text-base text-primary">
                      #{onChainTokenInfo?.tokenId?.toString() ?? confirmedTokenId?.toString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Supply:</span>
                    <p className="font-bold text-foreground">
                      {onChainTokenInfo?.maxSupply
                        ? `${onChainTokenInfo.maxSupply.toString()} units`
                        : `${finances.maximumTokenSupply} units`}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unit Price:</span>
                    <p className="font-bold text-foreground">
                      {onChainTokenInfo?.unitPriceReference
                        ? `${(Number(onChainTokenInfo.unitPriceReference) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })}`
                        : inr(unitPrice)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transfers:</span>
                    <p className="font-bold text-foreground">
                      {onChainTokenInfo?.transfersEnabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </div>

                {txHash && (
                  <p className="font-mono text-xs text-muted-foreground">
                    Confirmed Tx:{" "}
                    <a
                      href={explorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary inline-flex items-center gap-1"
                    >
                      {txHash} <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    {txBlockNumber ? `(Block #${txBlockNumber})` : ""}
                  </p>
                )}
              </div>
            )}

            {txStage === "error" && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-destructive">Transaction Failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{txError}</p>
                </div>
              </div>
            )}

            {/* Panel Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkOnChainStatus(propertyId.trim())}
                disabled={checkingOnChain}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checkingOnChain ? "animate-spin" : ""}`} />
                Check On-Chain Status
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleRegisterOnChain}
                  disabled={
                    txStage === "confirming" ||
                    txStage === "pending" ||
                    !chainConfig.tokenContractAddress ||
                    docs.length === 0 ||
                    Boolean(onChainTokenInfo?.exists)
                  }
                  className="gap-2 font-semibold"
                >
                  {txStage === "confirming" || txStage === "pending" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : onChainTokenInfo?.exists ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {onChainTokenInfo?.exists
                    ? `Registered (Token #${onChainTokenInfo.tokenId.toString()})`
                    : !chainConfig.tokenContractAddress
                      ? `${chainConfig.networkName ?? "MST"} Contract Not Configured`
                      : `Register Property on ${chainConfig.networkName ?? "MST"}`}
                </Button>
              </div>
            </div>
          </section>

          {/* Review Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <Button variant="outline" onClick={() => setPreviewMode(false)}>
              <ArrowLeft className="h-4 w-4" /> Back to Edit
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSaveProperty}
                variant="outline"
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save Demo Property (Local Browser)
              </Button>
              <Button
                onClick={handleRegisterOnChain}
                disabled={
                  txStage === "confirming" ||
                  txStage === "pending" ||
                  !chainConfig.tokenContractAddress ||
                  docs.length === 0 ||
                  Boolean(onChainTokenInfo?.exists)
                }
                className="gap-1.5 font-semibold"
              >
                {txStage === "confirming" || txStage === "pending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : onChainTokenInfo?.exists ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {onChainTokenInfo?.exists
                  ? `Registered (Token #${onChainTokenInfo.tokenId.toString()})`
                  : !chainConfig.tokenContractAddress
                    ? `${chainConfig.networkName ?? "MST"} Contract Not Configured`
                    : `Register Property on ${chainConfig.networkName ?? "MST"}`}
              </Button>
            </div>
          </div>

          <Disclaimer>{FINANCIAL_DISCLAIMER}</Disclaimer>
        </div>
      ) : (
        /* Form Edit Mode */
        <form onSubmit={handleProceedToPreview} className="space-y-6">
          {/* Section 1: Property Identification & Details */}
          <section className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">1. Property Identification</h2>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLoadPuneDemoPreset}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Building2 className="h-3.5 w-3.5 text-primary" /> Load MST-DEMO-PUNE-002 Preset
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">Required fields marked *</span>
              </div>
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
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPropertyId(generatePropertyId())}
                        title="Generate new ID"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleLoadPuneDemoPreset}
                        title="Load MST-DEMO-PUNE-002 Preset"
                        className="text-xs shrink-0"
                      >
                        Pune Demo
                      </Button>
                    </>
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
                  min="0.01"
                  step="any"
                  value={indicativeValue || ""}
                  onChange={(e) =>
                    setIndicativeValue(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 8000001"
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
                  min="0"
                  step="any"
                  value={monthlyRent || ""}
                  onChange={(e) =>
                    setMonthlyRent(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 50000"
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
                  min="0"
                  max="100"
                  step="any"
                  value={vacancyPct ?? ""}
                  onChange={(e) =>
                    setVacancyPct(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 5"
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
                  min="0"
                  step="any"
                  value={monthlyOperating || ""}
                  onChange={(e) =>
                    setMonthlyOperating(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 4000"
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
                  min="0"
                  step="any"
                  value={monthlyMaintenance || ""}
                  onChange={(e) =>
                    setMonthlyMaintenance(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 3500"
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
                  min="0.01"
                  step="any"
                  value={capRatePct || ""}
                  onChange={(e) =>
                    setCapRatePct(e.target.value === "" ? 0 : Number(e.target.value))
                  }
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 6.25"
                />
                {errors.capRatePct && (
                  <p className="mt-1 text-xs text-destructive">{errors.capRatePct}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  User valuation rate. Used for Income-Based Valuation = NOI / (Cap Rate / 100).
                </p>
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
                  <span className="text-muted-foreground">Calculated NOI Yield:</span>
                  <p className="font-semibold text-primary">
                    {finances.netRentalYield.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3 text-muted-foreground">
                <div>
                  <span>Entered Capitalisation Rate: </span>
                  <strong className="text-foreground">{capRatePct}%</strong>
                </div>
                <div>
                  <span>Income-Based Valuation: </span>
                  <strong className="text-foreground">
                    {finances.incomeBasedValuation
                      ? inr(finances.incomeBasedValuation)
                      : "Not applicable (NOI ≤ 0)"}
                  </strong>
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
                  min="0.01"
                  step="any"
                  value={tokenPool || ""}
                  onChange={(e) => setTokenPool(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 2019017"
                />
                {errors.tokenPool && (
                  <p className="mt-1 text-xs text-destructive">{errors.tokenPool}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Up to indicative market value ({inr(indicativeValue)}).
                </p>
              </div>

              <div>
                <label htmlFor="unit-price" className="text-xs font-medium">
                  Price per Token/Unit (₹) *
                </label>
                <input
                  id="unit-price"
                  type="number"
                  min="0.01"
                  step="any"
                  value={unitPrice || ""}
                  onChange={(e) => setUnitPrice(e.target.value === "" ? 0 : Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm"
                  placeholder="e.g. 1001"
                />
                {errors.unitPrice && (
                  <p className="mt-1 text-xs text-destructive">{errors.unitPrice}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Informational reference price stored on-chain (paise precision).
                </p>
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
                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  <p>
                    = floor(Pool {inr(tokenPool)} / Unit Price {inr(unitPrice)})
                  </p>
                  <p>
                    Allocated: {inr(finances.allocatedPool)}
                    {finances.unusedPoolRemainder > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium ml-1">
                        · Remainder: {inr(finances.unusedPoolRemainder)} (not tokenised)
                      </span>
                    )}
                  </p>
                </div>
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
