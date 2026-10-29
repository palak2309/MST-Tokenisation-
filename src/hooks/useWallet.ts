import { useState, useCallback } from "react";
import { toast } from "sonner";
import { connectWallet, subscribeToBridgeKeyEvents, walletErrorMessage } from "@/lib/blockchain";

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await connectWallet();
      setAccount(res.address);
      subscribeToBridgeKeyEvents(res.provider, {
        accountsChanged: (accounts) => setAccount(accounts[0] ?? null),
        chainChanged: () => {},
        disconnect: () => setAccount(null),
      });
      return res.address;
    } catch (err) {
      toast.error("BridgeKey connection failed", {
        description: walletErrorMessage(err),
      });
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  return { account, isConnected: Boolean(account), connecting, connect };
}
