// Certificate (prototype screen 9): the certificate drawn in the app, with
// "Save Image" (to the phone's photos) and "Share" (WhatsApp etc.) as a PNG.
import { Stack, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CertificateCard } from "../../../components/CertificateCard.tsx";
import { Icon } from "../../../components/Icon.tsx";
import { Empty, ErrorText, Loaded, Notice, Screen } from "../../../components/ui.tsx";
import { api } from "../../../lib/api.ts";
import { useAction, useLoad } from "../../../lib/hooks.ts";
import { saveViewAsImage, shareViewAsImage } from "../../../lib/saveImage.ts";
import { colors, fonts } from "../../../lib/theme.ts";
import type { Enrollment } from "../../../lib/types.ts";
import { useAuth } from "../../../lib/useAuth.ts";

export default function CertificateScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const { user } = useAuth();
  const state = useLoad(async () => {
    const { enrollments } = await api<{ enrollments: Enrollment[] }>("/enrollments/mine");
    return enrollments.find((e) => e.certificate?.certificateNumber === number) ?? null;
  }, [number]);
  const card = useRef<View>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const fileName = `Siraat-tul-Jannah-certificate-${number}.png`;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Certificate" }} />
      <Loaded state={state}>
        {(enrollment) =>
          !enrollment?.certificate ? (
            <Empty>Certificate not found.</Empty>
          ) : (
            <>
              <CertificateCard
                ref={card}
                certificate={{
                  studentName: user?.profile?.fullName ?? "",
                  courseTitle: enrollment.course.title,
                  certificateNumber: enrollment.certificate.certificateNumber,
                  issuedAt: enrollment.certificate.issuedAt,
                }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <ActionButton
                  icon="download"
                  label={busy ? "Please wait…" : "Save Image"}
                  primary
                  disabled={busy}
                  onPress={async () => {
                    setSaved(null);
                    const message = await run(() => saveViewAsImage(card, fileName));
                    if (message) setSaved(message);
                  }}
                />
                <ActionButton icon="share" label="Share" disabled={busy} onPress={() => run(() => shareViewAsImage(card, fileName))} />
              </View>
              {saved && <Notice>{saved}</Notice>}
              <ErrorText error={error} />
              <Text style={s.footnote}>Issued by Hafiza Aqsa Jamil based on your attendance and lesson feedback.</Text>
            </>
          )
        }
      </Loaded>
    </Screen>
  );
}

function ActionButton({ icon, label, onPress, primary, disabled }: { icon: "download" | "share"; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const fg = primary ? colors.ivory : colors.text2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.action, primary ? s.actionPrimary : s.actionOutline, { opacity: disabled ? 0.6 : pressed ? 0.85 : 1 }]}
    >
      <Icon name={icon} size={14} color={fg} strokeWidth={2} />
      <Text style={[s.actionText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  action: { flex: 1, minHeight: 46, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionPrimary: { backgroundColor: colors.navy },
  actionOutline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line2 },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  footnote: { fontFamily: fonts.body, fontSize: 11, color: "#6B7380", textAlign: "center", lineHeight: 16 },
});
