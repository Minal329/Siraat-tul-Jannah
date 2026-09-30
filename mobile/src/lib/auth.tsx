// Who is logged in, shared with every screen through React context.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, type Tokens } from "./api.ts";
import type { User } from "./types.ts";
import { AuthContext } from "./useAuth.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // App start: if a refresh token is saved, find out who they are.
  useEffect(() => {
    tokenStore
      .getRefreshToken()
      .then((token) => (token ? api<{ user: User }>("/auth/me").then(({ user }) => setUser(user)) : undefined))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User; tokens: Tokens }>("/auth/login", { body: { email, password } });
    await tokenStore.save(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: { email: string; password: string; fullName: string; whatsappNumber?: string }) => {
    const data = await api<{ user: User; tokens: Tokens }>("/auth/register", { body: input });
    await tokenStore.save(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    await tokenStore.clear();
    setUser(null);
    if (refreshToken) await api("/auth/logout", { body: { refreshToken } }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
