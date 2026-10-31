import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  resolveMainnetConfig,
  resolveTestnetConfig,
  setActiveNetwork,
  getActiveNetworkConfig,
} from "@/contractConfig";
import { chainConfig, isTokenLiveConfigured, isLiveConfigured } from "@/lib/blockchain";
import { Route as AdminRoute } from "@/routes/admin";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting, clientLogin } from "@/lib/auth/clientAuth";

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
    useNavigate: () => vi.fn(),
  };
});

describe("Multi-Network Dual Operation and Address Isolation", () => {
  beforeEach(async () => {
    resetAuthStateForTesting();
    clientResetSessionForTesting();
    setActiveNetwork("testnet");
    await clientLogin("admin@tokenestate.mst", "MSTAdmin2026!");
  });

  afterEach(() => {
    cleanup();
    clientResetSessionForTesting();
    setActiveNetwork("testnet");
  });

  describe("Address Isolation and Strict Segregation", () => {
    it("never bleeds Testnet contract addresses into Mainnet config", () => {
      const mockEnv = {
        VITE_MST_CONTRACT_ADDRESS: "0x6883929b0A46dC2f301D294719954313b979dc14",
        VITE_MST_TOKEN_CONTRACT_ADDRESS: "0x681Ef61D12372e040EE5f6e058932818aA29407F",
        VITE_MST_MAINNET_CONTRACT_ADDRESS: "",
        VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS: "",
      };

      const testnetConfig = resolveTestnetConfig(mockEnv);
      const mainnetConfig = resolveMainnetConfig(mockEnv);

      expect(testnetConfig.contractAddress).toBe("0x6883929b0A46dC2f301D294719954313b979dc14");
      expect(testnetConfig.tokenContractAddress).toBe("0x681Ef61D12372e040EE5f6e058932818aA29407F");

      // Mainnet must be strictly undefined, never falling back to Testnet addresses
      expect(mainnetConfig.contractAddress).toBeUndefined();
      expect(mainnetConfig.tokenContractAddress).toBeUndefined();
    });

    it("dynamic chainConfig updates immediately on network switch", () => {
      setActiveNetwork("testnet");
      expect(chainConfig.network).toBe("testnet");
      expect(chainConfig.chainId).toBe("91562037");

      setActiveNetwork("mainnet");
      expect(chainConfig.network).toBe("mainnet");
      expect(chainConfig.chainId).toBe("4646");
      expect(chainConfig.networkName).toBe("MST Mainnet");

      setActiveNetwork("testnet");
      expect(chainConfig.network).toBe("testnet");
      expect(chainConfig.chainId).toBe("91562037");
    });

    it("correctly identifies live configuration status per network", () => {
      setActiveNetwork("testnet");
      // Testnet has default or env contract configured
      expect(isLiveConfigured()).toBe(Boolean(chainConfig.contractAddress));

      setActiveNetwork("mainnet");
      // Mainnet has no addresses configured in default test environment
      expect(isTokenLiveConfigured()).toBe(false);
      expect(isLiveConfigured()).toBe(false);

      setActiveNetwork("testnet");
    });
  });

  describe("Admin Console UI Multi-Network Behavior", () => {
    it("shows 'Not configured' in Admin Overview when contract address is missing on Mainnet", async () => {
      const Component = AdminRoute.options.component!;
      render(
        <AuthProvider>
          <Component />
        </AuthProvider>,
      );

      await act(async () => {
        setActiveNetwork("mainnet");
      });

      // Switch to System & Chain Architecture tab
      const systemTabBtn = await screen.findByRole("button", {
        name: /System & Chain Architecture/i,
      });
      await act(async () => {
        systemTabBtn.click();
      });

      await waitFor(() => {
        expect(screen.getAllByText(/Target Network/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText("MST Mainnet").length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText("4646")).toBeInTheDocument();
        // Verifies no hardcoded Testnet address fallback
        expect(
          screen.queryByText("0x6883929b0A46dC2f301D294719954313b979dc14"),
        ).not.toBeInTheDocument();
        expect(screen.getAllByText("Not configured").length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
