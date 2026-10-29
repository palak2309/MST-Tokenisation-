import { AlertTriangle, Check, ChevronsUpDown, Globe } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_MAINNET_NETWORK_NAME,
  DEFAULT_TESTNET_CHAIN_ID,
  DEFAULT_TESTNET_NETWORK_NAME,
  useNetwork,
  type MstNetwork,
} from "@/contractConfig";
import { discoverBridgeKeyProvider } from "@/lib/blockchain";

interface NetworkSelectorProps {
  className?: string;
}

export function NetworkSelector({ className = "" }: NetworkSelectorProps) {
  const { network, setNetwork, isMainnet, isTestnet } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);

  const handleNetworkChange = useCallback(
    async (targetNetwork: MstNetwork) => {
      setIsOpen(false);
      if (targetNetwork === network) return;

      setNetwork(targetNetwork);

      const targetChainId =
        targetNetwork === "mainnet" ? DEFAULT_MAINNET_CHAIN_ID : DEFAULT_TESTNET_CHAIN_ID;
      const targetName =
        targetNetwork === "mainnet" ? DEFAULT_MAINNET_NETWORK_NAME : DEFAULT_TESTNET_NETWORK_NAME;

      if (targetNetwork === "mainnet") {
        toast.warning("MST Mainnet selected", {
          description:
            "MST Mainnet transactions require real MST funds and broadcast irreversible changes. Switch BridgeKey to MST Mainnet manually before submitting transactions.",
          duration: 6000,
        });
      } else {
        toast.info("MST Testnet selected", {
          description: "Active network switched to MST Testnet (Chain ID 91562037).",
          duration: 4000,
        });
      }

      // Check connected BridgeKey wallet chain ID if available (do not switch automatically)
      try {
        const eth = await discoverBridgeKeyProvider(300);
        const rawChainId = await eth.request({ method: "eth_chainId" });
        const actualChainId = BigInt(String(rawChainId)).toString();

        if (actualChainId !== targetChainId) {
          toast.error("BridgeKey network mismatch", {
            description: `Connected BridgeKey wallet is on chain ID ${actualChainId}. Please switch your network manually in BridgeKey to ${targetName} (chain ID ${targetChainId}). The app will not switch networks automatically.`,
            duration: 9000,
          });
        }
      } catch {
        // Wallet not connected or discovery timed out; safe to ignore
      }
    },
    [network, setNetwork],
  );

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select MST Network"
        className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer select-none ${
          isMainnet
            ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15"
            : "border-border bg-card text-foreground hover:bg-muted/70"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            isMainnet ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
          }`}
        />
        <span className="truncate">
          {isMainnet ? "MST Mainnet (4646)" : "MST Testnet (91562037)"}
        </span>
        <ChevronsUpDown className="h-3 w-3 opacity-60 ml-0.5 shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            role="listbox"
            className="absolute left-0 mt-1.5 w-60 z-50 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg focus:outline-none animate-in fade-in-0 zoom-in-95"
          >
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b mb-1">
              Select Blockchain Network
            </div>

            {/* Testnet Option */}
            <button
              type="button"
              role="option"
              aria-selected={isTestnet}
              onClick={() => handleNetworkChange("testnet")}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                isTestnet
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-muted/60 text-foreground"
              }`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">MST Testnet</span>
                  {isTestnet && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">Chain ID: 91562037</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Safe test environment · Buildathon development
                </p>
              </div>
            </button>

            {/* Mainnet Option */}
            <button
              type="button"
              role="option"
              aria-selected={isMainnet}
              onClick={() => handleNetworkChange("mainnet")}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer mt-1 ${
                isMainnet
                  ? "bg-amber-500/15 text-amber-900 dark:text-amber-200 font-medium"
                  : "hover:bg-muted/60 text-foreground"
              }`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    MST Mainnet
                    <AlertTriangle className="h-3 w-3 text-amber-600 inline" />
                  </span>
                  {isMainnet && <Check className="h-3.5 w-3.5 text-amber-600" />}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">Chain ID: 4646</p>
                <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  Requires real MST · Permanent on-chain transactions
                </p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
