import { render, screen, cleanup, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";
import { clientResetSessionForTesting } from "@/lib/auth/clientAuth";

let mockCurrentPath = "/dashboard";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@tanstack/react-router");
  return {
    ...actual,
    useRouterState: ({
      select,
    }: { select?: (state: { location: { pathname: string } }) => string } = {}) => {
      const state = { location: { pathname: mockCurrentPath } };
      return select ? select(state) : state;
    },
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

describe("AppShell Layout Isolation", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
    clientResetSessionForTesting();
  });

  afterEach(() => {
    cleanup();
  });

  it("completely hides the navigation sidebar and mobile drawer toggle on /login", async () => {
    mockCurrentPath = "/login";
    await act(async () => {
      render(
        <AuthProvider>
          <AppShell>
            <div data-testid="login-content">Login Form Content</div>
          </AppShell>
        </AuthProvider>,
      );
    });

    // Main content must be present
    expect(screen.getByTestId("login-content")).toBeInTheDocument();

    // Sidebar navigation should NOT be rendered
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument(); // aside element
    expect(screen.queryByLabelText("Open menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Rental Income Calculator")).not.toBeInTheDocument();
    expect(screen.queryByText("Blockchain Activity")).not.toBeInTheDocument();

    // The page brand should be rendered cleanly in the header
    expect(screen.getByText("MST TokenEstate")).toBeInTheDocument();
  });

  it("completely hides the navigation sidebar and mobile drawer toggle on /signup", async () => {
    mockCurrentPath = "/signup";
    await act(async () => {
      render(
        <AuthProvider>
          <AppShell>
            <div data-testid="signup-content">Signup Form Content</div>
          </AppShell>
        </AuthProvider>,
      );
    });

    // Main content must be present
    expect(screen.getByTestId("signup-content")).toBeInTheDocument();

    // Sidebar navigation should NOT be rendered
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Open menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Rental Income Calculator")).not.toBeInTheDocument();
    expect(screen.queryByText("Blockchain Activity")).not.toBeInTheDocument();
  });

  it("renders the full navigation sidebar and menu controls on protected pages like /dashboard", async () => {
    mockCurrentPath = "/dashboard";
    await act(async () => {
      render(
        <AuthProvider>
          <AppShell>
            <div data-testid="dashboard-content">Dashboard Content</div>
          </AppShell>
        </AuthProvider>,
      );
    });

    // Main content present
    expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();

    // Desktop sidebar aside element MUST be present
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    // Navigation links MUST be present
    expect(screen.getByText("Rental Income Calculator")).toBeInTheDocument();
    expect(screen.getByText("Blockchain Activity")).toBeInTheDocument();

    // Mobile menu toggle MUST be present
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });
});
