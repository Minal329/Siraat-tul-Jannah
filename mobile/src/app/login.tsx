// Login / Sign Up (prototype screen 1, "Main" on the design canvas).
//
// Sign-up only ever creates STUDENT accounts — teacher and admin accounts are
// made by the academy (otherwise anyone could sign up as an admin). The
// prototype's "I am a" picker is kept, so teachers and admins are pointed to
// Log in instead of being left wondering.
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, ErrorText, Field, Notice } from "../components/ui.tsx";
import { useAction } from "../lib/hooks.ts";
import { colors, fonts } from "../lib/theme.ts";
import { homeFor, useAuth } from "../lib/useAuth.ts";

type Mode = "login" | "signup";
type SignupRole = "student" | "teacher" | "admin";
const ROLES: { id: SignupRole; label: string }[] = [
  { id: "student", label: "Student" },
  { id: "teacher", label: "Teacher" },
  { id: "admin", label: "Admin" },
];

export default function LoginScreen() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const [mode, setModeState] = useState<Mode>(params.mode === "signup" ? "signup" : "login");
  const [role, setRole] = useState<SignupRole>("student");
  const [showForgot, setShowForgot] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", whatsappNumber: "" });
  const { login, register } = useAuth();
  const { busy, error, setError, run } = useAction();

  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const setMode = (next: Mode) => {
    setModeState(next);
    setError(null);
    setShowForgot(false);
  };

  async function submit() {
    // Quick checks before calling the server, with friendly wording.
    if (mode === "signup" && form.fullName.trim().length < 2) return setError("Enter your full name.");
    if (!form.email.trim()) return setError("Enter your email address.");
    if (!form.password) return setError("Enter your password.");

    const user = await run(() =>
      mode === "login"
        ? login(form.email.trim(), form.password)
        : register({
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            password: form.password,
            whatsappNumber: form.whatsappNumber.trim() || undefined,
          }),
    );
    if (user) router.replace(params.next && user.role === "STUDENT" ? (params.next as "/courses") : homeFor(user.role));
  }

  const isLogin = mode === "login";
  const staffPicked = !isLogin && role !== "student";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ivory }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {/* Navy header with the academy's logo */}
        <View style={s.header}>
          <CirclePattern />
          <View style={s.logoCircle}>
            <Image source={require("../../assets/images/logo.png")} style={{ width: 62, height: 53 }} contentFit="contain" accessibilityLabel="Siraat tul Jannah logo" />
          </View>
          <Text style={s.brand}>Siraat tul Jannah</Text>
          <Text style={s.tagline}>LEARN. RECITE. GROW.</Text>
        </View>

        <View style={s.body}>
          {/* Login / Sign Up tabs */}
          <View style={s.tabs} accessibilityRole="tablist">
            {(["login", "signup"] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => setMode(m)}
                style={[s.tab, mode === m && s.tabSelected]}
              >
                <Text style={[s.tabText, mode === m && { color: colors.navy }]}>{m === "login" ? "Login" : "Sign Up"}</Text>
              </Pressable>
            ))}
          </View>

          {!isLogin && (
            <Field label="Full name" placeholder="Aiman Fatima" autoComplete="name" textContentType="name" value={form.fullName} onChangeText={set("fullName")} />
          )}
          <Field
            label="Email"
            placeholder="you@example.com"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.email}
            onChangeText={set("email")}
          />
          <Field
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete={isLogin ? "current-password" : "new-password"}
            textContentType={isLogin ? "password" : "newPassword"}
            value={form.password}
            onChangeText={set("password")}
            returnKeyType={isLogin ? "go" : "next"}
            onSubmitEditing={isLogin ? submit : undefined}
          />

          {isLogin ? (
            <>
              <Text accessibilityRole="button" onPress={() => setShowForgot(!showForgot)} style={s.forgot}>
                Forgot password?
              </Text>
              {showForgot && (
                <Notice>
                  Message the academy on WhatsApp with your email address. The admin will send you a temporary password — after logging in, you can
                  change it on your Account page.
                </Notice>
              )}
            </>
          ) : (
            <>
              <Text style={s.hint}>At least 8 characters.</Text>
              <Field
                label="WhatsApp number (optional)"
                placeholder="+923001234567"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                value={form.whatsappNumber}
                onChangeText={set("whatsappNumber")}
              />
              <View style={{ gap: 8 }}>
                <Text style={s.label}>I am a</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {ROLES.map((r) => (
                    <Pressable
                      key={r.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: role === r.id }}
                      onPress={() => setRole(r.id)}
                      style={[s.role, role === r.id && s.roleSelected]}
                    >
                      <Text style={[s.roleText, role === r.id && { color: colors.ivory }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          <ErrorText error={error} />

          {staffPicked ? (
            <>
              <Notice>
                {role === "teacher" ? "Teacher" : "Admin"} accounts are created by the academy. Ask the admin for your login details, then log in.
              </Notice>
              <Button large label="Go to Log In" onPress={() => setMode("login")} />
            </>
          ) : (
            <Button large label={busy ? "Please wait…" : isLogin ? "Log In" : "Create Account"} onPress={submit} disabled={busy} />
          )}

          <View style={{ flexGrow: 1 }} />

          <Text style={s.footer}>
            {isLogin ? "New to the academy? " : "Already enrolled? "}
            <Text accessibilityRole="button" style={s.footerLink} onPress={() => setMode(isLogin ? "signup" : "login")}>
              {isLogin ? "Create an account" : "Log in"}
            </Text>
          </Text>
          <Text accessibilityRole="button" style={[s.footer, s.footerLink]} onPress={() => router.push("/courses")}>
            Browse courses
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The faint rings behind the logo (two staggered rows, like the prototype).
function CirclePattern() {
  const rings = [
    ...[40, 90, 140, 190, 240, 290, 340].map((x) => ({ x, y: 20 })),
    ...[65, 115, 165, 215, 265, 315].map((x) => ({ x, y: 55 })),
  ];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.12, alignItems: "center" }]}>
      <View style={{ width: 390, height: 90 }}>
        {rings.map(({ x, y }) => (
          <View key={`${x}-${y}`} style={[s.ring, { left: x - 18, top: y - 18 }]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: colors.navy, alignItems: "center", paddingTop: 64, paddingBottom: 28, paddingHorizontal: 28, gap: 10, overflow: "hidden" },
  ring: { position: "absolute", width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.white },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  brand: { fontFamily: fonts.display, fontSize: 24, color: colors.ivory, lineHeight: 30 },
  tagline: { fontFamily: fonts.body, fontSize: 12, letterSpacing: 0.7, color: "rgba(247,243,236,0.78)", marginTop: -4 },
  body: { flexGrow: 1, paddingTop: 28, paddingHorizontal: 24, paddingBottom: 32, gap: 18 },
  tabs: { flexDirection: "row", backgroundColor: colors.ivory2, borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabSelected: { backgroundColor: colors.white },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 14, color: "#5F6B63" },
  forgot: { alignSelf: "flex-end", fontFamily: fonts.bodySemi, fontSize: 13, color: colors.navy, marginTop: -6, paddingVertical: 4 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -10 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  role: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  roleSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  roleText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  footer: { textAlign: "center", fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  footerLink: { fontFamily: fonts.bodyBold, color: colors.navy },
});
