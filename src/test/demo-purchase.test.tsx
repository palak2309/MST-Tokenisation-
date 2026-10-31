import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PropertyPurchaseModal } from "@/components/PropertyPurchaseModal";
import { PropertyDetailsModal } from "@/components/PropertyDetailsModal";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { MAINNET_DEMO_PROPERTY, DEFAULT_PROPERTY } from "@/lib/sampleProperties";
import { purchaseDemoUnitsOnChain, isTokenLiveConfigured, chainConfig } from "@/lib/blockchain";
import { setActiveNetwork, resolveMainnetConfig, resolveTestnetConfig } from "@/contractConfig";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to?: string;
      [key: string]: unknown;
    }) => (
      <a href={to ?? "#"} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock BridgeKey discovery and ethers
const mockSigner = {
  getAddress: vi.fn().mockResolvedValue("0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2"),
};

const mockContract = {
  getFunction: vi.fn((name: string) => {
    if (name === "isEligibleInvestor") {
      return vi.fn().mockResolvedValue(true);
    }
    if (name === "remainingSupply") {
      return vi.fn().mockResolvedValue(1500n);
    }
    if (name === "totalSupply") {
      return vi.fn().mockResolvedValue(0n);
    }
    if (name === "getProperty") {
      return vi
        .fn()
        .mockResolvedValue([
          "0x1111",
          "0x9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6",
          1500n,
          100000n,
          "ipfs://meta",
          1698700000n,
          false,
        ]);
    }
    if (name === "purchaseDemoUnits") {
      return vi.fn().mockResolvedValue({
        hash: "0x8888888888888888888888888888888888888888888888888888888888888888",
        wait: vi.fn().mockResolvedValue({ status: 1, blockNumber: 12345 }),
      });
    }
    return vi.fn();
  }),
};

describe("TokenEstate Mainnet Demo Purchase Workflow", () => {
  beforeEach(() => {
    setActiveNetwork("mainnet");
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    setActiveNetwork("testnet");
  });

  describe("1. purchaseDemoUnitsOnChain Validation & Security Isolation", () => {
    it("rejects zero and negative purchase quantities", async () => {
      await expect(purchaseDemoUnitsOnChain(1n, 0n)).rejects.toThrow(
        "Purchase amount must be greater than zero.",
      );
      await expect(purchaseDemoUnitsOnChain(1n, -5n)).rejects.toThrow(
        "Purchase amount must be greater than zero.",
      );
    });

    it("verifies Chain ID and network configuration strictly", () => {
      const mainnetConfig = resolveMainnetConfig();
      expect(mainnetConfig.chainId).toBe("4646");
      expect(mainnetConfig.network).toBe("mainnet");

      const testnetConfig = resolveTestnetConfig();
      expect(testnetConfig.chainId).toBe("91562037");
      expect(testnetConfig.network).toBe("testnet");
    });
  });

  describe("2. PropertyPurchaseModal UI & Pre-Confirmation Invariants", () => {
    it("renders demo property purchase dialog with token ID, total supply, and demo price", () => {
      render(
        <AuthProvider>
          <PropertyPurchaseModal property={MAINNET_DEMO_PROPERTY} isOpen={true} onClose={vi.fn()} />
        </AuthProvider>,
      );

      // Verify Header and Badges
      expect(screen.getByText("Buy Demo Property Units")).toBeDefined();
      expect(screen.getByText("Demo Purchase")).toBeDefined();
      expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);

      // Verify Property Details
      expect(screen.getByText("Commercial Tech Park, Tower A")).toBeDefined();
      expect(screen.getByText(/Token ID #/)).toBeDefined();

      // Verify Disclaimer
      expect(screen.getByText(/Demo purchase — no real-money payment/i)).toBeDefined();
      expect(
        screen.getByText(/No real-money payment, no MST payment transfer, no payment gateway/i),
      ).toBeDefined();
    });

    it("calculates total demo value dynamically when quantity input changes", () => {
      render(
        <AuthProvider>
          <PropertyPurchaseModal property={MAINNET_DEMO_PROPERTY} isOpen={true} onClose={vi.fn()} />
        </AuthProvider>,
      );

      const input = screen.getByLabelText(/Quantity to Purchase/i) as HTMLInputElement;
      expect(input).toBeDefined();

      // Default 10 units -> 10 * ₹1,000 = ₹10,000
      expect(input.value).toBe("10");
      expect(screen.getAllByText(/₹10,000/).length).toBeGreaterThan(0);

      // Change quantity to 25 units -> 25 * ₹1,000 = ₹25,000
      fireEvent.change(input, { target: { value: "25" } });
      expect(input.value).toBe("25");
      expect(screen.getAllByText(/₹25,000/).length).toBeGreaterThan(0);
    });

    it("prevents supply cap overflow and alerts user when quantity exceeds available units", () => {
      render(
        <AuthProvider>
          <PropertyPurchaseModal property={MAINNET_DEMO_PROPERTY} isOpen={true} onClose={vi.fn()} />
        </AuthProvider>,
      );

      const input = screen.getByLabelText(/Quantity to Purchase/i) as HTMLInputElement;

      // Enter quantity greater than max supply (e.g. 5000 units when max is 1500)
      fireEvent.change(input, { target: { value: "5000" } });

      expect(screen.getByText(/Quantity exceeds available supply/i)).toBeDefined();
    });
  });

  describe("3. PropertyDetailsModal Live Metric & Action Rendering", () => {
    it("renders on-chain metrics, Buy/Stake/Unstake actions, and simulated badges", () => {
      render(
        <AuthProvider>
          <PropertyDetailsModal property={MAINNET_DEMO_PROPERTY} isOpen={true} onClose={vi.fn()} />
        </AuthProvider>,
      );

      // Verify Header
      expect(screen.getByText("Commercial Tech Park, Tower A")).toBeDefined();
      expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);

      // Verify Metric Cards
      expect(screen.getByText("Total Supply")).toBeDefined();
      expect(screen.getByText("Available Units")).toBeDefined();
      expect(screen.getByText("In Your Wallet")).toBeDefined();
      expect(screen.getByText("Staked in Vault")).toBeDefined();

      // Verify Action Buttons
      expect(screen.getByText("Buy Units")).toBeDefined();
      expect(screen.getByText("Stake")).toBeDefined();
      expect(screen.getByText("Unstake")).toBeDefined();

      // Verify Property Transaction History
      expect(screen.getByText("Property Transaction History")).toBeDefined();
    });
  });
});
