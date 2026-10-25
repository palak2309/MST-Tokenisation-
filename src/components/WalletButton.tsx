import { Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chainConfig, connectWallet, hasWallet } from "@/lib/blockchain";

export function WalletButton() {
  const [addr, setAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    if (!hasWallet()) {
      toast.error("No browser wallet detected", { description: "Install MetaMask to connect. The app keeps working in Demo Mode." });
      return;
    }
    setBusy(true);
    try {
      const r = await connectWallet();
      setAddr(r.address);
      const wrong = chainConfig.chainId && r.chainId !== chainConfig.chainId;
      toast.success("Wallet connected", {
        description: wrong ? `Connected to chain ${r.chainId}; expected ${chainConfig.chainId}.` : `Chain ID ${r.chainId}`,
      });
    } catch (e) {
      toast.error("Connection failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={addr ? "outline" : "default"} size="sm" onClick={onConnect} disabled={busy}>
      <Wallet className="h-4 w-4" />
      {addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : busy ? "Connecting…" : "Connect wallet"}
    </Button>
  );
}
