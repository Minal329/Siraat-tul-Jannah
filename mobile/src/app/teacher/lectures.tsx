// Teachers (and admins) → Recorded lectures: add a video link (YouTube unlisted,
// Vimeo…) for a course or one class group, and publish/unpublish it. Videos are
// never uploaded to our server — students watch them on the video service.
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Screen, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatDuration } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { Lecture, TeacherGroup } from "../../lib/types.ts";

export default function TeacherLectures() {
  const state = useLoad(async () => {
    const [{ lectures }, { classGroups }] = await Promise.all([
      api<{ lectures: Lecture[] }>("/teacher/lectures"),
      api<{ classGroups: TeacherGroup[] }>("/teacher/class-groups"),
    ]);
    return { lectures, groups: classGroups };
  }, []);
  const [adding, setAdding] = useState(false);

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Recorded Lectures" }} />
      <Loaded state={state}>
        {({ lectures, groups }) => (
          <>
            <Button large label="+ Add a recording" onPress={() => setAdding(true)} disabled={groups.length === 0} />
            {groups.length === 0 && <Muted small>You need a class group before adding recordings.</Muted>}
            {lectures.length === 0 && <Empty>No recordings yet.</Empty>}
            {lectures.map((l) => (
              <LectureRow key={l.id} lecture={l} onChanged={state.reload} />
            ))}
            {adding && (
              <AddLectureSheet
                groups={groups}
                onClose={() => setAdding(false)}
                onSaved={() => {
                  setAdding(false);
                  void state.reload();
                }}
              />
            )}
          </>
        )}
      </Loaded>
    </Screen>
  );
}

function LectureRow({ lecture: l, onChanged }: { lecture: Lecture; onChanged: () => void }) {
  const { busy, error, run } = useAction();
  const toggle = async () => {
    if (await run(() => api(`/teacher/lectures/${l.id}`, { method: "PATCH", body: { published: !l.published } }))) onChanged();
  };
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{l.title}</Text>
          <Muted small>
            {[l.course.title, l.classGroup ? l.classGroup.name : "All groups", formatDuration(l.durationSeconds)].filter(Boolean).join(" · ")}
          </Muted>
        </View>
        <Text style={[s.pill, l.published ? s.pillLive : s.pillDraft]}>{l.published ? "Published" : "Draft"}</Text>
      </View>
      <ErrorText error={error} />
      <View style={styles.row}>
        <Button small variant="outline" label="Watch" onPress={() => void WebBrowser.openBrowserAsync(l.videoUrl)} />
        <Button small variant={l.published ? "danger" : "primary"} label={l.published ? "Unpublish" : "Publish"} onPress={toggle} disabled={busy} />
      </View>
    </Card>
  );
}

function AddLectureSheet({ groups, onClose, onSaved }: { groups: TeacherGroup[]; onClose: () => void; onSaved: () => void }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [wholeCourse, setWholeCourse] = useState(true);
  const [form, setForm] = useState({ title: "", videoUrl: "", minutes: "", description: "" });
  const [publish, setPublish] = useState(true);
  const { busy, error, setError, run } = useAction();
  const group = groups.find((g) => g.id === groupId);

  async function save() {
    if (!group) return setError("Choose a class group.");
    const minutes = form.minutes.trim() ? Number(form.minutes.trim()) : null;
    if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) return setError("Length must be a number of minutes.");
    const done = await run(() =>
      api("/teacher/lectures", {
        body: {
          courseId: group.course.id,
          classGroupId: wholeCourse ? undefined : group.id,
          title: form.title.trim(),
          videoUrl: form.videoUrl.trim(),
          description: form.description.trim() || undefined,
          durationSeconds: minutes ? Math.round(minutes * 60) : undefined,
          published: publish,
        },
      }),
    );
    if (done) onSaved();
  }

  return (
    <Sheet visible title="Add a recording" onClose={onClose}>
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Class group</Text>
        <View style={styles.row}>
          {groups.map((g) => (
            <Chip key={g.id} label={g.name} selected={g.id === groupId} onPress={() => setGroupId(g.id)} />
          ))}
        </View>
        {group && (
          <Chip
            label={wholeCourse ? `For every ${group.course.title} group` : "Only for this group"}
            selected={wholeCourse}
            onPress={() => setWholeCourse(!wholeCourse)}
          />
        )}
      </View>
      <Field label="Title" placeholder="Lesson 5 — Tanween" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
      <Field
        label="Video link"
        placeholder="https://youtu.be/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={form.videoUrl}
        onChangeText={(v) => setForm({ ...form, videoUrl: v })}
      />
      <Muted small>Upload the video to YouTube as "Unlisted" (or Vimeo), then paste its link here.</Muted>
      <Field label="Length in minutes (optional)" placeholder="25" keyboardType="number-pad" value={form.minutes} onChangeText={(v) => setForm({ ...form, minutes: v })} />
      <Field label="Notes (optional)" multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} />
      <Chip label="Publish now (students can watch it)" selected={publish} onPress={() => setPublish(!publish)} />
      <ErrorText error={error} />
      <Button large label={busy ? "Saving…" : "Add recording"} onPress={save} disabled={busy} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text2 },
  pill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 10 },
  pillLive: { backgroundColor: colors.okBg, color: colors.navy },
  pillDraft: { backgroundColor: colors.warnBg, color: colors.goldDark },
});
