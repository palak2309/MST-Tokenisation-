import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { redirectIfAuthenticatedLoader, requireAuthLoader } from "@/lib/auth/routeAuth";
import { clientLogin, clientResetSessionForTesting } from "@/lib/auth/clientAuth";
import { resetAuthStateForTesting } from "@/lib/auth/serverAuth";

type RedirectResponse = Response & {
  options: {
    to: string;
    search?: { redirect?: string };
    statusCode?: number;
  };
};

describe("Route-Level Authentication & Protected Route Redirection", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
    clientResetSessionForTesting();
  });

  describe("Unauthenticated Visitors", () => {
    it("redirects unauthenticated visitors from / to /login", async () => {
      try {
        await requireAuthLoader({ location: { pathname: "/" } });
        expect.unreachable("Expected requireAuthLoader to throw redirect");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/login");
      }
    });

    it("redirects unauthenticated visitors from /dashboard to /login", async () => {
      try {
        await requireAuthLoader({ location: { pathname: "/dashboard" } });
        expect.unreachable("Expected requireAuthLoader to throw redirect");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/login");
        expect(redir.options.search?.redirect).toBe("/dashboard");
      }
    });

    it("redirects unauthenticated visitors from /invest to /login with redirect parameter", async () => {
      try {
        await requireAuthLoader({ location: { pathname: "/invest" } });
        expect.unreachable("Expected requireAuthLoader to throw redirect");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/login");
        expect(redir.options.search?.redirect).toBe("/invest");
      }
    });

    it("redirects unauthenticated visitors from /properties/new to /login", async () => {
      try {
        await requireAuthLoader({ location: { pathname: "/properties/new" } });
        expect.unreachable("Expected requireAuthLoader to throw redirect");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/login");
        expect(redir.options.search?.redirect).toBe("/properties/new");
      }
    });

    it("allows unauthenticated visitors to view /login and /signup without redirect", async () => {
      // Must not throw redirect
      await expect(redirectIfAuthenticatedLoader()).resolves.toBeUndefined();
    });
  });

  describe("Authenticated Users", () => {
    it("allows authenticated users to access protected routes", async () => {
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");

      const result = await requireAuthLoader({ location: { pathname: "/invest" } });
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe("investor@tokenestate.mst");
      expect(result.user.role).toBe("INVESTOR");
    });

    it("redirects authenticated users away from /login to /dashboard", async () => {
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");

      try {
        await redirectIfAuthenticatedLoader();
        expect.unreachable("Expected redirect away from /login for active session");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/dashboard");
      }
    });

    it("respects redirect search param when redirecting away from /login", async () => {
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");

      try {
        await redirectIfAuthenticatedLoader({ redirectTarget: "/verify" });
        expect.unreachable("Expected redirect to intended target");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/verify");
      }
    });

    it("enforces role requirements on privileged routes like /admin", async () => {
      // Login as normal investor
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");

      try {
        await requireAuthLoader({
          location: { pathname: "/admin" },
          requiredRole: "ADMIN",
        });
        expect.unreachable("Expected investor to be redirected away from /admin");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/dashboard");
      }

      // Login as admin
      await clientLogin("admin@tokenestate.mst", "MSTAdmin2026!");
      const adminResult = await requireAuthLoader({
        location: { pathname: "/admin" },
        requiredRole: "ADMIN",
      });
      expect(adminResult.user.role).toBe("ADMIN");
    });

    it("enforces role requirements on /properties/new (only ISSUER and ADMIN)", async () => {
      // Investor denied
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");
      try {
        await requireAuthLoader({
          location: { pathname: "/properties/new" },
          requiredRole: ["PROPERTY_ISSUER", "ADMIN"],
        });
        expect.unreachable("Expected investor to be redirected away from /properties/new");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/dashboard");
      }

      // Property Issuer allowed
      clientResetSessionForTesting();
      await clientLogin("issuer@tokenestate.mst", "MSTIssuer2026!");
      const issuerResult = await requireAuthLoader({
        location: { pathname: "/properties/new" },
        requiredRole: ["PROPERTY_ISSUER", "ADMIN"],
      });
      expect(issuerResult.user.role).toBe("PROPERTY_ISSUER");

      // Admin allowed
      clientResetSessionForTesting();
      await clientLogin("admin@tokenestate.mst", "MSTAdmin2026!");
      const adminResult = await requireAuthLoader({
        location: { pathname: "/properties/new" },
        requiredRole: ["PROPERTY_ISSUER", "ADMIN"],
      });
      expect(adminResult.user.role).toBe("ADMIN");
    });

    it("enforces role requirements on /pause (only EMERGENCY_PAUSER and ADMIN)", async () => {
      // Investor denied
      await clientLogin("investor@tokenestate.mst", "MSTInvestor2026!");
      try {
        await requireAuthLoader({
          location: { pathname: "/pause" },
          requiredRole: ["EMERGENCY_PAUSER", "ADMIN"],
        });
        expect.unreachable("Expected investor to be redirected away from /pause");
      } catch (err) {
        expect(isRedirect(err)).toBe(true);
        const redir = err as RedirectResponse;
        expect(redir.options.to).toBe("/dashboard");
      }

      // Emergency Pauser allowed
      clientResetSessionForTesting();
      await clientLogin("pauser@tokenestate.mst", "MSTPauser2026!");
      const pauserResult = await requireAuthLoader({
        location: { pathname: "/pause" },
        requiredRole: ["EMERGENCY_PAUSER", "ADMIN"],
      });
      expect(pauserResult.user.role).toBe("EMERGENCY_PAUSER");
    });
  });
});
