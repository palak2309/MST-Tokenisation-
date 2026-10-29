import {
  type AppRole,
  type AuditLogEntry,
  type Session,
  type User,
  type UserRecord,
  APP_ROLES,
} from "./types";
import { generateSalt, generateSessionId, hashPassword, verifyPassword } from "./crypto";

// Default session duration: 7 days
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthState {
  users: Map<string, UserRecord>; // userId -> UserRecord
  usersByEmail: Map<string, string>; // lowercase email -> userId
  sessions: Map<string, Session>; // sessionId -> Session
  auditLogs: AuditLogEntry[];
  initialized: boolean;
}

const state: AuthState = {
  users: new Map(),
  usersByEmail: new Map(),
  sessions: new Map(),
  auditLogs: [],
  initialized: false,
};

// Cached default seeded records so that test runs with resetAuthStateForTesting
// do not re-run 500,000 PBKDF2 derivations on every single test case.
let cachedSeededRecords: UserRecord[] | null = null;

/**
 * 1. Demo Accounts Gating:
 * Hardcoded demo accounts and passwords (e.g. MSTAdmin2026!) must NEVER be seeded
 * in production unless explicitly enabled via ENABLE_DEMO_ACCOUNTS="true".
 * In development, test, and local evaluation modes, demo profiles are seeded safely.
 */
export function isDemoAccountsAllowed(): boolean {
  if (process.env["ENABLE_DEMO_ACCOUNTS"] === "true") return true;
  if (process.env["ENABLE_DEMO_ACCOUNTS"] === "false") return false;
  return process.env["NODE_ENV"] !== "production";
}

/**
 * 2. Cloudflare Workers In-Memory Storage Assessment & Gating:
 * Cloudflare Workers is a distributed multi-region serverless runtime.
 * In-memory state (`state.users`, `state.sessions`) is isolate-scoped, is NOT shared
 * across edge data centers, and is wiped on cold restarts.
 *
 * Durable production authentication requires an actual persistent backing store:
 * Cloudflare D1, Cloudflare KV, or an external database (e.g. Supabase, PostgreSQL).
 *
 * In production mode, if no durable storage is configured, authentication operations fail safely
 * with a clear error unless ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION="true" is set.
 */
export function isPersistentStorageConfigured(): boolean {
  return Boolean(
    process.env["CLOUDFLARE_D1_DATABASE"] ||
    process.env["DATABASE_URL"] ||
    process.env["AUTH_KV_BINDING"] ||
    process.env["AUTH_STORAGE_PROVIDER"] === "d1" ||
    process.env["AUTH_STORAGE_PROVIDER"] === "kv" ||
    process.env["AUTH_STORAGE_PROVIDER"] === "external",
  );
}

export function isProductionAuthPermitted(): boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  if (isPersistentStorageConfigured()) return true;
  return process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] === "true";
}

export function getAuthStorageStatus(): {
  isDurable: boolean;
  provider: "in-memory" | "cloudflare-d1" | "cloudflare-kv" | "external-db";
  environment: string;
  demoAccountsEnabled: boolean;
  ephemeralAllowedInProduction: boolean;
} {
  const isDurable = isPersistentStorageConfigured();
  let provider: "in-memory" | "cloudflare-d1" | "cloudflare-kv" | "external-db" = "in-memory";
  if (process.env["CLOUDFLARE_D1_DATABASE"] || process.env["AUTH_STORAGE_PROVIDER"] === "d1") {
    provider = "cloudflare-d1";
  } else if (process.env["AUTH_KV_BINDING"] || process.env["AUTH_STORAGE_PROVIDER"] === "kv") {
    provider = "cloudflare-kv";
  } else if (process.env["DATABASE_URL"] || process.env["AUTH_STORAGE_PROVIDER"] === "external") {
    provider = "external-db";
  }

  return {
    isDurable,
    provider,
    environment: process.env["NODE_ENV"] || "development",
    demoAccountsEnabled: isDemoAccountsAllowed(),
    ephemeralAllowedInProduction: process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] === "true",
  };
}

function verifyStorageForAuthOperation(): void {
  if (!isProductionAuthPermitted()) {
    throw new Error(
      "Production authentication requires a configured durable store (Cloudflare D1, KV, or external database). Ephemeral in-memory auth storage is disabled in production to prevent data loss across serverless edge isolates. Configure a persistent store or set ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION=true to allow ephemeral authentication for evaluation.",
    );
  }
}

