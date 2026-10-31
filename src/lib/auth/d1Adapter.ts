import type { AppRole, AuditLogEntry, Session, UserRecord } from "./types";

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch?<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1Result<T>[]>;
  exec?(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Response>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw?<T = unknown>(): Promise<T[]>;
}

export interface D1Response {
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
    [key: string]: unknown;
  };
  error?: string;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
    [key: string]: unknown;
  };
  error?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface DbUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  password_salt: string;
  linked_wallet_address: string | null;
  created_at: number;
  last_login_at: number | null;
}

export interface DbSessionRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface DbAuditLogRow {
  id: string;
  timestamp: number;
  actor_id: string;
  actor_email: string;
  action: string;
  target_user_id: string | null;
  target_user_email: string | null;
  details: string;
}

export function mapUserRow(row: DbUserRow): UserRecord {
  return {
    id: row.id,
    email: row.email.toLowerCase(),
    name: row.name,
    role: row.role as AppRole,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    linkedWalletAddress: row.linked_wallet_address ?? undefined,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

export function mapSessionRow(row: DbSessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function mapAuditLogRow(row: DbAuditLogRow): AuditLogEntry {
  let parsedDetails: Record<string, unknown> = {};
  try {
    parsedDetails = JSON.parse(row.details);
  } catch {
    parsedDetails = { raw: row.details };
  }
  return {
    id: row.id,
    timestamp: row.timestamp,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action as AuditLogEntry["action"],
    targetUserId: row.target_user_id ?? undefined,
    targetUserEmail: row.target_user_email ?? undefined,
    details: parsedDetails,
  };
}

/**
 * Extracts a Cloudflare D1 database binding from the runtime environment or request context.
 * Checks the passed Worker `env`, the augmented request context `request.runtime.cloudflare.env`,
 * or the global `__env__` set by Nitro Cloudflare module runtime.
 */
export function extractD1FromEnv(env?: unknown, request?: Request): D1DatabaseLike | null {
  if (env && typeof env === "object" && "DB" in env) {
    const db = (env as { DB?: unknown }).DB;
    if (db && typeof (db as D1DatabaseLike).prepare === "function") {
      return db as D1DatabaseLike;
    }
  }

  const reqCloudflareEnv = (
    request as unknown as { runtime?: { cloudflare?: { env?: { DB?: unknown } } } }
  )?.runtime?.cloudflare?.env?.DB;
  if (reqCloudflareEnv && typeof (reqCloudflareEnv as D1DatabaseLike).prepare === "function") {
    return reqCloudflareEnv as D1DatabaseLike;
  }

  const globalEnv = (globalThis as unknown as { __env__?: { DB?: unknown } }).__env__?.DB;
  if (globalEnv && typeof (globalEnv as D1DatabaseLike).prepare === "function") {
    return globalEnv as D1DatabaseLike;
  }

  return null;
}

export async function findUserByEmail(
  db: D1DatabaseLike,
  email: string,
): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const row = await db
    .prepare(
      "SELECT id, email, name, role, password_hash, password_salt, linked_wallet_address, created_at, last_login_at FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
    )
    .bind(normalized)
    .first<DbUserRow>();

  return row ? mapUserRow(row) : null;
}

export async function findUserById(db: D1DatabaseLike, id: string): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, email, name, role, password_hash, password_salt, linked_wallet_address, created_at, last_login_at FROM users WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<DbUserRow>();

  return row ? mapUserRow(row) : null;
}

export async function insertUser(db: D1DatabaseLike, user: UserRecord): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, role, password_hash, password_salt, linked_wallet_address, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        user.id,
        user.email.toLowerCase(),
        user.name,
        user.role,
        user.passwordHash,
        user.passwordSalt,
        user.linkedWalletAddress ?? null,
        user.createdAt,
        user.lastLoginAt ?? null,
      )
      .run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("UNIQUE") ||
      msg.includes("constraint") ||
      msg.includes("already exists") ||
      msg.includes("users.email")
    ) {
      throw new Error("An account with this email address already exists.");
    }
    throw err;
  }
}

export async function updateUserRole(
  db: D1DatabaseLike,
  userId: string,
  newRole: AppRole,
): Promise<void> {
  await db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, userId).run();
}

export async function updateUserWallet(
  db: D1DatabaseLike,
  userId: string,
  walletAddress: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET linked_wallet_address = ? WHERE id = ?")
    .bind(walletAddress, userId)
    .run();
}

export async function updateUserLastLogin(
  db: D1DatabaseLike,
  userId: string,
  lastLoginAt: number,
): Promise<void> {
  await db
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(lastLoginAt, userId)
    .run();
}

export async function countPlatformAdmins(db: D1DatabaseLike): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'")
    .first<{ count: number }>();
  return row ? Number(row.count) : 0;
}

export async function listAllUsers(db: D1DatabaseLike): Promise<UserRecord[]> {
  const res = await db
    .prepare(
      "SELECT id, email, name, role, password_hash, password_salt, linked_wallet_address, created_at, last_login_at FROM users ORDER BY created_at ASC",
    )
    .all<DbUserRow>();

  return (res.results ?? []).map(mapUserRow);
}

export async function insertSession(db: D1DatabaseLike, session: Session): Promise<void> {
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(session.id, session.userId, session.createdAt, session.expiresAt)
    .run();
}

export async function findSessionById(
  db: D1DatabaseLike,
  sessionId: string,
): Promise<Session | null> {
  const row = await db
    .prepare("SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ? LIMIT 1")
    .bind(sessionId)
    .first<DbSessionRow>();

  return row ? mapSessionRow(row) : null;
}

export async function deleteSessionById(db: D1DatabaseLike, sessionId: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();

  return (res.meta?.changes ?? 0) > 0 || res.success;
}

export async function cleanupExpiredSessions(db: D1DatabaseLike, nowMs: number): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(nowMs).run();
}

export async function insertAuditLog(db: D1DatabaseLike, entry: AuditLogEntry): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, timestamp, actor_id, actor_email, action, target_user_id, target_user_email, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.timestamp,
      entry.actorId,
      entry.actorEmail,
      entry.action,
      entry.targetUserId ?? null,
      entry.targetUserEmail ?? null,
      JSON.stringify(entry.details ?? {}),
    )
    .run();
}

export async function listAuditLogs(db: D1DatabaseLike, limit = 1000): Promise<AuditLogEntry[]> {
  const res = await db
    .prepare(
      "SELECT id, timestamp, actor_id, actor_email, action, target_user_id, target_user_email, details FROM audit_logs ORDER BY timestamp DESC LIMIT ?",
    )
    .bind(limit)
    .all<DbAuditLogRow>();

  return (res.results ?? []).map(mapAuditLogRow);
}
