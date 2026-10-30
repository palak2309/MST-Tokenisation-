import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/admin";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting, clientLogin } from "@/lib/auth/clientAuth";
import { setActiveNetwork } from "@/contractConfig";
import { TESTNET_ADMIN_ACCOUNT, MAINNET_ADMIN_ACCOUNT, ROLES } from "@/lib/blockchain";

const MAINNET_TOKEN_ADDRESS = "0x39985d784615f307D34B8143768a54bEEaB94537";
const TESTNET_TOKEN_ADDRESS = "0x681Ef61D12372e040EE5f6e058932818aA29407F";

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

describe("Admin Console: Grant On-Chain Compliance Role Multi-Network Action", () => {
  const originalImportMetaMainnet = import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS;
  const originalProcessEnvMainnet = process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS;

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
    import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = originalImportMetaMainnet;
    process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = originalProcessEnvMainnet;
  });

  it("renders the temporary action header and testnet badge on Testnet", async () => {
    const Component = Route.options.component!;
    render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Grant On-Chain Compliance Role" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Temporary Testnet Admin Action")).toBeInTheDocument();
    });
  });

  it("renders the transaction confirmation summary with exact Testnet parameters", async () => {
    const Component = Route.options.component!;
    render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Transaction Confirmation Summary")).toBeInTheDocument();
      expect(screen.getByText("Value: 0 MST")).toBeInTheDocument();
      expect(screen.getByText(/MST Testnet \(Chain ID 91562037\)/)).toBeInTheDocument();
      expect(screen.getAllByText(TESTNET_ADMIN_ACCOUNT).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(new RegExp(ROLES.COMPLIANCE_ROLE))).toBeInTheDocument();
      expect(screen.getByText("grantRole(COMPLIANCE_ROLE, Account1)")).toBeInTheDocument();
      // Target Contract link displays Testnet PropertyToken shortened address
      expect(screen.getByText(/0x681Ef61D\.\.\.aA29407F/i)).toBeInTheDocument();
    });
  });

  it("renders Mainnet action header and confirmation summary when switched to Mainnet with configured contract", async () => {
    import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = MAINNET_TOKEN_ADDRESS;
    process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = MAINNET_TOKEN_ADDRESS;

    const Component = Route.options.component!;
    render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    await act(async () => {
      setActiveNetwork("mainnet");
    });

    await waitFor(() => {
      // Mainnet badge rendered
      expect(screen.getByText("Admin Action (MST Mainnet)")).toBeInTheDocument();
      // No Testnet restriction warning banner
      expect(screen.queryByText(/This action is strictly restricted to/i)).not.toBeInTheDocument();
      // Confirmation summary displays Mainnet parameters
      expect(screen.getByText(/MST Mainnet \(Chain ID 4646\)/)).toBeInTheDocument();
      // Target Contract link displays Mainnet PropertyToken shortened address
      expect(screen.getByText(/0x39985d78\.\.\.EaB94537/i)).toBeInTheDocument();
      // Signer / Recipient is Mainnet Account 1
      expect(screen.getAllByText(MAINNET_ADMIN_ACCOUNT).length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows unconfigured contract warning when active network has no PropertyToken contract", async () => {
    import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = "";
    process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = "";

    const Component = Route.options.component!;
    render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    await act(async () => {
      setActiveNetwork("mainnet");
    });

    await waitFor(() => {
      expect(screen.getByText(/PropertyToken contract is not configured on/i)).toBeInTheDocument();
      // Connect BridgeKey button is disabled when contract is not configured
      const connectBtn = screen.getByRole("button", { name: /Connect BridgeKey/i });
      expect(connectBtn).toBeDisabled();
      expect(screen.getByText("Not configured")).toBeInTheDocument();
    });
  });

  it("strictly isolates contract addresses between Testnet and Mainnet", async () => {
    import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = MAINNET_TOKEN_ADDRESS;
    process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = MAINNET_TOKEN_ADDRESS;

    const Component = Route.options.component!;
    const { unmount } = render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    // On Testnet: must not show Mainnet address
    await waitFor(() => {
      expect(screen.queryByText(/0x39985d78/i)).not.toBeInTheDocument();
      expect(screen.getByText(/0x681Ef61D/i)).toBeInTheDocument();
    });

    unmount();

    // Switch to Mainnet
    setActiveNetwork("mainnet");

    render(
      <AuthProvider>
        <Component />
      </AuthProvider>,
    );

    // On Mainnet: must not show Testnet address
    await waitFor(() => {
      expect(screen.queryByText(/0x681Ef61D/i)).not.toBeInTheDocument();
      expect(screen.getByText(/0x39985d78/i)).toBeInTheDocument();
    });
  });
});
