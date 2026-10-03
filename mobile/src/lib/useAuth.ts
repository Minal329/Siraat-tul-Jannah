import { createContext, useContext } from "react";
import type { Role, User } from "./types.ts";

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; fullName: string; whatsappNumber?: string }) => Promise<User>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

// Who is logged in: const { user, login, logout } = useAuth();
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}

// Each role's home screen.
export function homeFor(role: Role) {
  return role === "TEACHER" ? "/teacher" : role === "STUDENT" ? "/student" : "/admin";
}
