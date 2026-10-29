import {
  assignUserRole,
  getAllUsers,
  getAuditLogs,
  getAuthStorageStatus,
  linkWalletToUser,
  loginUser,
  logoutUser,
  signUpUser,
  validateSession,
} from "./serverAuth";
import { APP_ROLES, type AppRole } from "./types";

const COOKIE_NAME = "mst_session_token";

function isSecureRequest(request: Request, url: URL): boolean {
  return (
    url.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https" ||
    process.env["NODE_ENV"] === "production"
  );
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(rest.join("="));
    }
  });
  return cookies;
}

function createSessionCookieHeader(sessionId: string, isSecure: boolean): string {
  // 7 days in seconds
  const maxAge = 7 * 24 * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    isSecure ? "; Secure" : ""
  }`;
}

function createClearCookieHeader(isSecure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${
    isSecure ? "; Secure" : ""
  }`;
}

function extractSessionToken(
  request: Request,
  url: URL,
  body?: Record<string, unknown>,
): string | null {
  // 1. Check server-managed HttpOnly cookie
  const cookies = parseCookies(request);
  const cookieToken = cookies[COOKIE_NAME];
  if (cookieToken) return cookieToken;

  // 2. Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  // 3. Fallback to request body or query parameter for programmatic/test consumers
  if (body) {
    if (typeof body["sessionId"] === "string" && body["sessionId"]) {
      return body["sessionId"];
    }
    if (typeof body["adminSessionId"] === "string" && body["adminSessionId"]) {
      return body["adminSessionId"];
    }
  }

  const queryToken = url.searchParams.get("sessionId");
  if (queryToken) return queryToken;

  return null;
}

/**
 * Validates Cross-Site Request Forgery (CSRF) protections for state-changing endpoints.
 * State-changing operations (POST, PUT, DELETE, PATCH) must have matching Origin/Referer
 * or a custom anti-CSRF header that cross-site form/script submissions cannot attach.
 */
function validateCsrf(request: Request, url: URL): { valid: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { valid: true };
  }

  // 1. Origin header verification
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestHost =
        request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
      if (originUrl.host !== requestHost) {
        return {
          valid: false,
          reason: `CSRF check failed: Origin mismatch (expected ${requestHost}, got ${originUrl.host})`,
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: "CSRF check failed: Malformed Origin header" };
    }
  }

  // 2. Referer header verification if Origin is not supplied
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const requestHost =
        request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
      if (refererUrl.host !== requestHost) {
        return {
          valid: false,
          reason: `CSRF check failed: Referer mismatch (expected ${requestHost}, got ${refererUrl.host})`,
        };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: "CSRF check failed: Malformed Referer header" };
    }
  }

  // 3. Custom Anti-CSRF Header verification for browser/API requests without Origin (e.g. some same-origin navigations)
  const csrfHeader = request.headers.get("x-mst-csrf") || request.headers.get("x-csrf-token");
  const requestedWith = request.headers.get("x-requested-with");
  const isCustomHeaderPresent = csrfHeader === "1" || requestedWith === "MST-TokenEstate";

  const cookies = parseCookies(request);
  const hasSessionCookie = Boolean(cookies[COOKIE_NAME]);

  // If a session cookie is present, state changes must carry a verified custom header or origin
  if (hasSessionCookie && !isCustomHeaderPresent) {
    return {
      valid: false,
      reason:
        "CSRF check failed: Cookie-authenticated state-changing request requires matching Origin or X-MST-CSRF header.",
    };
  }

  return { valid: true };
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Invalid JSON: Root must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Root must be a JSON object")) {
      throw err;
    }
    throw new Error("Malformed JSON in request body");
  }
}

function jsonResponse(data: unknown, status = 200, setCookieHeader?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (setCookieHeader) {
    headers.set("Set-Cookie", setCookieHeader);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function errorResponse(message: string, status = 400, setCookieHeader?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (setCookieHeader) {
    headers.set("Set-Cookie", setCookieHeader);
  }
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });
}

