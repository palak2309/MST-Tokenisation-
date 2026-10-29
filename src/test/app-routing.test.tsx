import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing and route matching", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  const routesToTest = [
    { path: "/", expectedId: "/" },
    { path: "/properties/new", expectedId: "/properties/new" },
    { path: "/verify", expectedId: "/verify" },
    { path: "/invest", expectedId: "/invest" },
    { path: "/rental", expectedId: "/rental" },
    { path: "/activity", expectedId: "/activity" },
    { path: "/about", expectedId: "/about" },
    { path: "/login", expectedId: "/login" },
    { path: "/signup", expectedId: "/signup" },
    { path: "/admin", expectedId: "/admin" },
    { path: "/dashboard", expectedId: "/dashboard" },
    { path: "/pause", expectedId: "/pause" },
  ];

  routesToTest.forEach(({ path, expectedId }) => {
    it(`matches valid route for ${path} instead of root or not found`, () => {
      const matches = router.matchRoutes(path);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
      expect(matches.at(-1)?.routeId).toBe(expectedId);
    });
  });
});
