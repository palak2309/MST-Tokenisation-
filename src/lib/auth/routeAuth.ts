import { redirect } from "@tanstack/react-router";
import { clientRestoreSession } from "./clientAuth";
import type { AppRole, User } from "./types";

export interface RouteAuthResult {
  user: User;
}

/**
 * Route-level authentication and authorization loader for TanStack Router routes.
 * Executes before the route component mounts, both on client transitions and initial page loads.
 * Fails closed: unauthenticated requests are redirected to /login with the intended destination.
 */
export async function requireAuthLoader(options?: {
  location?: { href?: string; pathname?: string };
  requiredRole?: AppRole | AppRole[];
}): Promise<RouteAuthResult> {
  const user = await clientRestoreSession();

  if (!user) {
    const destination = options?.location?.pathname || options?.location?.href;
    const shouldRedirect = Boolean(destination && destination !== "/" && destination !== "/login");
    throw redirect({
      to: "/login",
      search: shouldRedirect ? { redirect: destination } : {},
    });
  }

  if (options?.requiredRole) {
    const allowed = Array.isArray(options.requiredRole)
      ? options.requiredRole
      : [options.requiredRole];
    if (!allowed.includes(user.role)) {
      throw redirect({
        to: "/dashboard",
      });
    }
  }

  return { user };
}

/**
 * Loader for public authentication routes (/login, /signup).
 * If a valid authenticated session is already active, redirects away from the login form
 * directly to the appropriate dashboard or intended redirect target.
 */
export async function redirectIfAuthenticatedLoader(options?: {
  redirectTarget?: string | undefined;
}): Promise<void> {
  const user = await clientRestoreSession();
  if (user) {
    const destination =
      options?.redirectTarget &&
      options.redirectTarget !== "/login" &&
      options.redirectTarget !== "/signup"
        ? options.redirectTarget
        : "/dashboard";

    throw redirect({
      to: destination,
    });
  }
}
