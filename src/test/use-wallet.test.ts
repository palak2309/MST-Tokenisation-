import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useWallet } from "@/hooks/useWallet";
import * as blockchain from "@/lib/blockchain";

describe("useWallet Hook", () => {
  let eventHandlers: Record<string, ((...args: unknown[]) => void) | undefined> = {};
  const mockProvider = {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      eventHandlers[event] = listener;
    }),
    removeListener: vi.fn((event: string) => {
      delete eventHandlers[event];
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = {};
  });

  it("initializes with disconnected state", () => {
    const { result } = renderHook(() => useWallet());

    expect(result.current.account).toBeNull();
    expect(result.current.chainId).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.connecting).toBe(false);
  });

  it("connects wallet and updates reactive account and chainId", async () => {
    vi.spyOn(blockchain, "connectWallet").mockResolvedValue({
      address: "0x1234567890123456789012345678901234567890",
      chainId: "91562037",
      provider: mockProvider as unknown as blockchain.BridgeKeyProvider,
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.account).toBe("0x1234567890123456789012345678901234567890");
    expect(result.current.chainId).toBe("91562037");
    expect(result.current.isConnected).toBe(true);
  });

  it("reactively updates chainId when chainChanged fires", async () => {
    vi.spyOn(blockchain, "connectWallet").mockResolvedValue({
      address: "0x1234567890123456789012345678901234567890",
      chainId: "91562037",
      provider: mockProvider as unknown as blockchain.BridgeKeyProvider,
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    // Simulate chainChanged to Mainnet (hex 0x1226)
    await act(async () => {
      eventHandlers["chainChanged"]?.("0x1226");
    });

    expect(result.current.chainId).toBe("4646");

    // Simulate chainChanged to Testnet (hex 0x5752035)
    await act(async () => {
      eventHandlers["chainChanged"]?.("0x5752035");
    });

    expect(result.current.chainId).toBe("91562037");
  });

  it("handles accountsChanged and resets state when disconnected", async () => {
    vi.spyOn(blockchain, "connectWallet").mockResolvedValue({
      address: "0x1234567890123456789012345678901234567890",
      chainId: "91562037",
      provider: mockProvider as unknown as blockchain.BridgeKeyProvider,
    });

    const { result } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    // Switch account
    await act(async () => {
      eventHandlers["accountsChanged"]?.(["0x9999999999999999999999999999999999999999"]);
    });
    expect(result.current.account).toBe("0x9999999999999999999999999999999999999999");

    // Disconnect via accountsChanged empty
    await act(async () => {
      eventHandlers["accountsChanged"]?.([]);
    });
    expect(result.current.account).toBeNull();
    expect(result.current.chainId).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("cleans up event listeners on unmount", async () => {
    vi.spyOn(blockchain, "connectWallet").mockResolvedValue({
      address: "0x1234567890123456789012345678901234567890",
      chainId: "91562037",
      provider: mockProvider as unknown as blockchain.BridgeKeyProvider,
    });

    const { result, unmount } = renderHook(() => useWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockProvider.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
    expect(mockProvider.on).toHaveBeenCalledWith("chainChanged", expect.any(Function));
    expect(mockProvider.on).toHaveBeenCalledWith("disconnect", expect.any(Function));

    unmount();

    expect(mockProvider.removeListener).toHaveBeenCalledWith(
      "accountsChanged",
      expect.any(Function),
    );
    expect(mockProvider.removeListener).toHaveBeenCalledWith("chainChanged", expect.any(Function));
    expect(mockProvider.removeListener).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });
});
