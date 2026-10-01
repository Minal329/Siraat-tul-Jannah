// Who is logged in, shared with every page through React context.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, type Tokens } from "./api.ts";
import type { User } from "./types.ts";
import { AuthContext } from "./useAuth.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Only a returning visitor (logged in on this browser before) needs a check first.
  const [loading, setLoading] = useState(() => tokenStore.hasSession);

  // Returning visitor: find out who they are.
  useEffect(() => {
    if (!tokenStore.hasSession) return;
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
    tokenStore.clear();
    setUser(null);
    // The API revokes the token in the cookie and deletes the cookie.
    await api("/auth/logout", { body: {} }).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
