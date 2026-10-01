// My account: who I'm logged in as, changing my password (e.g. after the academy
// gave me a temporary one — this logs out my other devices), and logging out.
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Muted, Notice, Screen, Title } from "../components/ui.tsx";
import { api, tokenStore, type Tokens } from "../lib/api.ts";
import { useAction } from "../lib/hooks.ts";
import { useAuth } from "../lib/useAuth.ts";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useAction();
  const set = (key: keyof typeof form) => (value: string) => {
    setForm({ ...form, [key]: value });
    setDone(false);
  };

  async function change() {
    if (form.newPassword.length < 8) return setError("The new password must be at least 8 characters.");
    if (form.newPassword !== form.confirm) return setError("The two new passwords don't match.");
    const result = await run(() =>
      api<{ tokens: Tokens }>("/auth/change-password", { body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    );
    if (result) {
      await tokenStore.save(result.tokens); // this phone stays logged in with the new password
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setDone(true);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "My Account" }} />
      <Card>
        <Title>{user?.profile?.fullName}</Title>
        <Muted>{user?.email}</Muted>
      </Card>
      <Card>
        <Title>Change password</Title>
        <Field label="Current password" secureTextEntry autoComplete="current-password" value={form.currentPassword} onChangeText={set("currentPassword")} />
        <Field label="New password" secureTextEntry autoComplete="new-password" value={form.newPassword} onChangeText={set("newPassword")} />
        <Field label="New password again" secureTextEntry autoComplete="new-password" value={form.confirm} onChangeText={set("confirm")} />
        <ErrorText error={error} />
        {done && <Notice>Password changed. You've been logged out on your other devices.</Notice>}
        <Button label={busy ? "Saving…" : "Change password"} onPress={change} disabled={busy} />
      </Card>
      <Button
        variant="outline"
        label="Log out"
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
