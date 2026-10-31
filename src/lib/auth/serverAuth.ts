import {
  type AppRole,
  type AuditLogEntry,
  type Session,
  type User,
  type UserRecord,
  APP_ROLES,
} from "./types";
import { generateSalt, generateSessionId, hashPassword, verifyPassword } from "./crypto";
import {
  type D1DatabaseLike,
  countPlatformAdmins as countPlatformAdminsInDb,
  deleteSessionById as deleteSessionByIdInDb,
  findSessionById as findSessionByIdInDb,
  findUserByEmail as findUserByEmailInDb,
  findUserById as findUserByIdInDb,
  insertAuditLog as insertAuditLogInDb,
  insertSession as insertSessionInDb,
  insertUser as insertUserInDb,
  listAllUsers as listAllUsersFromDb,
  listAuditLogs as listAuditLogsFromDb,
  updateUserLastLogin as updateUserLastLoginInDb,
  updateUserRole as updateUserRoleInDb,
  updateUserWallet as updateUserWalletInDb,
} from "./d1Adapter";

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
let initializedD1Databases = new WeakSet<object>();

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
 * 2. Cloudflare Workers Storage Assessment & Gating:
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
export function isPersistentStorageConfigured(db?: D1DatabaseLike | null): boolean {
  if (db) return true;
  return Boolean(
    process.env["CLOUDFLARE_D1_DATABASE"] ||
    process.env["DATABASE_URL"] ||
    process.env["AUTH_KV_BINDING"] ||
    process.env["AUTH_STORAGE_PROVIDER"] === "d1" ||
    process.env["AUTH_STORAGE_PROVIDER"] === "kv" ||
    process.env["AUTH_STORAGE_PROVIDER"] === "external",
  );
}

export function isProductionAuthPermitted(db?: D1DatabaseLike | null): boolean {
  if (process.env["NODE_ENV"] !== "production") return true;
  if (db) return true;
  if (isPersistentStorageConfigured(db)) return true;
  return process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] === "true";
}

