import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { connectWallet, subscribeToBridgeKeyEvents, walletErrorMessage } from "@/lib/blockchain";

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

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

      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribeToBridgeKeyEvents(res.provider, {
        accountsChanged: (accounts) => {
          const next = accounts[0] ?? null;
          setAccount(next);
          if (!next) {
            setChainId(null);
          }
        },
        chainChanged: (newChainId) => {
          try {
            const parsed = BigInt(newChainId).toString();
            setChainId(parsed);
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

  return {
    account,
    chainId,
    isConnected: Boolean(account),
    connecting,
    connect,
    disconnect,
  };
}
