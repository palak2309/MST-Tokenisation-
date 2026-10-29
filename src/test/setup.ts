import "@testing-library/jest-dom/vitest";
import { handleAuthApiRequest } from "@/lib/auth/serverApi";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

let testCookieJar: string | null = null;

export function resetTestCookieJar(): void {
  testCookieJar = null;
}

// Intercept client fetch to /api/auth and route directly to the server-side auth API handler
const originalFetch = globalThis.fetch;
const authFetchHandler = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (urlStr.includes("/api/auth")) {
    const fullUrl = urlStr.startsWith("http")
      ? urlStr
      : `http://localhost${urlStr.startsWith("/") ? "" : "/"}${urlStr}`;
    const reqInit: RequestInit = {};
    const headers = new Headers(init?.headers);

    // If no Cookie header is passed explicitly, attach the ambient test Cookie jar
    if (!headers.has("Cookie") && testCookieJar) {
      headers.set("Cookie", testCookieJar);
    }
    // Set origin to localhost if absent to simulate same-origin browser requests
    if (!headers.has("Origin")) {
      headers.set("Origin", "http://localhost");
    }
    reqInit.headers = headers;

    if (init) {
      if (init.method !== undefined) reqInit.method = init.method;
      if (init.body !== undefined) reqInit.body = init.body;
      if (init.signal !== undefined) reqInit.signal = init.signal;
    }

    const req = new Request(fullUrl, reqInit);
    const res = await handleAuthApiRequest(req);

    // Track Set-Cookie response header into testCookieJar
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) {
      if (setCookie.includes("Max-Age=0") || setCookie.includes("Expires=Thu, 01 Jan 1970")) {
        testCookieJar = null;
      } else {
        const match = setCookie.match(/mst_session_token=[^;]+/);
        if (match) {
          testCookieJar = match[0];
        }
      }
    }

    return res;
  }

  return originalFetch ? originalFetch(input, init) : new Response(null, { status: 404 });
};

globalThis.fetch = authFetchHandler;
if (typeof window !== "undefined") {
  window.fetch = authFetchHandler;
}
