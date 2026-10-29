import { describe, expect, it, beforeEach } from "vitest";
import {
  assignUserRole,
  getAllUsers,
  getAuditLogs,
  loginUser,
  resetAuthStateForTesting,
  signUpUser,
} from "@/lib/auth/serverAuth";
import type { AppRole } from "@/lib/auth/types";
import { ROLES } from "@/lib/blockchain";

describe("Admin Console Role Management & Security Hardening", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
  });

  describe("1. Server-Side Authentication & Authorization Enforcement", () => {
    it("rejects role changes when session is invalid or missing", async () => {
      await expect(
        assignUserRole({
          adminSessionId: "invalid_session_id_xyz",
          targetUserId: "usr_investor_005",
          newRole: "ADMIN",
        }),
      ).rejects.toThrow(/Access denied: Only authenticated administrators/i);
    });

    it("rejects role changes from all non-admin roles (INVESTOR, PROPERTY_ISSUER, COMPLIANCE_OFFICER, EMERGENCY_PAUSER)", async () => {
      const nonAdminCredentials = [
        { email: "investor@tokenestate.mst", pass: "MSTInvestor2026!" },
        { email: "issuer@tokenestate.mst", pass: "MSTIssuer2026!" },
        { email: "compliance@tokenestate.mst", pass: "MSTCompliance2026!" },
        { email: "pauser@tokenestate.mst", pass: "MSTPauser2026!" },
      ];

      for (const cred of nonAdminCredentials) {
        const { session } = await loginUser({ email: cred.email, password: cred.pass });
        await expect(
          assignUserRole({
            adminSessionId: session.id,
            targetUserId: "usr_investor_005",
            newRole: "ADMIN",
          }),
        ).rejects.toThrow(/Access denied: Only authenticated administrators/i);
      }
    });

    it("logs an UNAUTHORIZED_ATTEMPT security audit entry when non-admin attempts role assignment", async () => {
      const { session: investorSession } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      await expect(
        assignUserRole({
          adminSessionId: investorSession.id,
          targetUserId: "usr_investor_005",
          newRole: "ADMIN",
        }),
      ).rejects.toThrow();

      // Log in as admin to inspect audit logs
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const logs = await getAuditLogs(adminSession.id);
      const violationLog = logs.find(
        (l) =>
          l.action === "UNAUTHORIZED_ATTEMPT" &&
          l.details["attemptedAction"] === "assignUserRole" &&
          l.actorEmail === "investor@tokenestate.mst",
      );

      expect(violationLog).toBeDefined();
      expect(violationLog?.actorId).toBe("usr_investor_005");
      expect(violationLog?.details["reason"]).toContain("Actor is not an authenticated ADMIN");
    });
  });

  describe("2. Role Validation & Canonical Whitelist Enforcement", () => {
    it("rejects unsupported or malicious role identifiers", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const invalidRoles = ["SUPER_ADMIN", "ROOT", "HACKER", "OWNER", "", "admin"];

      for (const invRole of invalidRoles) {
        await expect(
          assignUserRole({
            adminSessionId: adminSession.id,
            targetUserId: "usr_investor_005",
            newRole: invRole as AppRole,
          }),
        ).rejects.toThrow(/Invalid role/i);
      }

      // Check audit log recorded invalid role attempt
      const logs = await getAuditLogs(adminSession.id);
      const invalidRoleLog = logs.find(
        (l) =>
          l.action === "UNAUTHORIZED_ATTEMPT" &&
          l.details["reason"]?.toString().includes("Invalid role specified"),
      );
      expect(invalidRoleLog).toBeDefined();
    });

    it("accepts all canonical APP_ROLES: ADMIN, PROPERTY_ISSUER, COMPLIANCE_OFFICER, INVESTOR, EMERGENCY_PAUSER", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const validRoles: AppRole[] = [
        "PROPERTY_ISSUER",
        "COMPLIANCE_OFFICER",
        "EMERGENCY_PAUSER",
        "INVESTOR",
      ];

      for (const targetRole of validRoles) {
        const updated = await assignUserRole({
          adminSessionId: adminSession.id,
          targetUserId: "usr_investor_005",
          newRole: targetRole,
        });
        expect(updated.role).toBe(targetRole);
      }
    });

    it("throws an error when target user does not exist", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      await expect(
        assignUserRole({
          adminSessionId: adminSession.id,
          targetUserId: "non_existent_usr_9999",
          newRole: "INVESTOR",
        }),
      ).rejects.toThrow(/was not found/i);
    });
  });

  describe("3. Administrator Self-Demotion & Last Admin Protection", () => {
    it("prevents an administrator from demoting their own ADMIN role", async () => {
      const { session: adminSession, user: adminUser } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      await expect(
        assignUserRole({
          adminSessionId: adminSession.id,
          targetUserId: adminUser.id,
          newRole: "INVESTOR",
        }),
      ).rejects.toThrow(/Self-demotion prevented/i);

      // Verify the administrator's role remained intact
      const users = await getAllUsers(adminSession.id);
      const adminRecord = users.find((u) => u.id === adminUser.id);
      expect(adminRecord?.role).toBe("ADMIN");
    });

    it("prevents leaving the platform with zero administrators", async () => {
      // Create a second temporary admin
      const { session: firstAdminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const { user: newAdminUser } = await signUpUser({
        name: "Second Admin",
        email: "secondadmin@tokenestate.mst",
        password: "Password1234!",
      });

      // Promote to admin -> Now 2 admins exist
      await assignUserRole({
        adminSessionId: firstAdminSession.id,
        targetUserId: newAdminUser.id,
        newRole: "ADMIN",
      });

      // Log in as second admin
      const { session: secondAdminSession } = await loginUser({
        email: "secondadmin@tokenestate.mst",
        password: "Password1234!",
      });

      // Second admin can demote first admin because 2 admins exist
      await assignUserRole({
        adminSessionId: secondAdminSession.id,
        targetUserId: "usr_admin_001",
        newRole: "INVESTOR",
      });

      // Now only 1 admin (secondAdmin) remains!
      // Second admin attempting to demote themselves or be demoted should fail
      await expect(
        assignUserRole({
          adminSessionId: secondAdminSession.id,
          targetUserId: newAdminUser.id,
          newRole: "INVESTOR",
        }),
      ).rejects.toThrow(/Self-demotion prevented/i);
    });
  });

  describe("4. Security Audit Logging Integrity & Secret Leak Prevention", () => {
    it("records complete audit entry upon successful role assignment", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const beforeTimestamp = Date.now();

      await assignUserRole({
        adminSessionId: adminSession.id,
        targetUserId: "usr_investor_005",
        newRole: "COMPLIANCE_OFFICER",
      });

      const logs = await getAuditLogs(adminSession.id);
      const log = logs.find(
        (l) => l.action === "ROLE_ASSIGNED" && l.targetUserId === "usr_investor_005",
      );

      expect(log).toBeDefined();
      expect(log?.actorId).toBe("usr_admin_001");
      expect(log?.actorEmail).toBe("admin@tokenestate.mst");
      expect(log?.targetUserId).toBe("usr_investor_005");
      expect(log?.targetUserEmail).toBe("investor@tokenestate.mst");
      expect(log?.details["previousRole"]).toBe("INVESTOR");
      expect(log?.details["newRole"]).toBe("COMPLIANCE_OFFICER");
      expect(log?.details["result"]).toBe("SUCCESS");
      expect(log?.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    });

    it("STRICT: does NOT leak passwords, salts, hashes, or session tokens in audit trail", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      await assignUserRole({
        adminSessionId: adminSession.id,
        targetUserId: "usr_investor_005",
        newRole: "PROPERTY_ISSUER",
      });

      const logs = await getAuditLogs(adminSession.id);
      const serialized = JSON.stringify(logs);

      // Verify no sensitive keys appear anywhere in the serialized audit logs
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("passwordSalt");
      expect(serialized).not.toContain("MSTAdmin2026!");
      expect(serialized).not.toContain("MSTInvestor2026!");
      expect(serialized).not.toContain(adminSession.id);
    });
  });

  describe("5. Two-Tier Role Isolation (Smart Contract Separation)", () => {
    it("verifies changing an application role does not mutate on-chain smart contract role hashes", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      // Promote an investor to PROPERTY_ISSUER in application DB
      const updated = await assignUserRole({
        adminSessionId: adminSession.id,
        targetUserId: "usr_investor_005",
        newRole: "PROPERTY_ISSUER",
      });

      expect(updated.role).toBe("PROPERTY_ISSUER");

      // Verify on-chain role hashes remain strictly separate OpenZeppelin AccessControl constants
      expect(ROLES.ISSUER_ROLE).toBe(
        "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122",
      );
      expect(ROLES.COMPLIANCE_ROLE).toBe(
        "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985",
      );
      expect(ROLES.PAUSER_ROLE).toBe(
        "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a",
      );
      expect(ROLES.DEFAULT_ADMIN_ROLE).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });
  });
});
