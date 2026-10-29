import { describe, expect, it, beforeEach } from "vitest";
import { getSidebarLinksForRole } from "@/components/AppShell";
import {
  assignUserRole,
  getAllUsers,
  getAuditLogs,
  loginUser,
  resetAuthStateForTesting,
} from "@/lib/auth/serverAuth";
import { ROLE_PERMISSIONS } from "@/lib/auth/types";

describe("Role-based Navigation & Authorization Enforcement", () => {
  beforeEach(() => {
    resetAuthStateForTesting();
  });

  describe("Sidebar Links by Authenticated Role", () => {
    it("renders strictly investor-scoped links for INVESTOR role", () => {
      const links = getSidebarLinksForRole("INVESTOR");
      const labels = links.map((l) => l.label);
      const paths = links.map((l) => l.to);

      // INVESTOR must see:
      expect(paths).toContain("/");
      expect(paths).toContain("/verify");
      expect(paths).toContain("/invest");
      expect(paths).toContain("/rental");
      expect(paths).toContain("/activity");
      expect(paths).toContain("/about");

      // INVESTOR must NOT see:
      expect(paths).not.toContain("/properties/new");
      expect(paths).not.toContain("/admin");
      expect(paths).not.toContain("/pause");

      expect(labels).not.toContain("Add Property");
      expect(labels).not.toContain("Admin Console");
      expect(labels).not.toContain("Emergency Pause Controls");
    });

    it("renders property issuance options for PROPERTY_ISSUER role", () => {
      const links = getSidebarLinksForRole("PROPERTY_ISSUER");
      const labels = links.map((l) => l.label);
      const paths = links.map((l) => l.to);

      expect(paths).toContain("/");
      expect(paths).toContain("/properties/new");
      expect(paths).toContain("/verify");
      expect(paths).toContain("/invest");
      expect(paths).toContain("/activity");
      expect(paths).toContain("/about");

      // PROPERTY_ISSUER must NOT see:
      expect(paths).not.toContain("/admin");
      expect(paths).not.toContain("/pause");
      expect(paths).not.toContain("/rental");

      expect(labels).toContain("Add Property");
      expect(labels).not.toContain("Admin Console");
      expect(labels).not.toContain("Emergency Pause Controls");
    });

    it("renders compliance controls for COMPLIANCE_OFFICER role", () => {
      const links = getSidebarLinksForRole("COMPLIANCE_OFFICER");
      const labels = links.map((l) => l.label);
      const paths = links.map((l) => l.to);

      expect(paths).toContain("/");
      expect(paths).toContain("/verify");
      expect(paths).toContain("/invest");
      expect(paths).toContain("/activity");
      expect(paths).toContain("/about");

      // COMPLIANCE_OFFICER must NOT see:
      expect(paths).not.toContain("/properties/new");
      expect(paths).not.toContain("/admin");
      expect(paths).not.toContain("/pause");
      expect(paths).not.toContain("/rental");

      expect(labels).not.toContain("Add Property");
      expect(labels).not.toContain("Admin Console");
    });

    it("renders full administrative controls for ADMIN role", () => {
      const links = getSidebarLinksForRole("ADMIN");
      const labels = links.map((l) => l.label);
      const paths = links.map((l) => l.to);

      expect(paths).toContain("/");
      expect(paths).toContain("/admin");
      expect(paths).toContain("/properties/new");
      expect(paths).toContain("/verify");
      expect(paths).toContain("/invest");
      expect(paths).toContain("/pause");
      expect(paths).toContain("/activity");
      expect(paths).toContain("/about");

      expect(labels).toContain("Admin Console");
      expect(labels).toContain("Add Property");
      expect(labels).toContain("Emergency Pause Controls");
    });

    it("renders narrowly scoped emergency controls for EMERGENCY_PAUSER role", () => {
      const links = getSidebarLinksForRole("EMERGENCY_PAUSER");
      const labels = links.map((l) => l.label);
      const paths = links.map((l) => l.to);

      expect(paths).toContain("/");
      expect(paths).toContain("/pause");
      expect(paths).toContain("/activity");
      expect(paths).toContain("/about");

      // EMERGENCY_PAUSER must NOT see general operational controls:
      expect(paths).not.toContain("/properties/new");
      expect(paths).not.toContain("/admin");
      expect(paths).not.toContain("/verify");
      expect(paths).not.toContain("/rental");

      expect(labels).toContain("Emergency Pause Controls");
      expect(labels).not.toContain("Add Property");
      expect(labels).not.toContain("Admin Console");
    });
  });

  describe("Server-Side Permission & Role Mappings", () => {
    it("confirms INVESTOR permissions disallow privileged actions", () => {
      const perms = ROLE_PERMISSIONS.INVESTOR;
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canViewAuditLogs).toBe(false);
      expect(perms.canRegisterPropertyTokens).toBe(false);
      expect(perms.canIssueUnits).toBe(false);
      expect(perms.canManageInvestorCompliance).toBe(false);
      expect(perms.canPauseContract).toBe(false);
      expect(perms.canViewInvestorPortfolio).toBe(true);
    });

    it("denies INVESTOR from executing assignUserRole", async () => {
      const { session } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      await expect(
        assignUserRole({
          adminSessionId: session.id,
          targetUserId: "usr_admin_001",
          newRole: "ADMIN",
        }),
      ).rejects.toThrow(/Access denied/i);
    });

    it("denies INVESTOR from executing getAllUsers", async () => {
      const { session } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      await expect(getAllUsers(session.id)).rejects.toThrow(/Access denied/i);
    });

    it("denies INVESTOR from executing getAuditLogs", async () => {
      const { session } = await loginUser({
        email: "investor@tokenestate.mst",
        password: "MSTInvestor2026!",
      });

      await expect(getAuditLogs(session.id)).rejects.toThrow(/Access denied/i);
    });

    it("permits ADMIN to execute user management and audit logging", async () => {
      const { session } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
      });

      const users = await getAllUsers(session.id);
      expect(users.length).toBeGreaterThan(0);

      const logs = await getAuditLogs(session.id);
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
