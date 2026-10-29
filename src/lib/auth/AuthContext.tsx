import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { type AppRole, type User, ROLE_PERMISSIONS, type RolePermissions } from "./types";
import {
  clientAssignRole,
  clientLinkWallet,
  clientLogin,
  clientLogout,
  clientRestoreSession,
  clientSignup,
} from "./clientAuth";

interface AuthContextValue {
  user: User | null;
  role: AppRole | null;
  permissions: RolePermissions | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (params: { name: string; email: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  linkWallet: (walletAddress: string) => Promise<User>;
  assignRole: (targetUserId: string, newRole: AppRole) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const restored = await clientRestoreSession();
      setUser(restored);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const loggedInUser = await clientLogin(email, password);
      setUser(loggedInUser);
      return loggedInUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(
    async (params: { name: string; email: string; password: string }): Promise<User> => {
      setIsLoading(true);
      try {
        const newUser = await clientSignup(params);
        setUser(newUser);
        return newUser;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await clientLogout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const linkWallet = useCallback(async (walletAddress: string): Promise<User> => {
    const updated = await clientLinkWallet(walletAddress);
    setUser(updated);
    return updated;
  }, []);

  const assignRole = useCallback(
    async (targetUserId: string, newRole: AppRole): Promise<User> => {
      const updated = await clientAssignRole(targetUserId, newRole);
      // If updating self, update state
      if (user && user.id === updated.id) {
        setUser(updated);
      }
      return updated;
    },
    [user],
  );

  const role = user?.role ?? null;
  const permissions = role ? ROLE_PERMISSIONS[role] : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        permissions,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        signup,
        logout,
        refreshUser,
        linkWallet,
        assignRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
