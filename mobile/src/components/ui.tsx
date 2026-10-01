// Building blocks shared by every screen, styled like the prototype.
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import type { ApiError } from "../lib/api.ts";
import { colors, fonts } from "../lib/theme.ts";

export function Screen({ children, onRefresh, refreshing = false }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ivory }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

// The navy greeting band under the top bar ("Assalamu Alaikum, Ayesha").
export function Greeting({ title, text }: { title: string; text?: string }) {
  return (
    <View style={styles.greeting}>
      <Text style={styles.greetingTitle}>{title}</Text>
      {text ? <Text style={styles.greetingText}>{text}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  return <Text style={[styles.muted, small && { fontSize: 12 }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

type ButtonVariant = "primary" | "gold" | "outline" | "danger";
export function Button({ label, onPress, variant = "primary", disabled, small, large }: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  small?: boolean;
  large?: boolean; // the main action of a screen, e.g. "Log In"
}) {
  const palette = {
    primary: { bg: colors.navy, fg: colors.ivory, border: colors.navy },
    gold: { bg: colors.gold, fg: colors.ivory, border: colors.gold },
    outline: { bg: colors.white, fg: colors.text2, border: colors.line2 },
    danger: { bg: colors.white, fg: colors.danger, border: "#E7C9C2" },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && { minHeight: 38, paddingHorizontal: 12 },
        large && { minHeight: 52, borderRadius: 12 },
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: palette.fg }, small && { fontSize: 13 }, large && { fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.navy, borderColor: colors.navy }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.ivory }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8A909A" style={styles.input} {...input} />
    </View>
  );
}

const PILLS: Record<string, [string, string, string]> = {
  PENDING: [colors.warnBg, colors.goldDark, "Awaiting approval"],
  APPROVED: [colors.warnBg, colors.goldDark, "In progress"],
  COMPLETED: [colors.okBg, colors.navy, "Completed"],
  REJECTED: [colors.dangerBg, colors.danger, "Not approved"],
  CANCELLED: [colors.dangerBg, colors.danger, "Cancelled"],
};
export function StatusPill({ status }: { status: string }) {
  const [bg, fg, label] = PILLS[status] ?? [colors.okBg, colors.navy, status];
  return <Text style={[styles.pill, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}

export function Notice({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "warn" | "error" }) {
  const [bg, fg] = { ok: [colors.okBg, colors.navy], warn: [colors.warnBg, colors.goldDark], error: [colors.dangerBg, colors.danger] }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole={tone === "error" ? "alert" : undefined}>
      <Text style={{ color: fg, fontFamily: fonts.body, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: ApiError | string | null | undefined }) {
  if (!error) return null;
  return <Notice tone="error">{typeof error === "string" ? error : error.message}</Notice>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={[styles.muted, { textAlign: "center", paddingVertical: 32 }]}>{children}</Text>;
}

// Spinner while loading, message on error, content when ready.
export function Loaded<T>({ state, children }: { state: { data: T | null; error: ApiError | null; loading: boolean }; children: (data: T) => ReactNode }) {
  if (state.error && !state.data) return <ErrorText error={state.error} />;
  if (state.data === null) return <ActivityIndicator color={colors.navy} style={{ marginTop: 32 }} accessibilityLabel="Loading" />;
  return <>{children(state.data)}</>;
}

export const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 40 },
  greeting: { backgroundColor: colors.navy, marginHorizontal: -16, marginTop: -16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  greetingTitle: { color: colors.ivory, fontFamily: fonts.bodySemi, fontSize: 17 },
  greetingText: { color: "rgba(245,240,228,0.78)", fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  section: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text2, textTransform: "uppercase", letterSpacing: 0.5 },
  button: { minHeight: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.white, justifyContent: "center" },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  input: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.white, paddingHorizontal: 12, fontFamily: fonts.body, fontSize: 15, color: colors.text },
  pill: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 11 },
  notice: { borderRadius: 12, padding: 12 },
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  quote: { backgroundColor: colors.ivory, borderRadius: 10, padding: 12 },
});
