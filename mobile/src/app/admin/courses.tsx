// Admin → Courses: every course (published or draft), add a new one, edit,
// and publish/unpublish. Courses are never deleted — unpublishing hides a course
// from the catalog while keeping its students' history.
import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Screen, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatPkr } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AdminCourse } from "../../lib/types.ts";

export default function AdminCourses() {
  const state = useLoad(() => api<{ courses: AdminCourse[] }>("/admin/courses"), []);
  // null = closed, "new" = adding, a course = editing it
  const [editing, setEditing] = useState<AdminCourse | "new" | null>(null);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Courses" }} />
      <Button large label="+ Add a course" onPress={() => setEditing("new")} />
      <Loaded state={state}>
        {({ courses }) => (
          <>
            {courses.length === 0 && <Empty>No courses yet. Add the first one above.</Empty>}
            {courses.map((c) => (
              <CourseRow key={c.id} course={c} onEdit={() => setEditing(c)} onChanged={state.reload} />
            ))}
          </>
        )}
      </Loaded>
      {editing && (
        <CourseSheet
          course={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void state.reload();
          }}
        />
      )}
    </Screen>
  );
}

function CourseRow({ course: c, onEdit, onChanged }: { course: AdminCourse; onEdit: () => void; onChanged: () => void }) {
  const { busy, error, run } = useAction();
  async function togglePublished() {
    if (await run(() => api(`/admin/courses/${c.id}`, { method: "PATCH", body: { isPublished: !c.isPublished } }))) onChanged();
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{c.title}</Text>
          <Muted small>{[formatPkr(c.feePkr), c.level, c.durationWeeks ? `${c.durationWeeks} weeks` : null].filter(Boolean).join(" · ")}</Muted>
        </View>
        <Text style={[s.pill, c.isPublished ? s.pillLive : s.pillDraft]}>{c.isPublished ? "Published" : "Draft"}</Text>
      </View>
      <Muted small>{c.description}</Muted>
      <ErrorText error={error} />
      <View style={styles.row}>
        <Button small variant="outline" label="Edit" onPress={onEdit} disabled={busy} />
        <Button small variant={c.isPublished ? "danger" : "primary"} label={c.isPublished ? "Unpublish" : "Publish"} onPress={togglePublished} disabled={busy} />
      </View>
    </Card>
  );
}

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value.trim()));

function CourseSheet({ course, onClose, onSaved }: { course: AdminCourse | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: course?.title ?? "",
    description: course?.description ?? "",
    level: course?.level ?? "",
    durationWeeks: course?.durationWeeks ? String(course.durationWeeks) : "",
    feePkr: course ? String(course.feePkr) : "",
    publish: course?.isPublished ?? true,
  });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const { busy, error, setError, run } = useAction();

  async function save() {
    const fee = toNumber(form.feePkr);
    const weeks = toNumber(form.durationWeeks);
    if (fee === null || !Number.isInteger(fee) || fee < 0) return setError("Enter the fee in whole rupees (0 for a free course).");
    if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1)) return setError("Duration must be a whole number of weeks.");
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      level: form.level.trim() || null,
      durationWeeks: weeks,
      feePkr: fee,
      isPublished: form.publish,
    };
    const done = await run(() => (course ? api(`/admin/courses/${course.id}`, { method: "PATCH", body }) : api("/admin/courses", { body })));
    if (done) onSaved();
  }

  return (
    <Sheet visible title={course ? "Edit course" : "Add a course"} onClose={onClose}>
      <Field label="Course title" placeholder="e.g. Weekend Tajweed Circle" value={form.title} onChangeText={set("title")} />
      <Field label="Description" placeholder="What students will learn" multiline value={form.description} onChangeText={set("description")} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Fee (PKR, 0 = free)" placeholder="2000" keyboardType="number-pad" value={form.feePkr} onChangeText={set("feePkr")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Weeks (optional)" placeholder="12" keyboardType="number-pad" value={form.durationWeeks} onChangeText={set("durationWeeks")} />
        </View>
      </View>
      <Field label="Level / category (optional)" placeholder="Beginner" value={form.level} onChangeText={set("level")} />
      <Chip label="Show in the catalog (published)" selected={form.publish} onPress={() => setForm({ ...form, publish: !form.publish })} />
      <ErrorText error={error} />
      <Button large label={busy ? "Saving…" : course ? "Save changes" : "Add course"} onPress={save} disabled={busy} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  pill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 10 },
  pillLive: { backgroundColor: colors.okBg, color: colors.navy },
  pillDraft: { backgroundColor: colors.warnBg, color: colors.goldDark },
});
