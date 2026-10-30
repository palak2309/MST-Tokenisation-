import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NetworkSelector } from "@/components/NetworkSelector";
import { getActiveNetwork, setActiveNetwork } from "@/contractConfig";
import * as blockchain from "@/lib/blockchain";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("NetworkSelector Component", () => {
  beforeEach(() => {
    setActiveNetwork("testnet");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    setActiveNetwork("testnet");
    vi.restoreAllMocks();
  });

  it("renders with MST Testnet (91562037) active by default", () => {
    render(<NetworkSelector />);

    const button = screen.getByRole("button", { name: "Select MST Network" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("MST Testnet (91562037)");
  });

  it("opens options list when clicked and displays Testnet and Mainnet options", () => {
    render(<NetworkSelector />);

    const trigger = screen.getByRole("button", { name: "Select MST Network" });
    fireEvent.click(trigger);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("MST Testnet")).toBeInTheDocument();
    expect(screen.getByText("Chain ID: 91562037")).toBeInTheDocument();
    expect(screen.getByText("MST Mainnet")).toBeInTheDocument();
    expect(screen.getByText("Chain ID: 4646")).toBeInTheDocument();
    expect(screen.getByText(/Wallet Network:/)).toBeInTheDocument();
  });

  it("switches to MST Mainnet and displays warning toast in disconnected mode", async () => {
    render(<NetworkSelector />);

    const trigger = screen.getByRole("button", { name: "Select MST Network" });
    fireEvent.click(trigger);

    const mainnetOption = screen.getByRole("option", { name: /MST Mainnet/i });
    await act(async () => {
      fireEvent.click(mainnetOption);
    });

    expect(getActiveNetwork()).toBe("mainnet");
    expect(toast.warning).toHaveBeenCalledWith(
      "MST Mainnet selected",
      expect.objectContaining({
        description: expect.stringContaining("real MST funds"),
      }),
    );
  });

  it("switches back to MST Testnet and displays info toast in disconnected mode", async () => {
    setActiveNetwork("mainnet");
    render(<NetworkSelector />);

    const trigger = screen.getByRole("button", { name: "Select MST Network" });
    expect(trigger).toHaveTextContent("MST Mainnet (4646)");

    fireEvent.click(trigger);
    const testnetOption = screen.getByRole("option", { name: /MST Testnet/i });
    await act(async () => {
      fireEvent.click(testnetOption);
    });

    expect(getActiveNetwork()).toBe("testnet");
    expect(toast.info).toHaveBeenCalledWith(
      "MST Testnet selected",
      expect.objectContaining({
        description: expect.stringContaining("MST Testnet"),
      }),
    );
  });

  it("invokes switchWalletNetwork when wallet is connected and updates app network on success", async () => {
    const mockEth = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
        if (method === "eth_chainId") return "0x5752035"; // testnet
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.spyOn(blockchain, "discoverBridgeKeyProvider").mockResolvedValue(
      mockEth as unknown as blockchain.BridgeKeyProvider,
    );
    const switchSpy = vi.spyOn(blockchain, "switchWalletNetwork").mockResolvedValue(undefined);

    render(<NetworkSelector />);

    // Allow discover provider useEffect to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const trigger = screen.getByRole("button", { name: "Select MST Network" });
    fireEvent.click(trigger);

    const mainnetOption = screen.getByRole("option", { name: /MST Mainnet/i });
    await act(async () => {
      fireEvent.click(mainnetOption);
    });

    expect(switchSpy).toHaveBeenCalledWith("mainnet");
    expect(getActiveNetwork()).toBe("mainnet");
  });

  it("preserves application network when wallet switch fails or is rejected", async () => {
    const mockEth = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_accounts") return ["0x1111111111111111111111111111111111111111"];
        if (method === "eth_chainId") return "0x5752035"; // testnet
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.spyOn(blockchain, "discoverBridgeKeyProvider").mockResolvedValue(
      mockEth as unknown as blockchain.BridgeKeyProvider,
    );
    vi.spyOn(blockchain, "switchWalletNetwork").mockRejectedValue({
      code: 4001,
      message: "User rejected the request.",
    });

    render(<NetworkSelector />);

    // Allow discover provider useEffect to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(getActiveNetwork()).toBe("testnet");

    const trigger = screen.getByRole("button", { name: "Select MST Network" });
    fireEvent.click(trigger);

    const mainnetOption = screen.getByRole("option", { name: /MST Mainnet/i });
    await act(async () => {
      fireEvent.click(mainnetOption);
    });

    // CRITICAL: App network MUST NOT change to mainnet when wallet rejects
    expect(getActiveNetwork()).toBe("testnet");
    expect(toast.error).toHaveBeenCalledWith(
      "Wallet network switch failed",
      expect.objectContaining({
        description: expect.stringContaining("rejected"),
      }),
    );
  });
});
