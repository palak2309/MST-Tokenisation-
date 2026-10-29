import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  ensureInitialized,
  getAuthStorageStatus,
  isDemoAccountsAllowed,
  isPersistentStorageConfigured,
  isProductionAuthPermitted,
  loginUser,
  resetAuthStateForTesting,
  signUpUser,
} from "@/lib/auth/serverAuth";
import { handleAuthApiRequest } from "@/lib/auth/serverApi";

describe("Production Authentication Hardening & Safeguards", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetAuthStateForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAuthStateForTesting();
  });

  describe("1. Demo Accounts & Hardcoded Credential Gating", () => {
    it("disallows demo accounts in production environment by default", () => {
      process.env["NODE_ENV"] = "production";
      delete process.env["ENABLE_DEMO_ACCOUNTS"];

      expect(isDemoAccountsAllowed()).toBe(false);
    });

    it("allows demo accounts in non-production environments (development/test)", () => {
      process.env["NODE_ENV"] = "development";
      delete process.env["ENABLE_DEMO_ACCOUNTS"];

      expect(isDemoAccountsAllowed()).toBe(true);
    });

    it("allows explicit opt-in for demo accounts in production when ENABLE_DEMO_ACCOUNTS=true", () => {
      process.env["NODE_ENV"] = "production";
      process.env["ENABLE_DEMO_ACCOUNTS"] = "true";

      expect(isDemoAccountsAllowed()).toBe(true);
    });

    it("STRICT: does NOT seed hardcoded demo accounts when demo accounts are disabled in production", async () => {
      process.env["NODE_ENV"] = "production";
      delete process.env["ENABLE_DEMO_ACCOUNTS"];
      process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] = "true"; // allow auth execution to test initialization

      await ensureInitialized();

      // Seeded accounts must NOT exist
      await expect(
        loginUser({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      ).rejects.toThrow(/invalid email or password/i);

      await expect(
        loginUser({
          email: "issuer@tokenestate.mst",
          password: "MSTIssuer2026!",
        }),
      ).rejects.toThrow(/invalid email or password/i);
    });
  });

  describe("2. Cloudflare Workers In-Memory Storage Assessment & Safe Gating", () => {
    it("correctly identifies ephemeral in-memory storage without configured backing store", () => {
      delete process.env["CLOUDFLARE_D1_DATABASE"];
      delete process.env["DATABASE_URL"];
      delete process.env["AUTH_KV_BINDING"];
      delete process.env["AUTH_STORAGE_PROVIDER"];

      expect(isPersistentStorageConfigured()).toBe(false);

      const status = getAuthStorageStatus();
      expect(status.isDurable).toBe(false);
      expect(status.provider).toBe("in-memory");
    });

    it("identifies Cloudflare D1 when CLOUDFLARE_D1_DATABASE is configured", () => {
      process.env["CLOUDFLARE_D1_DATABASE"] = "mst-tokenestate-d1";

      expect(isPersistentStorageConfigured()).toBe(true);
      const status = getAuthStorageStatus();
      expect(status.isDurable).toBe(true);
      expect(status.provider).toBe("cloudflare-d1");
    });

    it("identifies Cloudflare KV when AUTH_KV_BINDING is configured", () => {
      process.env["AUTH_KV_BINDING"] = "AUTH_SESSIONS_KV";

      expect(isPersistentStorageConfigured()).toBe(true);
      const status = getAuthStorageStatus();
      expect(status.isDurable).toBe(true);
      expect(status.provider).toBe("cloudflare-kv");
    });

    it("STRICT: fails safely in production when in-memory storage is unbacked and not explicitly overridden", async () => {
      process.env["NODE_ENV"] = "production";
      delete process.env["CLOUDFLARE_D1_DATABASE"];
      delete process.env["DATABASE_URL"];
      delete process.env["AUTH_KV_BINDING"];
      delete process.env["AUTH_STORAGE_PROVIDER"];
      delete process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"];

      expect(isProductionAuthPermitted()).toBe(false);

      await expect(
        signUpUser({
          name: "Test User",
          email: "prod_fail@example.com",
          password: "ValidPassword123!",
        }),
      ).rejects.toThrow(/Production authentication requires a configured durable store/i);
    });

    it("permits production authentication when ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION=true", async () => {
      process.env["NODE_ENV"] = "production";
      process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] = "true";

      expect(isProductionAuthPermitted()).toBe(true);

      const { user } = await signUpUser({
        name: "Test User",
        email: "prod_override@example.com",
        password: "ValidPassword123!",
      });

      expect(user.id).toBeDefined();
    });
  });

  describe("3. Server-Managed HttpOnly, Secure, and SameSite Cookie Flags", () => {
    it("sets HttpOnly, SameSite=Lax, and Max-Age on successful login", async () => {
      const loginReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      });

      const res = await handleAuthApiRequest(loginReq);
      expect(res.status).toBe(200);

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("mst_session_token=");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Max-Age=604800");
      expect(setCookie).toContain("Path=/");
    });

    it("sets Secure flag on HTTPS requests or in production environment", async () => {
      // 1. HTTPS request
      const httpsReq = new Request("https://tokenestate.mst/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://tokenestate.mst",
        },
        body: JSON.stringify({
          email: "investor@tokenestate.mst",
          password: "MSTInvestor2026!",
        }),
      });

      const httpsRes = await handleAuthApiRequest(httpsReq);
      expect(httpsRes.status).toBe(200);
      expect(httpsRes.headers.get("Set-Cookie")).toContain("Secure");

      // 2. Production environment over reverse proxy
      process.env["NODE_ENV"] = "production";
      process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] = "true";
      process.env["ENABLE_DEMO_ACCOUNTS"] = "true";

      const prodReq = new Request("http://tokenestate.mst/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://tokenestate.mst",
        },
        body: JSON.stringify({
          email: "investor@tokenestate.mst",
          password: "MSTInvestor2026!",
        }),
      });

      const prodRes = await handleAuthApiRequest(prodReq);
      expect(prodRes.status).toBe(200);
      expect(prodRes.headers.get("Set-Cookie")).toContain("Secure");
    });

    it("clears HttpOnly cookie on logout with Max-Age=0 and expired date", async () => {
      // First login
      const loginReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "investor@tokenestate.mst",
          password: "MSTInvestor2026!",
        }),
      });
      const loginRes = await handleAuthApiRequest(loginReq);
      const setCookie = loginRes.headers.get("Set-Cookie")!;
      const tokenMatch = setCookie.match(/mst_session_token=([^;]+)/);
      const sessionToken = tokenMatch![1];

      // Now logout with cookie
      const logoutReq = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `mst_session_token=${sessionToken}`,
        },
        body: JSON.stringify({}),
      });

      const logoutRes = await handleAuthApiRequest(logoutReq);
      expect(logoutRes.status).toBe(200);

      const logoutCookie = logoutRes.headers.get("Set-Cookie");
      expect(logoutCookie).toBeDefined();
      expect(logoutCookie).toContain("Max-Age=0");
      expect(logoutCookie).toContain("Expires=Thu, 01 Jan 1970");
      expect(logoutCookie).toContain("HttpOnly");
    });
  });

  describe("4. CSRF Protection for Cookie-Authenticated State-Changing Endpoints", () => {
    it("STRICT: rejects state-changing requests when Origin header does not match host", async () => {
      const evilReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil-attacker.example.com",
        },
        body: JSON.stringify({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      });

      const res = await handleAuthApiRequest(evilReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF check failed: Origin mismatch");
    });

    it("STRICT: rejects cookie-authenticated state-changing requests without Origin or custom header", async () => {
      const cookieReq = new Request("http://localhost/api/auth/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "mst_session_token=some_token",
          // Notice: No Origin, Referer, or X-MST-CSRF header
        },
        body: JSON.stringify({
          targetUserId: "usr_investor_005",
          newRole: "ADMIN",
        }),
      });

      const res = await handleAuthApiRequest(cookieReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF check failed");
    });

    it("accepts state-changing requests when X-MST-CSRF header is present", async () => {
      const validReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MST-CSRF": "1",
        },
        body: JSON.stringify({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      });

      const res = await handleAuthApiRequest(validReq);
      expect(res.status).toBe(200);
    });

    it("accepts state-changing requests when Origin header matches request host", async () => {
      const validReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      });

      const res = await handleAuthApiRequest(validReq);
      expect(res.status).toBe(200);
    });
  });

  describe("5. Role Escalation Prevention & Payload Validation", () => {
    it("STRICT: prevents non-admin from modifying user roles over the API", async () => {
      // Login as regular investor
      const loginReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "investor@tokenestate.mst",
          password: "MSTInvestor2026!",
        }),
      });
      const loginRes = await handleAuthApiRequest(loginReq);
      const investorToken = loginRes.headers
        .get("Set-Cookie")!
        .match(/mst_session_token=([^;]+)/)![1];

      // Investor tries to promote themselves to ADMIN
      const exploitReq = new Request("http://localhost/api/auth/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `mst_session_token=${investorToken}`,
        },
        body: JSON.stringify({
          targetUserId: "usr_investor_005",
          newRole: "ADMIN",
        }),
      });

      const exploitRes = await handleAuthApiRequest(exploitReq);
      expect(exploitRes.status).toBe(403);
      const data = await exploitRes.json();
      expect(data.error).toMatch(/Access denied/i);
    });

    it("rejects invalid or unauthorized role identifiers at API boundary", async () => {
      // Login as admin
      const loginReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          email: "admin@tokenestate.mst",
          password: "MSTAdmin2026!",
        }),
      });
      const loginRes = await handleAuthApiRequest(loginReq);
      const adminToken = loginRes.headers.get("Set-Cookie")!.match(/mst_session_token=([^;]+)/)![1];

      // Try assigning an invalid role
      const invalidRoleReq = new Request("http://localhost/api/auth/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: `mst_session_token=${adminToken}`,
        },
        body: JSON.stringify({
          targetUserId: "usr_investor_005",
          newRole: "SUPER_ADMIN_ROOT",
        }),
      });

      const res = await handleAuthApiRequest(invalidRoleReq);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid role "SUPER_ADMIN_ROOT"');
    });

    it("rejects non-object root JSON payloads safely", async () => {
      const badReq = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify(["malicious", "array"]),
      });

      const res = await handleAuthApiRequest(badReq);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Root must be a JSON object");
    });
  });
});
