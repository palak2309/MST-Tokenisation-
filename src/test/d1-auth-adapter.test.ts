import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1Response,
  type D1Result,
  type DbAuditLogRow,
  type DbSessionRow,
  type DbUserRow,
  countPlatformAdmins,
  deleteSessionById,
  extractD1FromEnv,
  findSessionById,
  findUserByEmail,
  findUserById,
  insertAuditLog,
  insertSession,
  insertUser,
  listAllUsers,
  listAuditLogs,
  updateUserRole,
  updateUserWallet,
} from "../lib/auth/d1Adapter";
import {
  assignUserRole,
  getAllUsers,
  getAuditLogs,
  getAuthStorageStatus,
  isPersistentStorageConfigured,
  isProductionAuthPermitted,
  linkWalletToUser,
  loginUser,
  logoutUser,
  resetAuthStateForTesting,
  signUpUser,
  validateSession,
} from "../lib/auth/serverAuth";
import { handleAuthApiRequest } from "../lib/auth/serverApi";

class MockD1Database implements D1DatabaseLike {
  public users = new Map<string, DbUserRow>();
  public sessions = new Map<string, DbSessionRow>();
  public auditLogs: DbAuditLogRow[] = [];
  public executedQueries: Array<{ query: string; params: unknown[] }> = [];

