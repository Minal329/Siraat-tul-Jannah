// Admin → Class groups (batches): one teacher teaching one course on a schedule.
// Add and edit groups — teacher, schedule, dates, capacity, Zoom and WhatsApp —
// and close a finished batch (groups are deactivated, never deleted).
import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Screen, SectionTitle, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AdminClassGroup, AdminCourse, TeacherSummary } from "../../lib/types.ts";

type Data = { groups: AdminClassGroup[]; courses: AdminCourse[]; teachers: TeacherSummary[]; zoomConfigured: boolean };

export default function AdminGroups() {
  const state = useLoad(async (): Promise<Data> => {
    const [{ classGroups }, { courses }, { teachers }, { zoomConfigured }] = await Promise.all([
      api<{ classGroups: AdminClassGroup[] }>("/admin/class-groups"),
      api<{ courses: AdminCourse[] }>("/admin/courses"),
      api<{ teachers: TeacherSummary[] }>("/admin/teachers"),
      api<{ zoomConfigured: boolean }>("/admin/class-groups/zoom-status"),
    ]);
    return { groups: classGroups, courses, teachers, zoomConfigured };
  }, []);
  const [editing, setEditing] = useState<AdminClassGroup | "new" | null>(null);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Class Groups" }} />
      <Loaded state={state}>
        {(data) => {
          const active = data.groups.filter((g) => g.isActive);
          const closed = data.groups.filter((g) => !g.isActive);
          return (
            <>
              <Button large label="+ Add a class group" onPress={() => setEditing("new")} disabled={data.courses.length === 0} />
              {data.courses.length === 0 && <Muted small>Add a course first — every group belongs to a course.</Muted>}
              {data.groups.length === 0 && <Empty>No class groups yet.</Empty>}
              {active.map((g) => (
                <GroupRow key={g.id} group={g} zoomConfigured={data.zoomConfigured} onEdit={() => setEditing(g)} onChanged={state.reload} />
              ))}
              {closed.length > 0 && <SectionTitle>Closed batches</SectionTitle>}
              {closed.map((g) => (
                <GroupRow key={g.id} group={g} zoomConfigured={false} onEdit={() => setEditing(g)} onChanged={state.reload} />
              ))}
              {editing && (
                <GroupSheet
                  group={editing === "new" ? null : editing}
                  courses={data.courses}
                  teachers={data.teachers.filter((t) => t.isActive)}
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    void state.reload();
                  }}
                />
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function GroupRow({ group: g, zoomConfigured, onEdit, onChanged }: { group: AdminClassGroup; zoomConfigured: boolean; onEdit: () => void; onChanged: () => void }) {
  const { busy, error, run } = useAction();
  const createZoom = async () => {
    if (await run(() => api(`/admin/class-groups/${g.id}/zoom-meeting`, { method: "POST" }))) onChanged();
  };
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{g.name}</Text>
          <Muted small>{g.course.title} · {g.teacher?.fullName ?? "No teacher yet"}</Muted>
        </View>
        <Text style={[s.pill, g.isActive ? s.pillActive : s.pillClosed]}>
          {g.studentCount}
          {g.maxStudents ? `/${g.maxStudents}` : ""} students{g.isActive ? "" : " · closed"}
        </Text>
      </View>
      <Muted small>{g.scheduleText ?? "No schedule set"}</Muted>
      <Muted small>
        Zoom: {g.zoomMeetingId ?? "—"} · WhatsApp: {g.whatsappGroupLink ? "linked" : "—"}
      </Muted>
      <ErrorText error={error} />
      <View style={styles.row}>
        <Button small variant="outline" label="Edit" onPress={onEdit} disabled={busy} />
        {zoomConfigured && <Button small variant="outline" label={busy ? "Creating…" : g.zoomMeetingId ? "New Zoom meeting" : "Create Zoom meeting"} onPress={createZoom} disabled={busy} />}
      </View>
    </Card>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const orNull = (value: string) => value.trim() || null;

function GroupSheet({ group, courses, teachers, onClose, onSaved }: {
  group: AdminClassGroup | null;
  courses: AdminCourse[];
  teachers: TeacherSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    courseId: group?.course.id ?? courses[0]?.id ?? "",
    teacherId: group?.teacher?.id ?? null as string | null,
    name: group?.name ?? "",
    scheduleText: group?.scheduleText ?? "",
    startDate: dateOnly(group?.startDate ?? null),
    endDate: dateOnly(group?.endDate ?? null),
    maxStudents: group?.maxStudents ? String(group.maxStudents) : "",
    zoomMeetingId: group?.zoomMeetingId ?? "",
    zoomPasscode: group?.zoomPasscode ?? "",
    whatsappGroupLink: group?.whatsappGroupLink ?? "",
    isActive: group?.isActive ?? true,
  });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const { busy, error, setError, run } = useAction();

  async function save() {
    for (const [label, value] of [["Start date", form.startDate], ["End date", form.endDate]] as const) {
      if (value.trim() && !DATE.test(value.trim())) return setError(`${label}: use the format YYYY-MM-DD, e.g. 2027-01-15.`);
    }
    const max = form.maxStudents.trim() ? Number(form.maxStudents.trim()) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) return setError("Max students must be a whole number.");
    const fields = {
      teacherId: form.teacherId,
      name: form.name.trim(),
      scheduleText: orNull(form.scheduleText),
      startDate: orNull(form.startDate),
      endDate: orNull(form.endDate),
      maxStudents: max,
      zoomMeetingId: orNull(form.zoomMeetingId),
      zoomPasscode: orNull(form.zoomPasscode),
      whatsappGroupLink: orNull(form.whatsappGroupLink),
    };
    // Only changed Zoom details are sent on edit, so a link made by the Zoom API isn't wiped.
    const zoomChanged = !group || fields.zoomMeetingId !== group.zoomMeetingId || fields.zoomPasscode !== group.zoomPasscode;
    const done = await run(() =>
      group
        ? api(`/admin/class-groups/${group.id}`, {
            method: "PATCH",
            body: {
              ...fields,
              ...(zoomChanged ? {} : { zoomMeetingId: undefined, zoomPasscode: undefined }),
              isActive: form.isActive,
            },
          })
        : api("/admin/class-groups", { body: { courseId: form.courseId, ...fields } }),
    );
    if (done) onSaved();
  }

  return (
    <Sheet visible title={group ? "Edit class group" : "Add a class group"} onClose={onClose}>
      {!group && (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Course</Text>
          <View style={styles.row}>
            {courses.map((c) => (
              <Chip key={c.id} label={c.title} selected={form.courseId === c.id} onPress={() => setForm({ ...form, courseId: c.id })} />
            ))}
          </View>
        </View>
      )}
      <Field label="Group name" placeholder="Tajweed — Batch 3 — Evening" value={form.name} onChangeText={set("name")} />
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Teacher</Text>
        <View style={styles.row}>
          <Chip label="Assign later" selected={form.teacherId === null} onPress={() => setForm({ ...form, teacherId: null })} />
          {teachers.map((t) => (
            <Chip key={t.id} label={t.fullName} selected={form.teacherId === t.id} onPress={() => setForm({ ...form, teacherId: t.id })} />
          ))}
        </View>
      </View>
      <Field label="Schedule (optional)" placeholder="Mon/Wed/Fri 8–9 pm PKT" value={form.scheduleText} onChangeText={set("scheduleText")} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Starts (YYYY-MM-DD)" placeholder="2027-01-15" value={form.startDate} onChangeText={set("startDate")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ends (YYYY-MM-DD)" placeholder="2027-04-15" value={form.endDate} onChangeText={set("endDate")} />
        </View>
      </View>
      <Field label="Max students (optional)" placeholder="10" keyboardType="number-pad" value={form.maxStudents} onChangeText={set("maxStudents")} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Zoom meeting ID" placeholder="123 456 7890" value={form.zoomMeetingId} onChangeText={set("zoomMeetingId")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Zoom passcode" value={form.zoomPasscode} onChangeText={set("zoomPasscode")} />
        </View>
      </View>
      <Field
        label="WhatsApp group invite link"
        placeholder="https://chat.whatsapp.com/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={form.whatsappGroupLink}
        onChangeText={set("whatsappGroupLink")}
      />
      {group && (
        <Chip label="Batch is running (uncheck to close it)" selected={form.isActive} onPress={() => setForm({ ...form, isActive: !form.isActive })} />
      )}
      <ErrorText error={error} />
      <Button large label={busy ? "Saving…" : group ? "Save changes" : "Create group"} onPress={save} disabled={busy} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  pill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 10 },
  pillActive: { backgroundColor: colors.okBg, color: colors.navy },
  pillClosed: { backgroundColor: colors.ivory2, color: colors.muted },
});