// Seed initial system users with secure hashed credentials (development/demo mode only)
export async function ensureInitialized(): Promise<void> {
  if (state.initialized) return;

  if (isDemoAccountsAllowed()) {
    if (!cachedSeededRecords) {
      const defaultUsers: Array<{
        id: string;
        email: string;
        name: string;
        role: AppRole;
        password: string;
        linkedWalletAddress?: string;
      }> = [
        {
          id: "usr_admin_001",
          email: "admin@tokenestate.mst",
          name: "Platform Administrator",
          role: "ADMIN",
          password: "MSTAdmin2026!",
          linkedWalletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        },
        {
          id: "usr_issuer_002",
          email: "issuer@tokenestate.mst",
          name: "Acme Real Estate Issuance",
          role: "PROPERTY_ISSUER",
          password: "MSTIssuer2026!",
          linkedWalletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        },
        {
          id: "usr_compliance_003",
          email: "compliance@tokenestate.mst",
          name: "Chief Compliance Officer",
          role: "COMPLIANCE_OFFICER",
          password: "MSTCompliance2026!",
          linkedWalletAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        },
        {
          id: "usr_pauser_004",
          email: "pauser@tokenestate.mst",
          name: "Emergency Operations Guardian",
          role: "EMERGENCY_PAUSER",
          password: "MSTPauser2026!",
          linkedWalletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        },
        {
          id: "usr_investor_005",
          email: "investor@tokenestate.mst",
          name: "Retail Verified Investor",
          role: "INVESTOR",
          password: "MSTInvestor2026!",
          linkedWalletAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df",
        },
      ];

      cachedSeededRecords = [];
      for (const u of defaultUsers) {
        const salt = generateSalt(16);
        const passwordHash = await hashPassword(u.password, salt);
        cachedSeededRecords.push({
          id: u.id,
          email: u.email.toLowerCase(),
          name: u.name,
          role: u.role,
          passwordHash,
          passwordSalt: salt,
          linkedWalletAddress: u.linkedWalletAddress,
          createdAt: Date.now() - 3600 * 24 * 30 * 1000,
        });
      }
    }

    for (const record of cachedSeededRecords) {
      state.users.set(record.id, { ...record });
      state.usersByEmail.set(record.email, record.id);
    }

    recordAuditLog({
      actorId: "system",
      actorEmail: "system@mstblockchain.com",
      action: "SIGNUP",
      details: {
        message: "System initialized with seeded role profiles for local/demo evaluation.",
      },
    });
  } else {
    recordAuditLog({
      actorId: "system",
      actorEmail: "system@mstblockchain.com",
      action: "SIGNUP",
      details: {
        message:
          "Production environment active: Seeded demo accounts and hardcoded credentials disabled.",
      },
    });
  }

  state.initialized = true;
}

function sanitizeUser(record: UserRecord): User {
  const { passwordHash: _hash, passwordSalt: _salt, ...safeUser } = record;
  return safeUser;
}

function recordAuditLog(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
  const fullEntry: AuditLogEntry = {
    id: `log_${generateSessionId().slice(0, 12)}`,
    timestamp: Date.now(),
    ...entry,
  };
  state.auditLogs.unshift(fullEntry);
  // Cap at 1000 entries
  if (state.auditLogs.length > 1000) {
    state.auditLogs.pop();
  }
  return fullEntry;
}