  prepare(query: string): D1PreparedStatementLike {
    const executedQueries = this.executedQueries;
    const users = this.users;
    const sessions = this.sessions;
    const auditLogs = this.auditLogs;

    let boundParams: unknown[] = [];

    const stmt: D1PreparedStatementLike = {
      bind(...values: unknown[]) {
        boundParams = values;
        return stmt;
      },
      async first<T = unknown>(_colName?: string): Promise<T | null> {
        executedQueries.push({ query, params: [...boundParams] });

        if (query.includes("FROM users WHERE LOWER(email) = LOWER(?)")) {
          const email = String(boundParams[0]).toLowerCase();
          for (const user of users.values()) {
            if (user.email.toLowerCase() === email) {
              return { ...user } as T;
            }
          }
          return null;
        }

        if (query.includes("FROM users WHERE id = ?")) {
          const id = String(boundParams[0]);
          const user = users.get(id);
          return user ? ({ ...user } as T) : null;
        }

        if (query.includes("COUNT(*) as count FROM users WHERE role = 'ADMIN'")) {
          let count = 0;
          for (const u of users.values()) {
            if (u.role === "ADMIN") count++;
          }
          return { count } as T;
        }

        if (query.includes("FROM sessions WHERE id = ?")) {
          const id = String(boundParams[0]);
          const session = sessions.get(id);
          return session ? ({ ...session } as T) : null;
        }

        return null;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        executedQueries.push({ query, params: [...boundParams] });

        if (query.includes("FROM users ORDER BY created_at ASC")) {
          const res = Array.from(users.values()).sort((a, b) => a.created_at - b.created_at);
          return { success: true, results: res.map((r) => ({ ...r })) as T[] };
        }

        if (query.includes("FROM audit_logs ORDER BY timestamp DESC LIMIT ?")) {
          const limit = Number(boundParams[0]) || 1000;
          const res = [...auditLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
          return { success: true, results: res.map((r) => ({ ...r })) as T[] };
        }

        return { success: true, results: [] };
      },
      async run(): Promise<D1Response> {
        executedQueries.push({ query, params: [...boundParams] });

        if (query.includes("INSERT INTO users")) {
          const [
            id,
            email,
            name,
            role,
            password_hash,
            password_salt,
            linked_wallet_address,
            created_at,
            last_login_at,
          ] = boundParams;

          const emailStr = String(email).toLowerCase();
          for (const u of users.values()) {
            if (u.email.toLowerCase() === emailStr) {
              throw new Error("UNIQUE constraint failed: users.email");
            }
          }

          users.set(String(id), {
            id: String(id),
            email: emailStr,
            name: String(name),
            role: String(role),
            password_hash: String(password_hash),
            password_salt: String(password_salt),
            linked_wallet_address: (linked_wallet_address as string) ?? null,
            created_at: Number(created_at),
            last_login_at: last_login_at ? Number(last_login_at) : null,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.includes("UPDATE users SET role = ? WHERE id = ?")) {
          const [role, id] = boundParams;
          const u = users.get(String(id));
          if (u) {
            u.role = String(role);
          }
          return { success: true, meta: { changes: u ? 1 : 0 } };
        }

        if (query.includes("UPDATE users SET linked_wallet_address = ? WHERE id = ?")) {
          const [wallet, id] = boundParams;
          const u = users.get(String(id));
          if (u) {
            u.linked_wallet_address = String(wallet);
          }
          return { success: true, meta: { changes: u ? 1 : 0 } };
        }

        if (query.includes("UPDATE users SET last_login_at = ? WHERE id = ?")) {
          const [lastLogin, id] = boundParams;
          const u = users.get(String(id));
          if (u) {
            u.last_login_at = Number(lastLogin);
          }
          return { success: true, meta: { changes: u ? 1 : 0 } };
        }

        if (query.includes("INSERT INTO sessions")) {
          const [id, user_id, created_at, expires_at] = boundParams;
          sessions.set(String(id), {
            id: String(id),
            user_id: String(user_id),
            created_at: Number(created_at),
            expires_at: Number(expires_at),
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.includes("DELETE FROM sessions WHERE id = ?")) {
          const [id] = boundParams;
          const existed = sessions.delete(String(id));
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }

        if (query.includes("DELETE FROM sessions WHERE expires_at < ?")) {
          const [now] = boundParams;
          let changes = 0;
          for (const [id, s] of sessions.entries()) {
            if (s.expires_at < Number(now)) {
              sessions.delete(id);
              changes++;
            }
          }
          return { success: true, meta: { changes } };
        }

        if (query.includes("INSERT INTO audit_logs")) {
          const [
            id,
            timestamp,
            actor_id,
            actor_email,
            action,
            target_user_id,
            target_user_email,
            details,
          ] = boundParams;

          auditLogs.unshift({
            id: String(id),
            timestamp: Number(timestamp),
            actor_id: String(actor_id),
            actor_email: String(actor_email),
            action: String(action),
            target_user_id: (target_user_id as string) ?? null,
            target_user_email: (target_user_email as string) ?? null,
            details: String(details),
          });
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true };
      },
    };

    return stmt;
  }
}

describe("Cloudflare D1 Authentication Storage Adapter & Integration", () => {
  const originalEnv = { ...process.env };
  let mockDb: MockD1Database;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetAuthStateForTesting();
    mockDb = new MockD1Database();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAuthStateForTesting();
  });

  describe("1. D1 Environment Binding Extraction", () => {
    it("extracts DB binding directly from env parameter", () => {
      const env = { DB: mockDb };
      const extracted = extractD1FromEnv(env);
      expect(extracted).toBe(mockDb);
    });

    it("extracts DB binding from augmented request context", () => {
      const req = {
        runtime: {
          cloudflare: {
            env: { DB: mockDb },
          },
        },
      } as unknown as Request;

      const extracted = extractD1FromEnv(undefined, req);
      expect(extracted).toBe(mockDb);
    });

    it("extracts DB binding from globalThis.__env__", () => {
      (globalThis as unknown as { __env__: { DB: MockD1Database } }).__env__ = { DB: mockDb };
      const extracted = extractD1FromEnv();
      expect(extracted).toBe(mockDb);
      delete (globalThis as unknown as { __env__?: unknown }).__env__;
    });

    it("returns null if no D1 binding is found in any context", () => {
      const extracted = extractD1FromEnv({});
      expect(extracted).toBeNull();
    });
  });

  describe("2. Low-Level D1 Adapter Operations & Parameterized Queries", () => {
    it("inserts and retrieves a user record using parameterized SQL", async () => {
      const now = Date.now();
      await insertUser(mockDb, {
        id: "usr_d1_001",
        email: "alice@example.com",
        name: "Alice Investor",
        role: "INVESTOR",
        passwordHash: "hash_alice",
        passwordSalt: "salt_alice",
        createdAt: now,
      });

      const user = await findUserByEmail(mockDb, "alice@example.com");
      expect(user).not.toBeNull();
      expect(user?.id).toBe("usr_d1_001");
      expect(user?.email).toBe("alice@example.com");
      expect(user?.role).toBe("INVESTOR");

      // Verify parameterized query used placeholder '?'
      const insertQuery = mockDb.executedQueries.find((q) => q.query.includes("INSERT INTO users"));
      expect(insertQuery).toBeDefined();
      expect(insertQuery?.query).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      expect(insertQuery?.params).toContain("alice@example.com");
    });

    it("enforces UNIQUE constraint on duplicate email in D1", async () => {
      const now = Date.now();
      await insertUser(mockDb, {
        id: "usr_d1_001",
        email: "alice@example.com",
        name: "Alice",
        role: "INVESTOR",
        passwordHash: "h1",
        passwordSalt: "s1",
        createdAt: now,
      });

      await expect(
        insertUser(mockDb, {
          id: "usr_d1_002",
          email: "alice@example.com",
          name: "Alice 2",
          role: "INVESTOR",
          passwordHash: "h2",
          passwordSalt: "s2",
          createdAt: now,
        }),
      ).rejects.toThrow("An account with this email address already exists.");
    });

    it("manages session persistence, retrieval, and deletion in D1", async () => {
      const now = Date.now();
      await insertSession(mockDb, {
        id: "sess_001",
        userId: "usr_d1_001",
        createdAt: now,
        expiresAt: now + 60000,
      });

      const retrieved = await findSessionById(mockDb, "sess_001");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe("usr_d1_001");

      const deleted = await deleteSessionById(mockDb, "sess_001");
      expect(deleted).toBe(true);

      const afterDelete = await findSessionById(mockDb, "sess_001");
      expect(afterDelete).toBeNull();
    });

    it("records and lists immutable audit log entries in D1", async () => {
      await insertAuditLog(mockDb, {
        id: "log_001",
        timestamp: Date.now(),
        actorId: "usr_d1_001",
        actorEmail: "alice@example.com",
        action: "SIGNUP",
        details: { note: "test log" },
      });

      const logs = await listAuditLogs(mockDb, 10);
      expect(logs.length).toBe(1);
      expect(logs[0]?.actorEmail).toBe("alice@example.com");
      expect(logs[0]?.action).toBe("SIGNUP");
    });
  });

  describe("3. Full Authentication Workflow with D1 Storage", () => {
    it("handles public signup with automatic INVESTOR role assignment in D1", async () => {
      const { user, session } = await signUpUser({
        name: "Carol Investor",
        email: "carol@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      expect(user.role).toBe("INVESTOR");
      expect(user.email).toBe("carol@example.com");
      expect(session.id).toBeDefined();

      // Check persisted state in D1 mock
      expect(mockDb.users.size).toBeGreaterThanOrEqual(1);
      const dbUser = mockDb.users.get(user.id);
      expect(dbUser?.role).toBe("INVESTOR");
      expect(mockDb.sessions.has(session.id)).toBe(true);
    });

    it("authenticates registered user against D1 and creates session", async () => {
      await signUpUser({
        name: "Dave Investor",
        email: "dave@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      const { user, session } = await loginUser({
        email: "dave@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      expect(user.email).toBe("dave@example.com");
      expect(session.id).toBeDefined();

      const validated = await validateSession(session.id, mockDb);
      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(user.id);
    });

    it("rejects login with wrong password and logs attempt in D1", async () => {
      await signUpUser({
        name: "Eve Investor",
        email: "eve@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      await expect(
        loginUser({
          email: "eve@example.com",
          password: "WrongPassword!",
          db: mockDb,
        }),
      ).rejects.toThrow("Invalid email or password.");

      const attemptLog = mockDb.auditLogs.find((l) => l.action === "UNAUTHORIZED_ATTEMPT");
      expect(attemptLog).toBeDefined();
    });

    it("revokes active session in D1 upon logout", async () => {
      const { session } = await signUpUser({
        name: "Frank Investor",
        email: "frank@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      const loggedOut = await logoutUser(session.id, mockDb);
      expect(loggedOut).toBe(true);

      const validated = await validateSession(session.id, mockDb);
      expect(validated).toBeNull();
      expect(mockDb.sessions.has(session.id)).toBe(false);
    });

    it("automatically invalidates and purges expired sessions in D1", async () => {
      const { user } = await signUpUser({
        name: "Grace Investor",
        email: "grace@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      // Insert manually an expired session in D1
      const expiredSessionId = "expired_sess_123";
      mockDb.sessions.set(expiredSessionId, {
        id: expiredSessionId,
        user_id: user.id,
        created_at: Date.now() - 100000,
        expires_at: Date.now() - 1000, // expired 1s ago
      });

      const validated = await validateSession(expiredSessionId, mockDb);
      expect(validated).toBeNull();
      expect(mockDb.sessions.has(expiredSessionId)).toBe(false);
    });
  });

  describe("4. Role Management and Administrative Isolation with D1", () => {
    it("allows ADMIN to assign roles and updates D1 persistence", async () => {
      // In development/test mode, ensureInitialized seeds demo accounts into D1
      const { session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
        db: mockDb,
      });

      const { user: targetUser } = await signUpUser({
        name: "Henry Target",
        email: "henry@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      expect(targetUser.role).toBe("INVESTOR");

      const updated = await assignUserRole({
        adminSessionId: adminSession.id,
        targetUserId: targetUser.id,
        newRole: "PROPERTY_ISSUER",
        db: mockDb,
      });

      expect(updated.role).toBe("PROPERTY_ISSUER");

      // Verify persisted role in D1
      const dbTarget = mockDb.users.get(targetUser.id);
      expect(dbTarget?.role).toBe("PROPERTY_ISSUER");
    });

    it("prevents administrator self-demotion in D1", async () => {
      const { user: adminUser, session: adminSession } = await loginUser({
        email: "admin@tokenestate.mst",
        password: "MSTAdmin2026!",
        db: mockDb,
      });

      await expect(
        assignUserRole({
          adminSessionId: adminSession.id,
          targetUserId: adminUser.id,
          newRole: "INVESTOR",
          db: mockDb,
        }),
      ).rejects.toThrow(/Self-demotion prevented/i);
    });

    it("links EVM wallet address to user in D1", async () => {
      const { user, session } = await signUpUser({
        name: "Ian Investor",
        email: "ian@example.com",
        password: "StrongPassword2026!",
        db: mockDb,
      });

      const wallet = "0x1234567890123456789012345678901234567890";
      const updated = await linkWalletToUser({
        sessionId: session.id,
        walletAddress: wallet,
        db: mockDb,
      });

      expect(updated.linkedWalletAddress).toBe(wallet);
      expect(mockDb.users.get(user.id)?.linked_wallet_address).toBe(wallet);
    });
  });

  describe("5. Production Fail-Safe Gating & Durable Storage Status", () => {
    it("reports durable cloudflare-d1 provider when D1 is available", () => {
      const status = getAuthStorageStatus(mockDb);
      expect(status.isDurable).toBe(true);
      expect(status.provider).toBe("cloudflare-d1");
    });

    it("permits production authentication when D1 database is active", () => {
      process.env["NODE_ENV"] = "production";
      delete process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"];

      expect(isProductionAuthPermitted(mockDb)).toBe(true);
    });

    it("fails safely in production when D1 is NOT provided and ephemeral auth is disabled", async () => {
      process.env["NODE_ENV"] = "production";
      delete process.env["ALLOW_EPHEMERAL_AUTH_IN_PRODUCTION"];
      delete process.env["CLOUDFLARE_D1_DATABASE"];

      await expect(
        signUpUser({
          name: "Prod User",
          email: "prod_no_d1@example.com",
          password: "ValidPassword123!",
          // No db provided!
        }),
      ).rejects.toThrow(/Production authentication requires a configured durable store/i);
    });

    it("allows API endpoint /api/auth/storage-status to reflect D1 binding", async () => {
      const req = new Request("http://localhost/api/auth/storage-status");
      const res = await handleAuthApiRequest(req, { DB: mockDb });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { status: { provider: string; isDurable: boolean } };
      expect(body.status.provider).toBe("cloudflare-d1");
      expect(body.status.isDurable).toBe(true);
    });
  });
});
