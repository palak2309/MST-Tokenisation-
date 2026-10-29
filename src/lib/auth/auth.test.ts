import { describe, expect, it, beforeEach } from "vitest";
import {
  assignUserRole,
  getAllUsers,
  getAuditLogs,
  loginUser,
  logoutUser,
  resetAuthStateForTesting,
  signUpUser,
  validateSession,
} from "./serverAuth";

describe("Role-Based Authentication and Access Control", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
  });

  describe("Public Signup & Default Role Assignment", () => {
    it("assigns INVESTOR role by default to new public registrations", async () => {
      const { user, session } = await signUpUser({
        name: "Bob Investor",
        email: "bob@example.com",
        password: "StrongPassword2026!",
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe("bob@example.com");
      expect(user.name).toBe("Bob Investor");
      expect(user.role).toBe("INVESTOR");
      expect(session.id).toBeDefined();

      // Ensure password hash / salt are not leaked to public User object
      // @ts-expect-error verifying property does not exist on sanitized user
      expect(user.passwordHash).toBeUndefined();
      // @ts-expect-error verifying property does not exist on sanitized user
      expect(user.passwordSalt).toBeUndefined();
    });

    it("STRICT: rejects or overrides privilege escalation attempts during signup", async () => {
      // Attacker attempts to inject role: 'ADMIN' in registration payload
      const { user } = await signUpUser({
        name: "Malicious Actor",
        email: "attacker@example.com",
        password: "AttackerPassword2026!",
        // @ts-expect-error simulating client API payload tampering
        role: "ADMIN",
      });

      // Role must strictly be INVESTOR
      expect(user.role).toBe("INVESTOR");
      expect(user.role).not.toBe("ADMIN");
    });

    it("rejects duplicate email registrations", async () => {
      await signUpUser({
        name: "First User",
        email: "unique@example.com",
        password: "Password123!",
      });

      await expect(
        signUpUser({
          name: "Second User",
          email: "unique@example.com",
          password: "Password123!",
        }),
      ).rejects.toThrow("An account with this email address already exists.");
    });

    it("rejects passwords shorter than 8 characters", async () => {
      await expect(
        signUpUser({
          name: "Short Pwd",
          email: "short@example.com",
          password: "123",
        }),
      ).rejects.toThrow("Password must be at least 8 characters long.");
    });
  });

  describe("Authentication & Session Management", () => {
    it("authenticates seeded platform admin and returns valid session", async () => {
      const { user, session } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      expect(user.role).toBe("ADMIN");
      expect(session.id).toBeDefined();

      const validated = await validateSession(session.id);
      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(user.id);
    });

    it("rejects invalid passwords and records unauthorized attempt", async () => {
      await expect(
        loginUser({
          email: "admin@tokenestate.mst",
          password: "WrongPassword!",
        }),
      ).rejects.toThrow("Invalid email or password.");
    });

    it("invalidates session upon logout", async () => {
      const { session } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      expect(await validateSession(session.id)).not.toBeNull();

      const loggedOut = await logoutUser(session.id);
      expect(loggedOut).toBe(true);

      expect(await validateSession(session.id)).toBeNull();
    });
  });

  describe("Server-Side Authorization & Privilege Escalation Prevention", () => {
    it("allows ADMIN to assign roles to other users and logs the audit event", async () => {
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const { user: investorUser } = await signUpUser({
        name: "Promoted Officer",
        email: "promoted@example.com",
        password: "Password1234!",
      });
      expect(investorUser.role).toBe("INVESTOR");

      const updatedUser = await assignUserRole({
        adminSessionId: adminSession.id,
        targetUserId: investorUser.id,
        newRole: "COMPLIANCE_OFFICER",
      });

      expect(updatedUser.role).toBe("COMPLIANCE_OFFICER");

      // Verify audit logs contain the assignment
      const logs = await getAuditLogs(adminSession.id);
      const roleLog = logs.find(
        (l) => l.action === "ROLE_ASSIGNED" && l.targetUserId === investorUser.id,
      );
      expect(roleLog).toBeDefined();
      expect(roleLog?.details["previousRole"]).toBe("INVESTOR");
      expect(roleLog?.details["newRole"]).toBe("COMPLIANCE_OFFICER");
    });

    it("STRICT: denies non-admin users from assigning roles", async () => {
      const { session: investorSession } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      const { user: targetUser } = await signUpUser({
        name: "Target User",
        email: "target@example.com",
        password: "Password1234!",
      });

      await expect(
        assignUserRole({
          adminSessionId: investorSession.id,
          targetUserId: targetUser.id,
          newRole: "PROPERTY_ISSUER",
        }),
      ).rejects.toThrow(
        "Access denied: Only authenticated administrators can assign or modify application roles.",
      );
    });

    it("STRICT: prevents non-admin from fetching all users or audit logs", async () => {
      const { session: issuerSession } = await loginUser({
        email: "issuer@tokenestate.mst",
        password: "MSTIssuer2026!",
      });

      await expect(getAllUsers(issuerSession.id)).rejects.toThrow(
        "Access denied: Administrative privileges required.",
      );
      await expect(getAuditLogs(issuerSession.id)).rejects.toThrow(
        "Access denied: Administrative privileges required.",
      );
    });
  });
});
