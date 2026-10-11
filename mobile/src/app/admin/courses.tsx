// Admin → Courses: every course (published or draft), add a new one, edit,
// and publish/unpublish. Courses are never deleted — unpublishing hides a course
// from the catalog while keeping its students' history.
// Editing a course also manages its certificate template (a background image the
// app writes each student's details on), with a preview before saving.
import { Stack } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CertificateCard, TEXT_AREAS_HELP, type CertificateLook } from "../../components/CertificateCard.tsx";
import { Sheet } from "../../components/Sheet.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Loaded, Muted, Notice, Screen, SectionTitle, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { certificateImageForm, pickCertificateImage, SIZE_RULES, type PickedImage } from "../../lib/certificateImage.ts";
import { confirm } from "../../lib/confirm.ts";
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
          onTemplateChanged={state.reload}
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

function CourseSheet({ course, onClose, onSaved, onTemplateChanged }: { course: AdminCourse | null; onClose: () => void; onSaved: () => void; onTemplateChanged: () => void }) {
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

      <SectionTitle>Certificate template</SectionTitle>
      {course ? (
        <CertificateTemplate course={course} onChanged={onTemplateChanged} />
      ) : (
        <Muted small>Add the course first, then open it again to give its certificates a template.</Muted>
      )}
    </Sheet>
  );
}

// The course's certificate template: a background image the app writes each
// student's name, the course, the date and the certificate number on. Changes are
// saved straight away (separately from "Save changes" above).
function CertificateTemplate({ course, onChanged }: { course: AdminCourse; onChanged: () => void }) {
  const [templateUrl, setTemplateUrl] = useState(course.certificateTemplateUrl);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const { busy, error, run } = useAction();
  const path = `/admin/courses/${course.id}/certificate-template`;
  const sample = {
    studentName: "Student Name",
    courseTitle: course.title,
    certificateNumber: `STJ-${new Date().getFullYear()}-00001-SMPL`,
    issuedAt: new Date().toISOString(),
  };
  const current: CertificateLook = templateUrl ? { kind: "TEMPLATE", path: templateUrl } : { kind: "DEFAULT" };

  const choose = () =>
    run(async () => {
      const image = await pickCertificateImage();
      if (image) setPicked(image);
    });
  const save = async () => {
    const result = await run(async () =>
      api<{ certificateTemplateUrl: string }>(path, { method: "PUT", form: await certificateImageForm(picked!) }),
    );
    if (result) {
      setTemplateUrl(result.certificateTemplateUrl);
      setPicked(null);
      onChanged();
    }
  };
  const remove = () =>
    confirm(
      "Remove the certificate template?",
      "New certificates for this course will use the app's built-in design. Certificates already issued keep the design they were issued with.",
      "Remove",
      async () => {
        if (await run(() => api(path, { method: "DELETE" }))) {
          setTemplateUrl(null);
          onChanged();
        }
      },
    );

  if (picked) {
    return (
      <>
        <Notice>Preview with sample details. Check that nothing overlaps your design, then save.</Notice>
        <CertificateCard certificate={sample} look={{ kind: "TEMPLATE", uri: picked.uri }} />
        <ErrorText error={error} />
        <View style={styles.row}>
          <Button small label={busy ? "Saving…" : "Save template"} onPress={save} disabled={busy} />
          <Button small variant="outline" label="Choose another" onPress={choose} disabled={busy} />
          <Button small variant="outline" label="Cancel" onPress={() => setPicked(null)} disabled={busy} />
        </View>
      </>
    );
  }

  return (
    <>
      <Muted small>{templateUrl ? "Certificates for this course are drawn on this template (sample details):" : "No template — certificates use the app's built-in design (sample details):"}</Muted>
      <CertificateCard certificate={sample} look={current} />
      <Muted small>Size: {SIZE_RULES}. {TEXT_AREAS_HELP}</Muted>
      <Muted small>Changing or removing the template only affects certificates issued from now on — certificates already issued keep the design they were issued with.</Muted>
      <ErrorText error={error} />
      <View style={styles.row}>
        <Button small variant="outline" label={templateUrl ? "Replace template" : "Upload template"} onPress={choose} disabled={busy} />
        {templateUrl && <Button small variant="danger" label="Remove template" onPress={remove} disabled={busy} />}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  pill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontFamily: fonts.bodyBold, fontSize: 10 },
  pillLive: { backgroundColor: colors.okBg, color: colors.navy },
  pillDraft: { backgroundColor: colors.warnBg, color: colors.goldDark },
});
