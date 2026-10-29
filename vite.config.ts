// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

function authDevPlugin(): Plugin {
  return {
    name: "mst-auth-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.url && req.url.startsWith("/api/auth")) {
            try {
              const { handleAuthApiRequest } = await import("./src/lib/auth/serverApi");
              const host = req.headers.host || "localhost:8081";
              const fullUrl = `http://${host}${req.url}`;
              const chunks: Uint8Array[] = [];
              for await (const chunk of req) {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
              }
              const body =
                req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0
                  ? Buffer.concat(chunks)
                  : undefined;
              const reqInit: RequestInit = {};
              if (req.method) reqInit.method = req.method;
              if (req.headers) reqInit.headers = req.headers as HeadersInit;
              if (body) reqInit.body = body;

              const webReq = new Request(fullUrl, reqInit);
              const webRes = await handleAuthApiRequest(webReq);
              res.statusCode = webRes.status;
              webRes.headers.forEach((v, k) => res.setHeader(k, v));
              const text = await webRes.text();
              res.end(text);
            } catch (err: unknown) {
              res.statusCode = 500;
              const message = err instanceof Error ? err.message : "Dev server auth error";
              res.end(JSON.stringify({ error: message }));
            }
          } else {
            next();
          }
        },
      );
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [authDevPlugin()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
