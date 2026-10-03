// Temporary passwords (new teacher accounts, password resets): shown ONCE, with a
// button to send them privately (e.g. WhatsApp) through the phone's share sheet.
import { useState } from "react";
import { Alert, Platform, Share, Text, View } from "react-native";
import { api } from "../lib/api.ts";
import { useAction } from "../lib/hooks.ts";
import { colors, fonts } from "../lib/theme.ts";
import { Button, ErrorText, Muted, styles } from "./ui.tsx";

export function TemporaryPasswordNotice({ name, email, password }: { name: string; email: string; password: string }) {
  const message = `Assalamu Alaikum ${name}! Your Siraat tul Jannah login:\nEmail: ${email}\nTemporary password: ${password}\nPlease change it on the Account page after logging in.`;
  return (
    <View style={[styles.notice, { backgroundColor: colors.okBg, gap: 8 }]}>
        <Text style={{ fontFamily: fonts.body, color: colors.navy, fontSize: 13 }}>
          Temporary password for {name}:
        </Text>
        <Text selectable accessibilityLabel={`Temporary password ${password}`} style={{ fontFamily: fonts.bodyBold, color: colors.navy, fontSize: 18, letterSpacing: 0.5 }}>
          {password}
        </Text>
        <Muted small>It won't be shown again — share it privately now.</Muted>
        <Button small variant="outline" label="Send on WhatsApp / share" onPress={() => void Share.share({ message })} />
    </View>
  );
}

// Asks first (the old password stops working at once), then shows the new temporary password.
export function ResetPasswordButton({ userId, name, email }: { userId: string; name: string; email: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function reset() {
    const result = await run(() => api<{ temporaryPassword: string }>(`/admin/users/${userId}/reset-password`, { method: "POST" }));
    if (result) setPassword(result.temporaryPassword);
  }
  function confirm() {
    const question = `Give ${name} a new temporary password? Their old password stops working and they're logged out on every phone.`;
    if (Platform.OS === "web") {
      if (window.confirm(question)) void reset();
      return;
    }
    Alert.alert("Reset password?", question, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => void reset() },
    ]);
  }

  if (password) return <TemporaryPasswordNotice name={name} email={email} password={password} />;
  return (
    <>
      <Button small variant="outline" label={busy ? "Resetting…" : "Reset password"} onPress={confirm} disabled={busy} />
      <ErrorText error={error} />
    </>
  );
}