export function getAuthStorageStatus(db?: D1DatabaseLike | null): {
  isDurable: boolean;
  provider: "in-memory" | "cloudflare-d1" | "cloudflare-kv" | "external-db";
  environment: string;
  demoAccountsEnabled: boolean;
  ephemeralAllowedInProduction: boolean;
} {
  const isDurable = isPersistentStorageConfigured(db);
  let provider: "in-memory" | "cloudflare-d1" | "cloudflare-kv" | "external-db" = "in-memory";
  if (
    db ||
    process.env["CLOUDFLARE_D1_DATABASE"] ||
    process.env["AUTH_STORAGE_PROVIDER"] === "d1"
  ) {
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

function verifyStorageForAuthOperation(db?: D1DatabaseLike | null): void {
  // If active D1 database is provided, operations are backed by durable D1 storage
  if (db) return;

  // In production, ephemeral in-memory storage is not permitted unless explicit override
  if (!isProductionAuthPermitted()) {
    throw new Error(
      "Production authentication requires a configured durable store (Cloudflare D1, KV, or external database). Ephemeral in-memory auth storage is disabled in production to prevent data loss across serverless edge isolates. Configure a persistent store or set ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION=true to allow ephemeral authentication for evaluation.",
    );
  }

  // If in production mode and persistent storage was configured via env (e.g. CLOUDFLARE_D1_DATABASE),
  // but no live DB binding was provided to the handler, do not silently fall back to ephemeral memory!
  if (
    process.env["NODE_ENV"] === "production" &&
    process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"] !== "true"
  ) {
    throw new Error(
      "Production authentication requires a configured durable store (Cloudflare D1, KV, or external database). Ephemeral in-memory auth storage is disabled in production to prevent data loss across serverless edge isolates. Configure a persistent store or set ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION=true to allow ephemeral authentication for evaluation.",
    );
  }
}

async function getDefaultSeededRecords(): Promise<UserRecord[]> {
  if (cachedSeededRecords) return cachedSeededRecords;

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

  return cachedSeededRecords;
}

// Seed initial system users with secure hashed credentials (development/demo mode only)
export async function ensureInitialized(db?: D1DatabaseLike | null): Promise<void> {
  if (db) {
    if (initializedD1Databases.has(db)) return;

    if (isDemoAccountsAllowed()) {
      const records = await getDefaultSeededRecords();
      for (const record of records) {
        const existing = await findUserByIdInDb(db, record.id).catch(() => null);
        if (!existing) {
          await insertUserInDb(db, { ...record }).catch(() => null);
        }
      }

      await recordAuditLog(
        {
          actorId: "system",
          actorEmail: "system@mstblockchain.com",
          action: "SIGNUP",
          details: {
            message: "D1 database initialized with seeded role profiles for local/demo evaluation.",
          },
        },
        db,
      );
    } else {
      await recordAuditLog(
        {
          actorId: "system",
          actorEmail: "system@mstblockchain.com",
          action: "SIGNUP",
          details: {
            message:
              "Production environment active: Seeded demo accounts and hardcoded credentials disabled.",
          },
        },
        db,
      );
    }

    initializedD1Databases.add(db);
    return;
  }

  // In-memory fallback
  if (state.initialized) return;

  if (isDemoAccountsAllowed()) {
    const records = await getDefaultSeededRecords();
    for (const record of records) {
      state.users.set(record.id, { ...record });
      state.usersByEmail.set(record.email, record.id);
    }

    await recordAuditLog({
      actorId: "system",
      actorEmail: "system@mstblockchain.com",
      action: "SIGNUP",
      details: {
        message: "System initialized with seeded role profiles for local/demo evaluation.",
      },
    });
  } else {
    await recordAuditLog({
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

async function recordAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">,
  db?: D1DatabaseLike | null,
): Promise<AuditLogEntry> {
  const fullEntry: AuditLogEntry = {
    id: `log_${generateSessionId().slice(0, 12)}`,
    timestamp: Date.now(),
    ...entry,
  };

  if (db) {
    try {
      await insertAuditLogInDb(db, fullEntry);
    } catch (err) {
      console.error("Failed to write audit log to D1:", err);
    }
  }

  state.auditLogs.unshift(fullEntry);
  // Cap in-memory buffer at 1000 entries
  if (state.auditLogs.length > 1000) {
    state.auditLogs.pop();
  }
  return fullEntry;
}

export async function signUpUser(params: {
  name: string;
  email: string;
  password: string;
  db?: D1DatabaseLike | null;
}): Promise<{ user: User; session: Session }> {
  verifyStorageForAuthOperation(params.db);
  await ensureInitialized(params.db);

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

  if (params.db) {
    const existing = await findUserByEmailInDb(params.db, email);
    if (existing) {
      throw new Error("An account with this email address already exists.");
    }
  } else {
    if (state.usersByEmail.has(email)) {
      throw new Error("An account with this email address already exists.");
    }
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

  const session: Session = {
    id: generateSessionId(),
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };

  if (params.db) {
    await insertUserInDb(params.db, record);
    await insertSessionInDb(params.db, session);
  } else {
    state.users.set(userId, record);
    state.usersByEmail.set(email, userId);
    state.sessions.set(session.id, session);
  }

  await recordAuditLog(
    {
      actorId: userId,
      actorEmail: email,
      action: "SIGNUP",
      targetUserId: userId,
      targetUserEmail: email,
      details: { assignedRole, note: "Public registration default INVESTOR role assigned." },
    },
    params.db,
  );

  return { user: sanitizeUser(record), session };
}

export async function loginUser(params: {
  email: string;
  password: string;
  db?: D1DatabaseLike | null;
}): Promise<{ user: User; session: Session }> {
  verifyStorageForAuthOperation(params.db);
  await ensureInitialized(params.db);

  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const password = typeof params.password === "string" ? params.password : "";

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  let record: UserRecord | undefined | null;

  if (params.db) {
    record = await findUserByEmailInDb(params.db, email);
  } else {
    const userId = state.usersByEmail.get(email);
    record = userId ? state.users.get(userId) : undefined;
  }

  if (!record) {
    await recordAuditLog(
      {
        actorId: "anonymous",
        actorEmail: email,
        action: "UNAUTHORIZED_ATTEMPT",
        details: { reason: "User not found" },
      },
      params.db,
    );
    throw new Error("Invalid email or password.");
  }

  const valid = await verifyPassword(password, record.passwordSalt, record.passwordHash);
  if (!valid) {
    await recordAuditLog(
      {
        actorId: record.id,
        actorEmail: email,
        action: "UNAUTHORIZED_ATTEMPT",
        targetUserId: record.id,
        details: { reason: "Password mismatch" },
      },
      params.db,
    );
    throw new Error("Invalid email or password.");
  }

  const now = Date.now();
  record.lastLoginAt = now;

  const session: Session = {
    id: generateSessionId(),
    userId: record.id,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  };

  if (params.db) {
    await updateUserLastLoginInDb(params.db, record.id, now);
    await insertSessionInDb(params.db, session);
  } else {
    state.sessions.set(session.id, session);
  }

  await recordAuditLog(
    {
      actorId: record.id,
      actorEmail: email,
      action: "LOGIN",
      details: { role: record.role },
    },
    params.db,
  );

  return { user: sanitizeUser(record), session };
}

export async function logoutUser(sessionId: string, db?: D1DatabaseLike | null): Promise<boolean> {
  await ensureInitialized(db);

  if (!sessionId || typeof sessionId !== "string") return false;

  if (db) {
    const session = await findSessionByIdInDb(db, sessionId);
    if (session) {
      const user = await findUserByIdInDb(db, session.userId);
      await recordAuditLog(
        {
          actorId: session.userId,
          actorEmail: user?.email ?? "unknown",
          action: "LOGOUT",
          details: {},
        },
        db,
      );
      await deleteSessionByIdInDb(db, sessionId);
      return true;
    }
    return false;
  }

  const session = state.sessions.get(sessionId);
  if (session) {
    const user = state.users.get(session.userId);
    await recordAuditLog({
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
  db?: D1DatabaseLike | null,
): Promise<{ user: User; session: Session } | null> {
  await ensureInitialized(db);

  if (!sessionId || typeof sessionId !== "string") return null;

  if (db) {
    const session = await findSessionByIdInDb(db, sessionId);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      await deleteSessionByIdInDb(db, sessionId);
      return null;
    }

    const record = await findUserByIdInDb(db, session.userId);
    if (!record) {
      await deleteSessionByIdInDb(db, sessionId);
      return null;
    }

    return { user: sanitizeUser(record), session };
  }

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
  db?: D1DatabaseLike | null;
}): Promise<User> {
  verifyStorageForAuthOperation(params.db);
  await ensureInitialized(params.db);

  if (!params.adminSessionId || typeof params.adminSessionId !== "string") {
    throw new Error(
      "Access denied: Only authenticated administrators can assign or modify application roles.",
    );
  }

  // 1. Authenticate caller session strictly on the server
  const sessionAuth = await validateSession(params.adminSessionId, params.db);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    await recordAuditLog(
      {
        actorId: sessionAuth?.user.id ?? "anonymous",
        actorEmail: sessionAuth?.user.email ?? "unknown",
        action: "UNAUTHORIZED_ATTEMPT",
        targetUserId: params.targetUserId,
        details: {
          attemptedAction: "assignUserRole",
          attemptedRole: params.newRole,
          reason: "Actor is not an authenticated ADMIN",
        },
      },
      params.db,
    );
    throw new Error(
      "Access denied: Only authenticated administrators can assign or modify application roles.",
    );
  }

  // 2. Validate allowed roles against canonical whitelist
  if (!APP_ROLES.includes(params.newRole)) {
    await recordAuditLog(
      {
        actorId: sessionAuth.user.id,
        actorEmail: sessionAuth.user.email,
        action: "UNAUTHORIZED_ATTEMPT",
        targetUserId: params.targetUserId,
        details: {
          attemptedAction: "assignUserRole",
          attemptedRole: String(params.newRole),
          reason: `Invalid role specified. Supported roles: ${APP_ROLES.join(", ")}`,
        },
      },
      params.db,
    );
    throw new Error(
      `Invalid role "${String(params.newRole)}". Supported roles: ${APP_ROLES.join(", ")}`,
    );
  }

  // 3. Locate target user
  let target: UserRecord | undefined | null;
  if (params.db) {
    target = await findUserByIdInDb(params.db, params.targetUserId);
  } else {
    target = state.users.get(params.targetUserId);
  }

  if (!target) {
    throw new Error(`Target user "${params.targetUserId}" was not found.`);
  }

  // 4. Prevent administrator self-demotion
  if (sessionAuth.user.id === target.id && params.newRole !== "ADMIN") {
    await recordAuditLog(
      {
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
      },
      params.db,
    );
    throw new Error(
      "Self-demotion prevented: Administrators cannot remove their own ADMIN role. Another administrator must perform this action.",
    );
  }

  // 5. Prevent leaving the platform without an administrator
  if (target.role === "ADMIN" && params.newRole !== "ADMIN") {
    let totalAdmins = 0;
    if (params.db) {
      totalAdmins = await countPlatformAdminsInDb(params.db);
    } else {
      totalAdmins = Array.from(state.users.values()).filter((u) => u.role === "ADMIN").length;
    }

    if (totalAdmins <= 1) {
      await recordAuditLog(
        {
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
        },
        params.db,
      );
      throw new Error(
        "Action denied: Cannot remove the last platform administrator. At least one administrator must remain active at all times.",
      );
    }
  }

  const previousRole = target.role;
  target.role = params.newRole;

  if (params.db) {
    await updateUserRoleInDb(params.db, target.id, params.newRole);
  }

  // 6. Record immutable security audit log entry
  await recordAuditLog(
    {
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
    },
    params.db,
  );

  return sanitizeUser(target);
}

export async function linkWalletToUser(params: {
  sessionId: string;
  walletAddress: string;
  db?: D1DatabaseLike | null;
}): Promise<User> {
  await ensureInitialized(params.db);

  if (!params.sessionId || typeof params.sessionId !== "string") {
    throw new Error("Authentication required to link a wallet address.");
  }

  const sessionAuth = await validateSession(params.sessionId, params.db);
  if (!sessionAuth) {
    throw new Error("Authentication required to link a wallet address.");
  }

  const address = typeof params.walletAddress === "string" ? params.walletAddress.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid EVM wallet address.");
  }

  let userRecord: UserRecord | undefined | null;
  if (params.db) {
    userRecord = await findUserByIdInDb(params.db, sessionAuth.user.id);
  } else {
    userRecord = state.users.get(sessionAuth.user.id);
  }

  if (!userRecord) {
    throw new Error("User record not found.");
  }

  userRecord.linkedWalletAddress = address;

  if (params.db) {
    await updateUserWalletInDb(params.db, userRecord.id, address);
  }

  await recordAuditLog(
    {
      actorId: userRecord.id,
      actorEmail: userRecord.email,
      action: "WALLET_LINKED",
      details: { linkedWalletAddress: address },
    },
    params.db,
  );

  return sanitizeUser(userRecord);
}

export async function getAllUsers(
  adminSessionId: string,
  db?: D1DatabaseLike | null,
): Promise<User[]> {
  await ensureInitialized(db);

  if (!adminSessionId || typeof adminSessionId !== "string") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  const sessionAuth = await validateSession(adminSessionId, db);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  if (db) {
    const users = await listAllUsersFromDb(db);
    return users.map(sanitizeUser);
  }

  return Array.from(state.users.values()).map(sanitizeUser);
}

export async function getAuditLogs(
  adminSessionId: string,
  db?: D1DatabaseLike | null,
): Promise<AuditLogEntry[]> {
  await ensureInitialized(db);

  if (!adminSessionId || typeof adminSessionId !== "string") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  const sessionAuth = await validateSession(adminSessionId, db);
  if (!sessionAuth || sessionAuth.user.role !== "ADMIN") {
    throw new Error("Access denied: Administrative privileges required.");
  }

  if (db) {
    return await listAuditLogsFromDb(db, 1000);
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
  initializedD1Databases = new WeakSet();
}
