// A panel that slides up from the bottom of the screen (prototype's settings sheet).
// Used for forms like "Payment Account Settings" or "Add a course".
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme.ts";
import { Icon } from "./Icon.tsx";

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.sheet}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={s.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.close}>
              <Icon name="close" size={14} color={colors.text2} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(28,38,32,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, gap: 14, maxHeight: "90%" },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text, flex: 1 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ivory2, alignItems: "center", justifyContent: "center" },
});
