import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NetworkSelector } from "@/components/NetworkSelector";
import { getActiveNetwork, setActiveNetwork } from "@/contractConfig";
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
  });

  it("switches to MST Mainnet and displays warning toast", async () => {
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

  it("switches back to MST Testnet and displays info toast", async () => {
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
});
