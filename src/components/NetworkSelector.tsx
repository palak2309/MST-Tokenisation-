import { AlertCircle, AlertTriangle, Check, ChevronsUpDown, Loader2, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_MAINNET_NETWORK_NAME,
  DEFAULT_TESTNET_CHAIN_ID,
  DEFAULT_TESTNET_NETWORK_NAME,
  useNetwork,
  type MstNetwork,
} from "@/contractConfig";
import {
  discoverBridgeKeyProvider,
  subscribeToBridgeKeyEvents,
  switchWalletNetwork,
  walletErrorMessage,
} from "@/lib/blockchain";

interface NetworkSelectorProps {
  className?: string;
}

export function NetworkSelector({ className = "" }: NetworkSelectorProps) {
  const { network, setNetwork, isMainnet, isTestnet } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);
  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const activeAppChainId = isMainnet ? DEFAULT_MAINNET_CHAIN_ID : DEFAULT_TESTNET_CHAIN_ID;
  const isChainMismatch =
    Boolean(walletAccount) && Boolean(walletChainId) && walletChainId !== activeAppChainId;

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    discoverBridgeKeyProvider(300)
      .then(async (eth) => {
        if (!mounted) return;
        try {
          const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
          if (accounts?.[0]) {
            setWalletAccount(accounts[0]);
            const rawChain = await eth.request({ method: "eth_chainId" });
            setWalletChainId(BigInt(String(rawChain)).toString());
          }
        } catch {
          // Wallet not connected
        }

        unsubscribe = subscribeToBridgeKeyEvents(eth, {
          accountsChanged: (accounts) => {
            if (!mounted) return;
            const next = accounts[0] ?? null;
            setWalletAccount(next);
            if (!next) setWalletChainId(null);
          },
          chainChanged: (chain) => {
            if (!mounted) return;
            try {
              setWalletChainId(BigInt(chain).toString());
            } catch {
              setWalletChainId(chain);
            }
          },
          disconnect: () => {
            if (!mounted) return;
            setWalletAccount(null);
            setWalletChainId(null);
          },
        });
      })
      .catch(() => {
        // Discovery timeout or not available
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const handleNetworkChange = useCallback(
    async (targetNetwork: MstNetwork) => {
      setIsOpen(false);
      if (targetNetwork === network && !isChainMismatch) return;

      const targetChainId =
        targetNetwork === "mainnet" ? DEFAULT_MAINNET_CHAIN_ID : DEFAULT_TESTNET_CHAIN_ID;
      const targetName =
        targetNetwork === "mainnet" ? DEFAULT_MAINNET_NETWORK_NAME : DEFAULT_TESTNET_NETWORK_NAME;

      // If a wallet is connected, switch the wallet network first
      if (walletAccount) {
        setIsSwitching(true);
        try {
          await switchWalletNetwork(targetNetwork);
          setNetwork(targetNetwork);
          setWalletChainId(targetChainId);

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
        } catch (err) {
          toast.error("Wallet network switch failed", {
            description: walletErrorMessage(err),
          });
          // Do not silently change the application's selected network if wallet switching fails
          return;
        } finally {
          setIsSwitching(false);
        }
      } else {
        // Safe disconnected app network change
        setNetwork(targetNetwork);

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
      }
    },
    [network, setNetwork, walletAccount, isChainMismatch],
  );

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select MST Network"
        disabled={isSwitching}
        className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer select-none ${
          isMainnet
            ? "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15"
            : "border-border bg-card text-foreground hover:bg-muted/70"
        }`}
      >
        {isSwitching ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />
        ) : (
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              isMainnet ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
        )}
        <span className="truncate">
          {isMainnet ? "MST Mainnet (4646)" : "MST Testnet (91562037)"}
        </span>
        {isChainMismatch && (
          <span
            title={`Wallet is on chain ID ${walletChainId} (Mismatch with app ${activeAppChainId})`}
            className="flex items-center text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronsUpDown className="h-3 w-3 opacity-60 ml-0.5 shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            role="listbox"
            className="absolute left-0 mt-1.5 w-72 z-50 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg focus:outline-none animate-in fade-in-0 zoom-in-95"
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b mb-1.5 flex items-center justify-between">
              <span>Select Blockchain Network</span>
              <span className="font-mono text-[9px] text-muted-foreground">EIP-3326 Switch</span>
            </div>

            {/* Wallet Status Summary */}
            <div className="px-2 py-1.5 mb-1.5 rounded-md bg-muted/40 border border-border/50 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>App Network:</span>
                <span className="font-medium text-foreground">
                  {isMainnet ? "MST Mainnet (4646)" : "MST Testnet (91562037)"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3" /> Wallet Network:
                </span>
                <span
                  className={`font-medium ${
                    !walletAccount
                      ? "text-muted-foreground italic"
                      : isChainMismatch
                        ? "text-destructive font-semibold"
                        : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {!walletAccount
                    ? "Not connected"
                    : walletChainId === "91562037"
                      ? "MST Testnet (91562037)"
                      : walletChainId === "4646"
                        ? "MST Mainnet (4646)"
                        : `Chain ID ${walletChainId || "Unknown"}`}
                </span>
              </div>
              {isChainMismatch && (
                <div className="text-[10px] text-destructive pt-0.5 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>
                    Wallet is on a different chain. Select network below to switch wallet.
                  </span>
                </div>
              )}
            </div>

            {/* Testnet Option */}
            <button
              type="button"
              role="option"
              aria-selected={isTestnet}
              onClick={() => handleNetworkChange("testnet")}
              disabled={isSwitching}
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
              disabled={isSwitching}
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
