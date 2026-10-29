import { type AppRole, type AuditLogEntry, type User } from "./types";

/**
 * Client authentication layer:
 * - Session secret cookies are strictly server-managed with HttpOnly, SameSite=Lax, and Secure flags.
 * - Browser JavaScript NEVER reads or writes raw session secrets to document.cookie or localStorage.
 * - All state-changing requests attach anti-CSRF headers (X-MST-CSRF, X-Requested-With) and credentials: "same-origin".
 */

let inMemorySessionId: string | null = null;

async function requestAuthApi<T>(
  path: string,
  options: { method?: string; body?: unknown; sessionId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MST-CSRF": "1",
    "X-Requested-With": "MST-TokenEstate",
  };
  if (options.sessionId) {
    headers["Authorization"] = `Bearer ${options.sessionId}`;
  }

  const init: RequestInit = {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
    credentials: "same-origin",
  };
  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api/auth${path}`, init);

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorMsg =
      typeof data["error"] === "string"
        ? (data["error"] as string)
        : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }
  return data as T;
}

export async function clientRestoreSession(): Promise<User | null> {
  try {
    // Send validate request with ambient HttpOnly session cookie
    const body: Record<string, unknown> = {};
    if (inMemorySessionId) {
      body["sessionId"] = inMemorySessionId;
    }
    const result = await requestAuthApi<{ user: User; session: { id: string } }>("/validate", {
      method: "POST",
      body,
    });
    if (result && result.user) {
      inMemorySessionId = result.session.id;
      return result.user;
    }
    inMemorySessionId = null;
    return null;
  } catch {
    inMemorySessionId = null;
    return null;
  }
}

export async function clientLogin(email: string, password: string): Promise<User> {
  const { user, session } = await requestAuthApi<{ user: User; session: { id: string } }>(
    "/login",
    {
      method: "POST",
      body: { email, password },
    },
  );
  inMemorySessionId = session.id;
  return user;
}

export async function clientSignup(params: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const { user, session } = await requestAuthApi<{ user: User; session: { id: string } }>(
    "/signup",
    {
      method: "POST",
      body: {
        name: params.name,
        email: params.email,
        password: params.password,
      },
    },
  );
  inMemorySessionId = session.id;
  return user;
}

export async function clientLogout(): Promise<void> {
  try {
    const body: Record<string, unknown> = {};
    if (inMemorySessionId) {
      body["sessionId"] = inMemorySessionId;
    }
    await requestAuthApi<{ success: boolean }>("/logout", {
      method: "POST",
      body,
    });
  } catch {
    // Ignore network / logout error
  }
  inMemorySessionId = null;
}

export async function clientAssignRole(targetUserId: string, newRole: AppRole): Promise<User> {
  const body: Record<string, unknown> = {
    targetUserId,
    newRole,
  };
  if (inMemorySessionId) {
    body["adminSessionId"] = inMemorySessionId;
  }
  const { user } = await requestAuthApi<{ user: User }>("/roles", {
    method: "POST",
    body,
  });
  return user;
}

export async function clientGetAllUsers(): Promise<User[]> {
  const opts: { method: string; sessionId?: string } = { method: "GET" };
  if (inMemorySessionId) {
    opts.sessionId = inMemorySessionId;
  }
  const { users } = await requestAuthApi<{ users: User[] }>("/users", opts);
  return users;
}

export async function clientGetAuditLogs(): Promise<AuditLogEntry[]> {
  const opts: { method: string; sessionId?: string } = { method: "GET" };
  if (inMemorySessionId) {
    opts.sessionId = inMemorySessionId;
  }
  const { auditLogs } = await requestAuthApi<{ auditLogs: AuditLogEntry[] }>("/audit-logs", opts);
  return auditLogs;
}

export async function clientLinkWallet(walletAddress: string): Promise<User> {
  const body: Record<string, unknown> = {
    walletAddress,
  };
  if (inMemorySessionId) {
    body["sessionId"] = inMemorySessionId;
  }
  const { user } = await requestAuthApi<{ user: User }>("/wallet", {
    method: "POST",
    body,
  });
  return user;
}

export function clientResetSessionForTesting(): void {
  inMemorySessionId = null;
}
