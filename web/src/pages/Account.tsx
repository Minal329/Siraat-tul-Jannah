// My account: who I'm logged in as, and changing my password (e.g. after the
// academy gave me a temporary one). Changing it logs out every other device.
import { useState, type FormEvent } from "react";
import { Layout } from "../components/Layout.tsx";
import { ErrorMessage } from "../components/ui.tsx";
import { api, tokenStore, type Tokens } from "../lib/api.ts";
import { useAction } from "../lib/hooks.ts";
import { useAuth } from "../lib/useAuth.ts";

export function AccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setError("The two new passwords don't match.");
    const result = await run(() =>
      api<{ tokens: Tokens }>("/auth/change-password", { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    );
    if (result) {
      tokenStore.save(result.tokens); // this browser stays logged in with the new password
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setDone(true);
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [key]: e.target.value });
    setDone(false);
  };

  return (
    <Layout subtitle="My Account">
      <div className="stack" style={{ maxWidth: 480, width: "100%", alignSelf: "center" }}>
        <div className="card">
          <h1 className="card-title">{user?.profile?.fullName}</h1>
          <div className="muted">{user?.email}</div>
        </div>
        <form className="card" onSubmit={submit}>
          <h2 className="card-title">Change password</h2>
          <div className="field">
            <label htmlFor="current">Current password</label>
            <input id="current" className="input" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={set("currentPassword")} />
          </div>
          <div className="field">
            <label htmlFor="new">New password</label>
            <input id="new" className="input" type="password" autoComplete="new-password" required minLength={8} value={form.newPassword} onChange={set("newPassword")} />
            <span className="muted small">At least 8 characters.</span>
          </div>
          <div className="field">
            <label htmlFor="confirm">New password again</label>
            <input id="confirm" className="input" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} />
          </div>
          <ErrorMessage error={error} />
          {done && <div className="alert alert-ok" role="status">Password changed. You've been logged out on your other devices.</div>}
          <button className="btn" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        </form>
      </div>
    </Layout>
  );
}
