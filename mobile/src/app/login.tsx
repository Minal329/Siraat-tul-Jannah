// Login / Sign Up (prototype screen 1). Sign-up creates student accounts;
// teachers get their account from the academy.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { Button, ErrorText, Field, Muted, styles } from "../components/ui.tsx";
import { useAction } from "../lib/hooks.ts";
import { colors, fonts } from "../lib/theme.ts";
import { homeFor, useAuth } from "../lib/useAuth.ts";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const [mode, setMode] = useState<"login" | "signup">(params.mode === "signup" ? "signup" : "login");
  const { login, register } = useAuth();
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", whatsappNumber: "" });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });

  async function submit() {
    const user = await run(() =>
      mode === "login"
        ? login(form.email.trim(), form.password)
        : register({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password, whatsappNumber: form.whatsappNumber.trim() || undefined }),
    );
    if (user) router.replace(params.next && user.role === "STUDENT" ? (params.next as "/courses") : homeFor(user.role));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ivory }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.navy, alignItems: "center", paddingTop: 72, paddingBottom: 48, gap: 6 }}>
          <Image source={require("../../assets/images/splash-icon.png")} style={{ width: 84, height: 84 }} accessibilityIgnoresInvertColors />
          <Text style={{ fontFamily: fonts.display, fontSize: 32, color: colors.ivory }}>Siraat tul Jannah</Text>
          <Text style={{ fontFamily: fonts.body, color: "rgba(245,240,228,0.8)" }}>Learn. Recite. Grow.</Text>
        </View>

        <View style={[styles.card, { margin: 16, marginTop: -24, gap: 14 }]}>
          <View style={{ flexDirection: "row", backgroundColor: colors.ivory2, borderRadius: 12, padding: 4 }} accessibilityRole="tablist">
            {(["login", "signup"] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => setMode(m)}
                style={{ flex: 1, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? colors.white : "transparent" }}
              >
                <Text style={{ fontFamily: fonts.bodyBold, color: mode === m ? colors.navy : colors.text2 }}>{m === "login" ? "Login" : "Sign Up"}</Text>
              </Pressable>
            ))}
          </View>

          {mode === "signup" && <Field label="Full name" placeholder="Aiman Fatima" autoComplete="name" value={form.fullName} onChangeText={set("fullName")} />}
          <Field label="Email" placeholder="you@example.com" autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set("email")} />
          <Field label="Password" secureTextEntry autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChangeText={set("password")} />
          {mode === "signup" && (
            <>
              <Muted small>At least 8 characters.</Muted>
              <Field label="WhatsApp number (optional)" placeholder="+923001234567" keyboardType="phone-pad" value={form.whatsappNumber} onChangeText={set("whatsappNumber")} />
            </>
          )}

          <ErrorText error={error} />
          <Button label={busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"} onPress={submit} disabled={busy} />
          <Button label="Browse courses" variant="outline" onPress={() => router.push("/courses")} />
          {mode === "signup" && <Muted small>Teachers: your account is created by the academy — please ask the admin.</Muted>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
