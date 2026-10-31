import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ProtectedRoute, RoleBadge, RoleGate } from "@/lib/auth/guards";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";
import { useEffect } from "react";
import type { AppRole } from "@/lib/auth/types";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting } from "@/lib/auth/clientAuth";

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

function TestRoleSetter({ email, password }: { email: string; password: string }) {
  const { login } = useAuth();
  useEffect(() => {
    login(email, password);
  }, [email, password, login]);
  return <div data-testid="auth-setter">Logging in {email}...</div>;
}

describe("Authentication Guards & Role Enforcement", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
    clientResetSessionForTesting();
  });

  afterEach(() => {
    cleanup();
    clientResetSessionForTesting();
  });

  describe("RoleBadge Component", () => {
    const roles: Array<{ role: AppRole; expectedText: string }> = [
      { role: "ADMIN", expectedText: "Administrator" },
      { role: "PROPERTY_ISSUER", expectedText: "Property Issuer" },
      { role: "COMPLIANCE_OFFICER", expectedText: "Compliance Officer" },
      { role: "INVESTOR", expectedText: "Investor" },
      { role: "EMERGENCY_PAUSER", expectedText: "Emergency Pauser" },
    ];

    roles.forEach(({ role, expectedText }) => {
      it(`renders correctly for role ${role}`, () => {
        render(<RoleBadge role={role} />);
        expect(screen.getByText(expectedText)).toBeInTheDocument();
      });
    });
  });

  describe("ProtectedRoute Component", () => {
    it("renders Authentication Required for unauthenticated visitors", async () => {
      render(
        <AuthProvider>
          <ProtectedRoute>
            <div>Confidential Investor Data</div>
          </ProtectedRoute>
        </AuthProvider>,
      );

      expect(await screen.findByText(/Authentication Required/i)).toBeInTheDocument();
      expect(screen.queryByText("Confidential Investor Data")).not.toBeInTheDocument();
    });

    it("renders 403 Access Denied when user role is insufficient", async () => {
      render(
        <AuthProvider>
          <TestRoleSetter email="investor@tokenestate.mst" password="MSTInvestor2026!" />
          <ProtectedRoute requiredRole="ADMIN">
            <div>Secret Admin Control Room</div>
          </ProtectedRoute>
        </AuthProvider>,
      );

      expect(
        await screen.findByText(/403 · Access Denied/i, {}, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Secret Admin Control Room")).not.toBeInTheDocument();
    });

    it("renders protected content when user has required role", async () => {
      render(
        <AuthProvider>
          <TestRoleSetter email="admin@tokenestate.mst" password="MSTAdmin2026!" />
          <ProtectedRoute requiredRole="ADMIN">
            <div>Secret Admin Control Room</div>
          </ProtectedRoute>
        </AuthProvider>,
      );

      expect(
        await screen.findByText("Secret Admin Control Room", {}, { timeout: 4000 }),
      ).toBeInTheDocument();
    });
  });

  describe("RoleGate Component", () => {
    it("hides restricted child elements from unauthorized roles", async () => {
      render(
        <AuthProvider>
          <TestRoleSetter email="investor@tokenestate.mst" password="MSTInvestor2026!" />
          <RoleGate
            allowedRoles={["PROPERTY_ISSUER", "ADMIN"]}
            fallback={<div>Fallback Hidden</div>}
          >
            <div>Issuer Only Button</div>
          </RoleGate>
        </AuthProvider>,
      );

      expect(await screen.findByText("Fallback Hidden")).toBeInTheDocument();
      expect(screen.queryByText("Issuer Only Button")).not.toBeInTheDocument();
    });

    it("displays child elements to authorized roles", async () => {
      render(
        <AuthProvider>
          <TestRoleSetter email="issuer@tokenestate.mst" password="MSTIssuer2026!" />
          <RoleGate
            allowedRoles={["PROPERTY_ISSUER", "ADMIN"]}
            fallback={<div>Fallback Hidden</div>}
          >
            <div>Issuer Only Button</div>
          </RoleGate>
        </AuthProvider>,
      );

      expect(await screen.findByText("Issuer Only Button")).toBeInTheDocument();
      expect(screen.queryByText("Fallback Hidden")).not.toBeInTheDocument();
    });
  });
});
