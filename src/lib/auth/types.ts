export type AppRole =
  "ADMIN" | "PROPERTY_ISSUER" | "COMPLIANCE_OFFICER" | "INVESTOR" | "EMERGENCY_PAUSER";

export const APP_ROLES: readonly AppRole[] = [
  "ADMIN",
  "PROPERTY_ISSUER",
  "COMPLIANCE_OFFICER",
  "INVESTOR",
  "EMERGENCY_PAUSER",
] as const;

export interface User {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  linkedWalletAddress?: string | undefined;
  createdAt: number;
  lastLoginAt?: number | undefined;
}

export interface UserRecord extends User {
  passwordHash: string;
  passwordSalt: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "SIGNUP"
  | "ROLE_ASSIGNED"
  | "ROLE_REVOKED"
  | "WALLET_LINKED"
  | "UNAUTHORIZED_ATTEMPT";

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  targetUserId?: string | undefined;
  targetUserEmail?: string | undefined;
  details: Record<string, unknown>;
}

export interface AuthSessionResponse {
  user: User | null;
  session: Session | null;
}

export interface RolePermissions {
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
  canRegisterPropertyTokens: boolean;
  canIssueUnits: boolean;
  canManageInvestorCompliance: boolean;
  canPauseContract: boolean;
  canViewInvestorPortfolio: boolean;
}

export const ROLE_PERMISSIONS: Record<AppRole, RolePermissions> = {
  ADMIN: {
    canManageUsers: true,
    canViewAuditLogs: true,
    canRegisterPropertyTokens: true,
    canIssueUnits: true,
    canManageInvestorCompliance: true,
    canPauseContract: true,
    canViewInvestorPortfolio: true,
  },
  PROPERTY_ISSUER: {
    canManageUsers: false,
    canViewAuditLogs: false,
    canRegisterPropertyTokens: true,
    canIssueUnits: true,
    canManageInvestorCompliance: false,
    canPauseContract: false,
    canViewInvestorPortfolio: true,
  },
  COMPLIANCE_OFFICER: {
    canManageUsers: false,
    canViewAuditLogs: false,
    canRegisterPropertyTokens: false,
    canIssueUnits: false,
    canManageInvestorCompliance: true,
    canPauseContract: false,
    canViewInvestorPortfolio: true,
  },
  INVESTOR: {
    canManageUsers: false,
    canViewAuditLogs: false,
    canRegisterPropertyTokens: false,
    canIssueUnits: false,
    canManageInvestorCompliance: false,
    canPauseContract: false,
    canViewInvestorPortfolio: true,
  },
  EMERGENCY_PAUSER: {
    canManageUsers: false,
    canViewAuditLogs: false,
    canRegisterPropertyTokens: false,
    canIssueUnits: false,
    canManageInvestorCompliance: false,
    canPauseContract: true,
    canViewInvestorPortfolio: true,
  },
};
