// Login / Sign Up (prototype screen 1). Public sign-up creates student accounts;
// teachers and admins are added by the academy.
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { ErrorMessage, HeaderPattern } from "../components/ui.tsx";
import { homeFor, useAuth } from "../lib/useAuth.ts";
import { useAction } from "../lib/hooks.ts";

export function LoginPage({ mode }: { mode: "login" | "signup" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", whatsappNumber: "" });

  if (user) return <Navigate to={next ?? homeFor(user.role)} replace />;

  const update = (field: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [field]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const signedIn = await run(() =>
      mode === "login"
        ? login(form.email, form.password)
        : register({
            fullName: form.fullName,
            email: form.email,
            password: form.password,
            whatsappNumber: form.whatsappNumber.trim() || undefined,
          }),
    );
    if (signedIn) navigate(next ?? homeFor(signedIn.role), { replace: true });
  }

  const other = mode === "login" ? "/signup" : "/login";
  const withNext = next ? `${other}?next=${encodeURIComponent(next)}` : other;

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <HeaderPattern />
        <div style={{ position: "relative" }}>
          <img src="/favicon.svg" alt="" width={72} height={72} />
          <div className="brand-name">Siraat tul Jannah</div>
          <div style={{ opacity: 0.8 }}>Learn. Recite. Grow.</div>
        </div>
      </div>

      <form className="card auth-card" onSubmit={submit}>
        <nav className="tabs" aria-label="Log in or sign up">
          <Link to={mode === "login" ? "/login" : withNext} className="tab tab-link" aria-current={mode === "login" ? "page" : undefined}>
            Login
          </Link>
          <Link to={mode === "signup" ? "/signup" : withNext} className="tab tab-link" aria-current={mode === "signup" ? "page" : undefined}>
            Sign Up
          </Link>
        </nav>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" className="input" autoComplete="name" required placeholder="Aiman Fatima" value={form.fullName} onChange={update("fullName")} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required placeholder="you@example.com" value={form.email} onChange={update("email")} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={form.password}
            onChange={update("password")}
          />
          {mode === "signup" && <span className="muted">At least 8 characters.</span>}
        </div>
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="whatsapp">WhatsApp number (optional)</label>
            <input id="whatsapp" className="input" type="tel" autoComplete="tel" placeholder="+923001234567" value={form.whatsappNumber} onChange={update("whatsappNumber")} />
          </div>
        )}

        <ErrorMessage error={error} />
        <button className="btn btn-block" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}
        </button>

        <p className="muted" style={{ textAlign: "center", margin: 0 }}>
          {mode === "login" ? "New to the academy? " : "Already enrolled? "}
          <Link to={withNext}>{mode === "login" ? "Create an account" : "Log in"}</Link>
          {" · "}
          <Link to="/courses">Browse courses</Link>
        </p>
        {mode === "signup" && <p className="muted small" style={{ margin: 0, textAlign: "center" }}>Teachers: your account is created by the academy — please ask the admin.</p>}
      </form>
    </div>
  );
}
