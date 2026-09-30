import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "../lib/api.ts";
import { AuthProvider } from "../lib/auth.tsx";
import { LoginPage } from "./Login.tsx";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage mode="login" />} />
          <Route path="/student" element={<div>Student home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tokenStore.clear();
  vi.restoreAllMocks();
});

describe("Login page", () => {
  it("logs a student in and takes them to their dashboard", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json(200, {
        data: {
          user: { id: "u1", email: "ayesha@siraat.test", role: "STUDENT", profile: { id: "s1", fullName: "Ayesha", whatsappNumber: null } },
          tokens: { accessToken: "a", refreshToken: "r", accessTokenExpiresIn: 900 },
        },
      }),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "ayesha@siraat.test");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Student home")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ email: "ayesha@siraat.test", password: "password123" });
    expect(tokenStore.refreshToken).toBe("r");
  });

  it("shows the server's message for a wrong password", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } }));
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "x@y.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });
});
