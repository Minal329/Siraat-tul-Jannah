// Who is logged in, shared with every page through React context.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, type Tokens } from "./api.ts";
import type { User } from "./types.ts";
import { AuthContext } from "./useAuth.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Only a returning visitor (with a saved refresh token) needs a check first.
  const [loading, setLoading] = useState(() => tokenStore.refreshToken !== null);

  // Returning visitor: find out who they are.
  useEffect(() => {
    if (!tokenStore.refreshToken) return;
    api<{ user: User }>("/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User; tokens: Tokens }>("/auth/login", { body: { email, password } });
    tokenStore.save(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: { email: string; password: string; fullName: string; whatsappNumber?: string }) => {
    const data = await api<{ user: User; tokens: Tokens }>("/auth/register", { body: input });
    tokenStore.save(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.refreshToken;
    tokenStore.clear();
    setUser(null);
    if (refreshToken) await api("/auth/logout", { body: { refreshToken } }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
