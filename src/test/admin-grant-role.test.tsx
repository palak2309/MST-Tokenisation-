import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Route } from "@/routes/admin";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting, clientLogin } from "@/lib/auth/clientAuth";
import { setActiveNetwork } from "@/contractConfig";
import { TESTNET_ADMIN_ACCOUNT, ROLES } from "@/lib/blockchain";

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

describe("Admin Console: Grant On-Chain Compliance Role Temporary Action", () => {
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

  it("renders the temporary action header and testnet badge", async () => {
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

  it("renders the transaction confirmation summary with exact verified parameters", async () => {
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
    });
  });

  it("enforces testnet restriction when switched to Mainnet", async () => {
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
      expect(screen.getByText(/This action is strictly restricted to/i)).toBeInTheDocument();
    });
  });
});
