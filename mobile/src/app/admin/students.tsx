// Admin → Students: everyone studying now or finished. For a current student:
// move them to another group, or mark the course complete. For a finished one:
// issue the certificate and view/save/share it. Plus password resets.
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { Sheet } from "../../components/Sheet.tsx";
import { ResetPasswordButton } from "../../components/TemporaryPassword.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Screen, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatDate } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AdminClassGroup, AdminEnrollment } from "../../lib/types.ts";

type Tab = "APPROVED" | "COMPLETED";

// "Are you sure?" — a native dialog on phones, the browser's confirm in the web preview.
function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, onPress: onYes },
  ]);
}

export default function AdminStudents() {
  const [tab, setTab] = useState<Tab>("APPROVED");
  const [search, setSearch] = useState("");
  const state = useLoad(async () => {
    const [studying, finished, groups] = await Promise.all([
      api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=APPROVED"),
      api<{ enrollments: AdminEnrollment[] }>("/admin/enrollments?status=COMPLETED"),
      api<{ classGroups: AdminClassGroup[] }>("/admin/class-groups"),
    ]);
    return { APPROVED: studying.enrollments, COMPLETED: finished.enrollments, groups: groups.classGroups.filter((g) => g.isActive) };
  }, []);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Students" }} />
      <View style={styles.row}>
        <Chip label={`Studying${state.data ? ` (${state.data.APPROVED.length})` : ""}`} selected={tab === "APPROVED"} onPress={() => setTab("APPROVED")} />
        <Chip label={`Completed${state.data ? ` (${state.data.COMPLETED.length})` : ""}`} selected={tab === "COMPLETED"} onPress={() => setTab("COMPLETED")} />
      </View>
      <Field label="Search" placeholder="Name, email or course" value={search} onChangeText={setSearch} autoCapitalize="none" />
      <Loaded state={state}>
        {(data) => {
          const q = search.trim().toLowerCase();
          const shown = data[tab].filter((e) => !q || [e.student.fullName, e.student.email, e.course.title].some((v) => v.toLowerCase().includes(q)));
          return (
            <>
              {shown.length === 0 && <Empty>{q ? "Nobody matches your search." : tab === "APPROVED" ? "No students studying yet." : "No completed courses yet."}</Empty>}
              {shown.map((e) => (
                <StudentCard key={e.id} enrollment={e} groups={data.groups.filter((g) => g.course.id === e.course.id)} onChanged={state.reload} />
              ))}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function StudentCard({ enrollment: e, groups, onChanged }: { enrollment: AdminEnrollment; groups: AdminClassGroup[]; onChanged: () => void }) {
  const [moving, setMoving] = useState(false);
  const { busy, error, run } = useAction();
  const studying = e.status === "APPROVED";

  const complete = () =>
    confirm("Mark course complete?", `${e.student.fullName} has finished ${e.course.title}. You can then issue the certificate.`, "Mark complete", async () => {
      if (await run(() => api(`/admin/enrollments/${e.id}/complete`, { body: {} }))) onChanged();
    });
  const issue = async () => {
    if (await run(() => api("/admin/certificates", { body: { enrollmentId: e.id } }))) onChanged();
  };

  return (
    <Card>
      <View>
        <Text style={s.name}>{e.student.fullName}</Text>
        <Muted small>
          {e.course.title}
          {e.classGroup ? ` · ${e.classGroup.name}` : ""}
        </Muted>
        <Muted small>
          {e.student.email}
          {e.student.whatsappNumber ? ` · ${e.student.whatsappNumber}` : ""}
        </Muted>
        {e.certificate && <Muted small>Certificate {e.certificate.certificateNumber} · {formatDate(e.certificate.issuedAt)}</Muted>}
      </View>
      <ErrorText error={error} />
      <View style={styles.row}>
        {studying && <Button small label="Mark course complete" onPress={complete} disabled={busy} />}
        {studying && groups.length > 1 && <Button small variant="outline" label="Move group" onPress={() => setMoving(true)} disabled={busy} />}
        {!studying && !e.certificate && <Button small variant="gold" label={busy ? "Issuing…" : "Issue certificate"} onPress={issue} disabled={busy} />}
        {e.certificate && <Button small variant="gold" label="View certificate" onPress={() => router.push(`/admin/certificate/${e.id}`)} />}
        <ResetPasswordButton userId={e.student.userId} name={e.student.fullName} email={e.student.email} />
      </View>
      {moving && (
        <MoveSheet
          enrollment={e}
          groups={groups}
          onClose={() => setMoving(false)}
          onMoved={() => {
            setMoving(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function MoveSheet({ enrollment: e, groups, onClose, onMoved }: { enrollment: AdminEnrollment; groups: AdminClassGroup[]; onClose: () => void; onMoved: () => void }) {
  const others = groups.filter((g) => g.id !== e.classGroup?.id);
  const [groupId, setGroupId] = useState(others[0]?.id ?? null);
  const { busy, error, run } = useAction();
  const move = async () => {
    if (groupId && (await run(() => api(`/admin/enrollments/${e.id}/move`, { body: { classGroupId: groupId } })))) onMoved();
  };
  return (
    <Sheet visible title={`Move ${e.student.fullName}`} onClose={onClose}>
      <Muted small>From {e.classGroup?.name ?? "no group"} to:</Muted>
      <View style={styles.row}>
        {others.map((g) => (
          <Chip key={g.id} label={`${g.name} (${g.studentCount}${g.maxStudents ? `/${g.maxStudents}` : ""})`} selected={g.id === groupId} onPress={() => setGroupId(g.id)} />
        ))}
      </View>
      <ErrorText error={error} />
      <Button large label={busy ? "Moving…" : "Move student"} onPress={move} disabled={busy || !groupId} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
});
