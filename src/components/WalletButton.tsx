import { Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  chainConfig,
  connectWallet,
  subscribeToBridgeKeyEvents,
  walletErrorMessage,
} from "@/lib/blockchain";

export function WalletButton() {
  const [addr, setAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  async function onConnect() {
    setBusy(true);
    try {
      const r = await connectWallet();
      setAddr(r.address);
      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribeToBridgeKeyEvents(r.provider, {
        accountsChanged: (accounts) => {
          const nextAddress = accounts[0];
          setAddr(nextAddress ?? null);
          if (!nextAddress) {
            toast.error("BridgeKey account disconnected", {
              description: "Reconnect BridgeKey to use wallet features.",
            });
          }
        },
        chainChanged: (chainId) => {
          let actualChainId: string;
          try {
            actualChainId = BigInt(chainId).toString();
          } catch {
            toast.error("BridgeKey reported an invalid network");
            return;
          }
          if (chainConfig.chainId && actualChainId !== chainConfig.chainId) {
            toast.error("Wrong network selected in BridgeKey", {
              description: `Switch to ${chainConfig.networkName ?? "MST Testnet"} (chain ID ${chainConfig.chainId}) in BridgeKey or use the network switcher above.`,
            });
          } else {
            toast.success("BridgeKey is on the configured network");
          }
        },
        disconnect: () => {
          setAddr(null);
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          toast.error("BridgeKey disconnected", {
            description: "Reconnect BridgeKey to use wallet features.",
          });
        },
      });
      toast.success("BridgeKey connected", {
        description: `Account ${r.address.slice(0, 6)}…${r.address.slice(-4)} · chain ID ${r.chainId}`,
      });
    } catch (e) {
      toast.error("BridgeKey connection failed", {
        description: walletErrorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={addr ? "outline" : "default"} size="sm" onClick={onConnect} disabled={busy}>
      <Wallet className="h-4 w-4" />
      {addr
        ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
        : busy
          ? "Connecting BridgeKey…"
          : "Connect BridgeKey"}
    </Button>
  );
}