export async function handleAuthApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname.replace(/\/$/, "");
  const method = request.method.toUpperCase();
  const isSecure = isSecureRequest(request, url);

  // Enforce CSRF protection for all state-changing endpoints
  const csrfCheck = validateCsrf(request, url);
  if (!csrfCheck.valid) {
    return errorResponse(csrfCheck.reason || "CSRF validation failed", 403);
  }

  try {
    if (method === "GET" && path === "/api/auth/storage-status") {
      return jsonResponse({ status: getAuthStorageStatus() });
    }

    if (method === "POST" && path === "/api/auth/login") {
      const body = await parseJsonBody(request);
      const email = typeof body["email"] === "string" ? body["email"].trim() : "";
      const password = typeof body["password"] === "string" ? body["password"] : "";

      if (!email || !password) {
        return errorResponse("Email and password are required.", 400);
      }

      const result = await loginUser({ email, password });
      const cookieHeader = createSessionCookieHeader(result.session.id, isSecure);
      return jsonResponse(result, 200, cookieHeader);
    }

    if (method === "POST" && path === "/api/auth/signup") {
      const body = await parseJsonBody(request);
      const name = typeof body["name"] === "string" ? body["name"].trim() : "";
      const email = typeof body["email"] === "string" ? body["email"].trim() : "";
      const password = typeof body["password"] === "string" ? body["password"] : "";

      const result = await signUpUser({ name, email, password });
      const cookieHeader = createSessionCookieHeader(result.session.id, isSecure);
      return jsonResponse(result, 200, cookieHeader);
    }

    if (method === "POST" && path === "/api/auth/validate") {
      const body = await parseJsonBody(request).catch(() => ({}));
      const sessionId = extractSessionToken(request, url, body);

      if (!sessionId) {
        return jsonResponse({ user: null, session: null }, 401, createClearCookieHeader(isSecure));
      }

      const result = await validateSession(sessionId);
      if (!result) {
        return jsonResponse({ user: null, session: null }, 401, createClearCookieHeader(isSecure));
      }

      return jsonResponse(result, 200);
    }

    if (method === "POST" && path === "/api/auth/logout") {
      const body = await parseJsonBody(request).catch(() => ({}));
      const sessionId = extractSessionToken(request, url, body);

      const success = sessionId ? await logoutUser(sessionId) : false;
      const clearCookie = createClearCookieHeader(isSecure);
      return jsonResponse({ success }, 200, clearCookie);
    }

    if (method === "POST" && path === "/api/auth/roles") {
      const body = await parseJsonBody(request);
      const adminSessionId = extractSessionToken(request, url, body);
      const targetUserId =
        typeof body["targetUserId"] === "string" ? body["targetUserId"].trim() : "";
      const newRoleRaw = typeof body["newRole"] === "string" ? body["newRole"].trim() : "";

      if (!adminSessionId || !targetUserId || !newRoleRaw) {
        return errorResponse("Missing required parameters for role assignment.", 400);
      }

      // Strict role whitelist check at the API boundary
      if (!APP_ROLES.includes(newRoleRaw as AppRole)) {
        return errorResponse(
          `Invalid role "${newRoleRaw}". Supported roles: ${APP_ROLES.join(", ")}`,
          400,
        );
      }

      const user = await assignUserRole({
        adminSessionId,
        targetUserId,
        newRole: newRoleRaw as AppRole,
      });
      return jsonResponse({ user });
    }

    if (method === "POST" && path === "/api/auth/wallet") {
      const body = await parseJsonBody(request);
      const sessionId = extractSessionToken(request, url, body);
      const walletAddress =
        typeof body["walletAddress"] === "string" ? body["walletAddress"].trim() : "";

      if (!sessionId || !walletAddress) {
        return errorResponse("Session ID and wallet address are required.", 400);
      }

      const user = await linkWalletToUser({
        sessionId,
        walletAddress,
      });
      return jsonResponse({ user });
    }

    if (method === "GET" && path === "/api/auth/users") {
      const sessionId = extractSessionToken(request, url);
      if (!sessionId) {
        return errorResponse("Authentication required.", 401);
      }
      const users = await getAllUsers(sessionId);
      return jsonResponse({ users });
    }

    if (method === "GET" && path === "/api/auth/audit-logs") {
      const sessionId = extractSessionToken(request, url);
      if (!sessionId) {
        return errorResponse("Authentication required.", 401);
      }
      const auditLogs = await getAuditLogs(sessionId);
      return jsonResponse({ auditLogs });
    }

    return errorResponse(`Endpoint not found: ${method} ${path}`, 404);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.toLowerCase().includes("access denied") ? 403 : 400;
    return errorResponse(message, status);
  }
}
