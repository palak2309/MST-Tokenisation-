import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  connectWallet,
  discoverBridgeKeyProvider,
  subscribeToBridgeKeyEvents,
  walletErrorMessage,
  type BridgeKeyProvider,
} from "@/lib/blockchain";

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const watchProvider = useCallback((provider: BridgeKeyProvider) => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeToBridgeKeyEvents(provider, {
      accountsChanged: (accounts) => {
        const next = accounts[0] ?? null;
        setAccount(next);
        if (!next) setChainId(null);
      },
      chainChanged: (newChainId) => {
        try {
          setChainId(BigInt(newChainId).toString());
        } catch {
          setChainId(newChainId);
        }
      },
      disconnect: () => {
        setAccount(null);
        setChainId(null);
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
      },
    });
  }, []);

  // Restore an already-approved BridgeKey session after a page refresh.
  // eth_accounts is intentionally used here: it does not trigger a permission popup.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const provider = await discoverBridgeKeyProvider();
        const [accounts, rawChainId] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);

        if (cancelled) return;

        const availableAccounts = Array.isArray(accounts)
          ? accounts.filter((value): value is string => typeof value === "string")
          : [];
        setAccount(availableAccounts[0] ?? null);
        setChainId(rawChainId ? BigInt(String(rawChainId)).toString() : null);
        watchProvider(provider);
      } catch {
        // No wallet or no previously approved session: keep the UI disconnected.
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [watchProvider]);

  const disconnect = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setAccount(null);
    setChainId(null);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await connectWallet();
      setAccount(res.address);
      setChainId(res.chainId);
      watchProvider(res.provider);
      return res.address;
    } catch (err) {
      toast.error("BridgeKey connection failed", {
        description: walletErrorMessage(err),
      });
      return null;
    } finally {
      setConnecting(false);
    }
  }, [watchProvider]);

  return {
    account,
    chainId,
    isConnected: Boolean(account),
    connecting,
    connect,
    disconnect,
  };
}
