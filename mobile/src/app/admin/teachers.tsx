// Admin → Teachers: add teacher accounts (a temporary password is shown once),
// reset a forgotten password, and disable/enable accounts (e.g. a teacher who left).
import { Stack } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Sheet } from "../../components/Sheet.tsx";
import { ResetPasswordButton, TemporaryPasswordNotice } from "../../components/TemporaryPassword.tsx";
import { Button, Card, Empty, ErrorText, Field, Loaded, Muted, Screen, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { initials } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { TeacherSummary } from "../../lib/types.ts";

type Created = { name: string; email: string; password: string };

export default function AdminTeachers() {
  const state = useLoad(() => api<{ teachers: TeacherSummary[] }>("/admin/teachers"), []);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Teachers" }} />
      <Button large label="+ Add a teacher" onPress={() => setAdding(true)} />
      {created && <TemporaryPasswordNotice name={created.name} email={created.email} password={created.password} />}
      <Loaded state={state}>
        {({ teachers }) => (
          <>
            {teachers.length === 0 && <Empty>No teachers yet.</Empty>}
            {teachers.map((t) => (
              <TeacherRow key={t.id} teacher={t} onChanged={state.reload} />
            ))}
          </>
        )}
      </Loaded>
      {adding && (
        <AddTeacherSheet
          onClose={() => setAdding(false)}
          onCreated={(c) => {
            setAdding(false);
            setCreated(c);
            void state.reload();
          }}
        />
      )}
    </Screen>
  );
}

function TeacherRow({ teacher: t, onChanged }: { teacher: TeacherSummary; onChanged: () => void }) {
  const { busy, error, run } = useAction();
  async function setActive(isActive: boolean) {
    if (await run(() => api(`/admin/users/${t.userId}/status`, { method: "PATCH", body: { isActive } }))) onChanged();
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.isActive ? colors.navy : colors.line2, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.bodyBold, color: colors.white, fontSize: 13 }}>{initials(t.fullName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text }}>{t.fullName}</Text>
          <Muted small>
            {t.email} · {t.activeClassGroups} active group{t.activeClassGroups === 1 ? "" : "s"}
            {t.isActive ? "" : " · disabled"}
          </Muted>
        </View>
      </View>
      <ErrorText error={error} />
      <View style={styles.row}>
        <ResetPasswordButton userId={t.userId} name={t.fullName} email={t.email} />
        <Button small variant={t.isActive ? "danger" : "outline"} label={t.isActive ? "Disable" : "Enable"} onPress={() => setActive(!t.isActive)} disabled={busy} />
      </View>
    </Card>
  );
}

function AddTeacherSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Created) => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", whatsappNumber: "" });
  const { busy, error, run } = useAction();
  async function save() {
    const result = await run(() =>
      api<{ teacher: TeacherSummary; temporaryPassword: string }>("/admin/teachers", {
        body: { fullName: form.fullName.trim(), email: form.email.trim(), whatsappNumber: form.whatsappNumber.trim() || undefined },
      }),
    );
    if (result) onCreated({ name: result.teacher.fullName, email: result.teacher.email, password: result.temporaryPassword });
  }
  return (
    <Sheet visible title="Add a teacher" onClose={onClose}>
      <Muted small>The app makes a temporary password for them — you'll see it once, to send them privately.</Muted>
      <Field label="Full name" placeholder="Ustadha Maryam" value={form.fullName} onChangeText={(v) => setForm({ ...form, fullName: v })} />
      <Field label="Email" placeholder="teacher@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />
      <Field label="WhatsApp number (optional)" placeholder="+923001234567" keyboardType="phone-pad" value={form.whatsappNumber} onChangeText={(v) => setForm({ ...form, whatsappNumber: v })} />
      <ErrorText error={error} />
      <Button large label={busy ? "Creating…" : "Create teacher account"} onPress={save} disabled={busy} />
    </Sheet>
  );
}