export async function signUpUser(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: User; session: Session }> {
  verifyStorageForAuthOperation();
  await ensureInitialized();

  const name = typeof params.name === "string" ? params.name.trim() : "";
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const password = typeof params.password === "string" ? params.password : "";

  if (!name || name.length < 2) {
    throw new Error("Full name must be at least 2 characters.");
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    throw new Error("A valid email address is required.");
  }
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  if (state.usersByEmail.has(email)) {
    throw new Error("An account with this email address already exists.");
  }

  // STRICT SECURITY RULE: Public signups ALWAYS receive INVESTOR role.
  // Users cannot select or override this role during signup.
  const assignedRole: AppRole = "INVESTOR";

  const salt = generateSalt(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = `usr_${generateSessionId().slice(0, 16)}`;

  const record: UserRecord = {
    id: userId,
    email,
    name,
    role: assignedRole,
    passwordHash,
    passwordSalt: salt,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };

  state.users.set(userId, record);
  state.usersByEmail.set(email, userId);

  // Create session
  const session: Session = {
    id: generateSessionId(),
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  state.sessions.set(session.id, session);

  recordAuditLog({
    actorId: userId,
    actorEmail: email,
    action: "SIGNUP",
    targetUserId: userId,
    targetUserEmail: email,
    details: { assignedRole, note: "Public registration default INVESTOR role assigned." },
  });

  return { user: sanitizeUser(record), session };
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<{ user: User; session: Session }> {
  verifyStorageForAuthOperation();
  await ensureInitialized();

  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const password = typeof params.password === "string" ? params.password : "";

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  const userId = state.usersByEmail.get(email);
  if (!userId) {
    recordAuditLog({
      actorId: "anonymous",
      actorEmail: email,
      action: "UNAUTHORIZED_ATTEMPT",
      details: { reason: "User not found" },
    });
    throw new Error("Invalid email or password.");
  }

  const record = state.users.get(userId);
  if (!record) {
    throw new Error("Invalid email or password.");
  }

  const valid = await verifyPassword(password, record.passwordSalt, record.passwordHash);
  if (!valid) {
    recordAuditLog({
      actorId: userId,
      actorEmail: email,
      action: "UNAUTHORIZED_ATTEMPT",
      targetUserId: userId,
      details: { reason: "Password mismatch" },
    });
    throw new Error("Invalid email or password.");
  }

  record.lastLoginAt = Date.now();

  const session: Session = {
    id: generateSessionId(),
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  state.sessions.set(session.id, session);

  recordAuditLog({
    actorId: userId,
    actorEmail: email,
    action: "LOGIN",
    details: { role: record.role },
  });

  return { user: sanitizeUser(record), session };
}

export async function logoutUser(sessionId: string): Promise<boolean> {
  await ensureInitialized();

  if (!sessionId || typeof sessionId !== "string") return false;

  const session = state.sessions.get(sessionId);
  if (session) {
    const user = state.users.get(session.userId);
    recordAuditLog({
      actorId: session.userId,
      actorEmail: user?.email ?? "unknown",
      action: "LOGOUT",
      details: {},
    });
    state.sessions.delete(sessionId);
    return true;
  }
  return false;
}

export async function validateSession(
  sessionId: string,
): Promise<{ user: User; session: Session } | null> {
  await ensureInitialized();

  if (!sessionId || typeof sessionId !== "string") return null;

  const session = state.sessions.get(sessionId);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    state.sessions.delete(sessionId);
    return null;
  }

  const record = state.users.get(session.userId);
  if (!record) {
    state.sessions.delete(sessionId);
    return null;
  }

  return { user: sanitizeUser(record), session };
}

export async function assignUserRole(params: {
  adminSessionId: string;
  targetUserId: string;
  newRole: AppRole;
}): Promise<User> {
  verifyStorageForAuthOperation();
  await ensureInitialized();

  if (!params.adminSessionId || typeof params.adminSessionId !== "string") {
    throw new Error(
      "Access denied: Only authenticated administrators can assign or modify application roles.",
    );
  }

  // 1. Authenticate caller session strictly on the server
  const sessionAuth = await validateSession(params.adminSessionId);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    recordAuditLog({
      actorId: sessionAuth?.user.id ?? "anonymous",
      actorEmail: sessionAuth?.user.email ?? "unknown",
      action: "UNAUTHORIZED_ATTEMPT",
      targetUserId: params.targetUserId,
      details: {
        attemptedAction: "assignUserRole",
        attemptedRole: params.newRole,
        reason: "Actor is not an authenticated ADMIN",
      },
    });
    throw new Error(
      "Access denied: Only authenticated administrators can assign or modify application roles.",
    );
  }

  // 2. Validate allowed roles against canonical whitelist
  if (!APP_ROLES.includes(params.newRole)) {
    recordAuditLog({
      actorId: sessionAuth.user.id,
      actorEmail: sessionAuth.user.email,
      action: "UNAUTHORIZED_ATTEMPT",
      targetUserId: params.targetUserId,
      details: {
        attemptedAction: "assignUserRole",
        attemptedRole: String(params.newRole),
        reason: `Invalid role specified. Supported roles: ${APP_ROLES.join(", ")}`,
      },
    });
    throw new Error(
      `Invalid role "${String(params.newRole)}". Supported roles: ${APP_ROLES.join(", ")}`,
    );
  }

  // 3. Locate target user
  const target = state.users.get(params.targetUserId);
  if (!target) {
    throw new Error(`Target user "${params.targetUserId}" was not found.`);
  }

  // 4. Prevent administrator self-demotion
  if (sessionAuth.user.id === target.id && params.newRole !== "ADMIN") {
    recordAuditLog({
      actorId: sessionAuth.user.id,
      actorEmail: sessionAuth.user.email,
      action: "UNAUTHORIZED_ATTEMPT",
      targetUserId: target.id,
      targetUserEmail: target.email,
      details: {
        attemptedAction: "self_demotion",
        currentRole: target.role,
        attemptedRole: params.newRole,
        reason: "Administrators cannot remove or demote their own ADMIN role.",
      },
    });
    throw new Error(
      "Self-demotion prevented: Administrators cannot remove their own ADMIN role. Another administrator must perform this action.",
    );
  }

  // 5. Prevent leaving the platform without an administrator
  if (target.role === "ADMIN" && params.newRole !== "ADMIN") {
    const totalAdmins = Array.from(state.users.values()).filter((u) => u.role === "ADMIN").length;
    if (totalAdmins <= 1) {
      recordAuditLog({
        actorId: sessionAuth.user.id,
        actorEmail: sessionAuth.user.email,
        action: "UNAUTHORIZED_ATTEMPT",
        targetUserId: target.id,
        targetUserEmail: target.email,
        details: {
          attemptedAction: "demote_last_admin",
          currentRole: target.role,
          attemptedRole: params.newRole,
          reason: "Cannot demote the last remaining platform administrator.",
        },
      });
      throw new Error(
        "Action denied: Cannot remove the last platform administrator. At least one administrator must remain active at all times.",
      );
    }
  }

  const previousRole = target.role;
  target.role = params.newRole;

  // 6. Record immutable security audit log entry
  recordAuditLog({
    actorId: sessionAuth.user.id,
    actorEmail: sessionAuth.user.email,
    action: "ROLE_ASSIGNED",
    targetUserId: target.id,
    targetUserEmail: target.email,
    details: {
      actorId: sessionAuth.user.id,
      actorEmail: sessionAuth.user.email,
      targetUserId: target.id,
      targetUserEmail: target.email,
      previousRole,
      newRole: params.newRole,
      result: "SUCCESS",
      note: "Application role updated off-chain. Smart contract on-chain roles are unchanged and require separate cryptographic admin transactions.",
    },
  });

  return sanitizeUser(target);
}

export async function linkWalletToUser(params: {
  sessionId: string;
  walletAddress: string;
}): Promise<User> {
  await ensureInitialized();

  if (!params.sessionId || typeof params.sessionId !== "string") {
    throw new Error("Authentication required to link a wallet address.");
  }

  const sessionAuth = await validateSession(params.sessionId);
  if (!sessionAuth) {
    throw new Error("Authentication required to link a wallet address.");
  }

  const address = typeof params.walletAddress === "string" ? params.walletAddress.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM wallet address.");
  }

  const userRecord = state.users.get(sessionAuth.user.id);
  if (!userRecord) {
    throw new Error("User record not found.");
  }

  userRecord.linkedWalletAddress = address;

  recordAuditLog({
    actorId: userRecord.id,
    actorEmail: userRecord.email,
    action: "WALLET_LINKED",
    details: { linkedWalletAddress: address },
  });

  return sanitizeUser(userRecord);
}

export async function getAllUsers(adminSessionId: string): Promise<User[]> {
  await ensureInitialized();

  if (!adminSessionId || typeof adminSessionId !== "string") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  const sessionAuth = await validateSession(adminSessionId);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  return Array.from(state.users.values()).map(sanitizeUser);
}

export async function getAuditLogs(adminSessionId: string): Promise<AuditLogEntry[]> {
  await ensureInitialized();

  if (!adminSessionId || typeof adminSessionId !== "string") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  const sessionAuth = await validateSession(adminSessionId);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  return [...state.auditLogs];
}

// Test / reset utility
export function resetAuthStateForTesting(): void {
  state.users.clear();
  state.usersByEmail.clear();
  state.sessions.clear();
  state.auditLogs = [];
  state.initialized = false;
}
