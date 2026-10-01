import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import LoginScreen from "../app/login.tsx";
import { ApiError } from "../lib/api.ts";
import type { User } from "../lib/types.ts";
import { AuthContext, type AuthState } from "../lib/useAuth.ts";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({}),
}));

const student = { id: "u1", email: "ayesha@siraat.test", role: "STUDENT", profile: { id: "s1", fullName: "Ayesha", whatsappNumber: null } } as User;

async function renderLogin(overrides: Partial<AuthState> = {}) {
  const auth: AuthState = {
    user: null,
    loading: false,
    login: jest.fn(async () => student),
    register: jest.fn(async () => student),
    logout: jest.fn(async () => undefined),
    ...overrides,
  };
  await render(
    <AuthContext.Provider value={auth}>
      <LoginScreen />
    </AuthContext.Provider>,
  );
  return auth;
}

describe("Login screen", () => {
  it("logs a student in and opens their dashboard", async () => {
    const auth = await renderLogin();
    await fireEvent.changeText(screen.getByLabelText("Email"), " ayesha@siraat.test ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password123");
    await fireEvent.press(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/student"));
    expect(auth.login).toHaveBeenCalledWith("ayesha@siraat.test", "password123");
  });

  it("shows the server's message when the password is wrong", async () => {
    await renderLogin({ login: jest.fn(async () => Promise.reject(new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password."))) });
    await fireEvent.changeText(screen.getByLabelText("Email"), "ayesha@siraat.test");
    await fireEvent.changeText(screen.getByLabelText("Password"), "nope");
    await fireEvent.press(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeTruthy();
  });

  it("asks for the email before calling the server", async () => {
    const auth = await renderLogin();
    await fireEvent.press(screen.getByRole("button", { name: "Log In" }));
    expect(screen.getByText("Enter your email address.")).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("signs up a student", async () => {
    const auth = await renderLogin();
    await fireEvent.press(screen.getByRole("tab", { name: "Sign Up" }));
    await fireEvent.changeText(screen.getByLabelText("Full name"), "Aiman Fatima");
    await fireEvent.changeText(screen.getByLabelText("Email"), "aiman@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "password123");
    await fireEvent.press(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() =>
      expect(auth.register).toHaveBeenCalledWith({ fullName: "Aiman Fatima", email: "aiman@example.com", password: "password123", whatsappNumber: undefined }),
    );
  });

  it("tells teachers and admins that the academy creates their accounts", async () => {
    const auth = await renderLogin();
    await fireEvent.press(screen.getByRole("tab", { name: "Sign Up" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Admin" }));

    expect(screen.getByText(/Admin accounts are created by the academy/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create Account" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Go to Log In" }));
    expect(screen.getByRole("button", { name: "Log In" })).toBeTruthy();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("explains how to reset a forgotten password", async () => {
    await renderLogin();
    await fireEvent.press(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText(/The admin will send you a temporary password/)).toBeTruthy();
  });
});
