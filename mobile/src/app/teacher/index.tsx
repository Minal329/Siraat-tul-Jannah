// Teacher Dashboard (prototype screen 4): pick a group, schedule classes,
// mark attendance, and send each student written or voice feedback.
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { AccountButton } from "../../components/AccountMenu.tsx";
import { Button, Card, Chip, Empty, ErrorText, Field, Greeting, Loaded, Muted, Screen, SectionTitle, Title, styles } from "../../components/ui.tsx";
import { VoiceRecorder } from "../../components/VoiceRecorder.tsx";
import { api } from "../../lib/api.ts";
import { formatDateTime, formatTime, greetingName, parseLocalDateTime } from "../../lib/format.ts";
import { useAction, useLoad } from "../../lib/hooks.ts";
import { colors, fonts } from "../../lib/theme.ts";
import type { AttendanceStatus, LivePlatform, RosterStudent, Session, TeacherGroup } from "../../lib/types.ts";
import { useAuth } from "../../lib/useAuth.ts";

export default function TeacherHome() {
  const { user } = useAuth();
  const groups = useLoad(() => api<{ classGroups: TeacherGroup[] }>("/teacher/class-groups"), []);
  const [chosenGroupId, setGroupId] = useState<string | null>(null);
  const groupId = chosenGroupId ?? groups.data?.classGroups[0]?.id ?? null;

  return (
    <Screen onRefresh={groups.reload} refreshing={groups.loading && !!groups.data}>
      <Stack.Screen options={{ title: "Teacher Dashboard", headerRight: () => <AccountButton /> }} />
      <Greeting title={`Assalamu Alaikum, ${greetingName(user?.profile?.fullName)}`} text="Mark attendance and review today's class" />
      <Button small variant="outline" label="Recorded lectures" onPress={() => router.push("/teacher/lectures")} />
      <Loaded state={groups}>
        {({ classGroups }) =>
          classGroups.length === 0 ? (
            <Empty>You don't have any active class groups yet. The academy assigns groups to teachers.</Empty>
          ) : (
            <>
              <View style={styles.row}>
                {classGroups.map((g) => <Chip key={g.id} label={g.name} selected={g.id === groupId} onPress={() => setGroupId(g.id)} />)}
              </View>
              {groupId && <GroupPanel key={groupId} groupId={groupId} />}
            </>
          )
        }
      </Loaded>
    </Screen>
  );
}

type GroupDetails = { classGroup: TeacherGroup & { students: RosterStudent[] } };

function GroupPanel({ groupId }: { groupId: string }) {
  const state = useLoad(async () => {
    const [details, { sessions }] = await Promise.all([
      api<GroupDetails>(`/teacher/class-groups/${groupId}`),
      api<{ sessions: Session[] }>(`/teacher/class-groups/${groupId}/sessions`),
    ]);
    const now = Date.now();
    const hasStarted = (s: Session) => s.status === "LIVE" || new Date(s.scheduledAt).getTime() <= now;
    const notCancelled = sessions.filter((s) => s.status !== "CANCELLED");
    // The class to start: live now, or scheduled within the hour (or started in the last 4 hours).
    const startable = sessions
      .filter((s) => s.status === "SCHEDULED")
      .filter((s) => {
        const t = new Date(s.scheduledAt).getTime();
        return t - now <= 60 * 60 * 1000 && now - t <= 4 * 60 * 60 * 1000;
      })
      .at(-1);
    return {
      group: details.classGroup,
      started: notCancelled.filter(hasStarted),
      upcoming: sessions.filter((s) => s.status === "SCHEDULED" && !hasStarted(s)).reverse(),
      current: sessions.find((s) => s.status === "LIVE") ?? startable ?? null,
    };
  }, [groupId]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  return (
    <Loaded state={state}>
      {({ group, started, upcoming, current }) => {
        const selected = sessionId ?? started[0]?.id ?? null;
        return (
          <>
            <Card>
              <Title>{group.course.title}</Title>
              <Muted>{group.students.length} students · {group.scheduleText ?? "No regular schedule set"}</Muted>
              {upcoming.length > 0 && <Muted small>Upcoming: {upcoming.slice(0, 3).map((s) => `${formatDateTime(s.scheduledAt)}${s.topic ? ` (${s.topic})` : ""}`).join(" · ")}</Muted>}
            </Card>
            <LiveControls session={current} onChanged={state.reload} />
            <ScheduleForm groupId={group.id} onScheduled={state.reload} />

            <SectionTitle>Attendance</SectionTitle>
            {started.length > 0 && (
              <View style={styles.row}>
                {started.slice(0, 5).map((s) => <Chip key={s.id} label={formatDateTime(s.scheduledAt)} selected={s.id === selected} onPress={() => setSessionId(s.id)} />)}
              </View>
            )}
            {selected ? (
              <AttendancePanel key={selected} sessionId={selected} students={group.students} />
            ) : (
              <Empty>No class has started yet. Schedule one, then mark attendance once it begins.</Empty>
            )}
          </>
        );
      }}
    </Loaded>
  );
}

function ScheduleForm({ groupId, onScheduled }: { groupId: string; onScheduled: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [topic, setTopic] = useState("");
  const { busy, error, setError, run } = useAction();

  async function submit() {
    const when = parseLocalDateTime(date, time);
    if (!when) return setError("Enter the date as YYYY-MM-DD and the time as HH:MM (24-hour), e.g. 2026-10-05 and 17:30.");
    const done = await run(() => api(`/teacher/class-groups/${groupId}/sessions`, { body: { scheduledAt: when.toISOString(), topic: topic.trim() || undefined } }));
    if (done) {
      setDate("");
      setTime("");
      setTopic("");
      onScheduled();
    }
  }

  return (
    <Card>
      <Title>Schedule a class</Title>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Date" placeholder="2026-10-05" value={date} onChangeText={setDate} /></View>
        <View style={{ flex: 1 }}><Field label="Time" placeholder="17:30" value={time} onChangeText={setTime} /></View>
      </View>
      <Field label="Topic (optional)" placeholder="e.g. Lesson 6 — Sukoon" value={topic} onChangeText={setTopic} />
      <ErrorText error={error} />
      <Button label={busy ? "Saving…" : "Schedule"} onPress={submit} disabled={busy} />
    </Card>
  );
}

// Start the class (students see "Your class is live"), switch to WhatsApp if Zoom
// fails, and end it when finished.
// Kept as one component (no `key`) across classes: on the web build, replacing it by key
// right after its own "End class" button was pressed left the old card on screen.
function LiveControls({ session, onChanged }: { session: Session | null; onChanged: () => void }) {
  const [note, setNote] = useState(session?.liveNote ?? "");
  const [noteFor, setNoteFor] = useState(session?.id);
  if (session?.id !== noteFor) {
    // A different class: start from its own note.
    setNoteFor(session?.id);
    setNote(session?.liveNote ?? "");
  }
  const { busy, error, run } = useAction();

  if (!session) {
    return (
      <Card>
        <Title>Live class</Title>
        <Muted small>You can start a class up to an hour before its scheduled time. Schedule one below.</Muted>
      </Card>
    );
  }

  const act = async (path: string, body: unknown, method: "POST" | "PATCH" = "POST") => {
    const done = await run(() => api(`/teacher/sessions/${session.id}/${path}`, { method, body }));
    if (done) onChanged();
  };
  const isLive = session.status === "LIVE";
  const other: LivePlatform = session.livePlatform === "WHATSAPP" ? "ZOOM" : "WHATSAPP";

  return (
    <Card style={isLive ? { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.dangerBg } : undefined}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: isLive ? colors.danger : colors.navy }}>{isLive ? "● Class is live" : "Ready to start"}</Text>
      <Muted>
        {session.topic ?? "Class"} · {formatDateTime(session.scheduledAt)}
        {isLive && session.startedAt ? ` · since ${formatTime(session.startedAt)} on ${session.livePlatform === "WHATSAPP" ? "WhatsApp" : "Zoom"}` : ""}
      </Muted>
      {isLive ? (
        <>
          <Field label="Note for students (optional)" placeholder="e.g. Zoom is down — join the WhatsApp call" value={note} onChangeText={setNote} />
          <View style={styles.row}>
            <Button small variant="outline" label="Save note" disabled={busy} onPress={() => act("live", { note: note.trim() || null }, "PATCH")} />
            <Button
              small
              variant="outline"
              label={`Switch to ${other === "WHATSAPP" ? "WhatsApp" : "Zoom"}`}
              disabled={busy}
              onPress={() => act("live", { platform: other, note: note.trim() || null }, "PATCH")}
            />
            <Button small variant="danger" label="End class" disabled={busy} onPress={() => act("end", {})} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Button label="Start class on Zoom" disabled={busy} onPress={() => act("start", { platform: "ZOOM" })} />
          <Button variant="outline" label="Start on WhatsApp" disabled={busy} onPress={() => act("start", { platform: "WHATSAPP" })} />
        </View>
      )}
      <ErrorText error={error} />
    </Card>
  );
}

const MARKS: [AttendanceStatus, string][] = [
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["ABSENT", "Absent"],
  ["EXCUSED", "Excused"],
];

function AttendancePanel({ sessionId, students }: { sessionId: string; students: RosterStudent[] }) {
  const state = useLoad(
    () => api<{ students: { studentId: string; status: AttendanceStatus | null; joinedAt: string | null }[] }>(`/teacher/sessions/${sessionId}/attendance`),
    [sessionId],
  );
  return (
    <Loaded state={state}>
      {(data) => (
        <AttendanceForm
          sessionId={sessionId}
          students={students}
          initialMarks={Object.fromEntries(data.students.flatMap((s) => (s.status ? [[s.studentId, s.status]] : [])))}
          joined={Object.fromEntries(data.students.flatMap((s) => (s.joinedAt ? [[s.studentId, s.joinedAt]] : [])))}
        />
      )}
    </Loaded>
  );
}

function AttendanceForm({ sessionId, students, initialMarks, joined }: {
  sessionId: string;
  students: RosterStudent[];
  initialMarks: Record<string, AttendanceStatus>;
  joined: Record<string, string>;
}) {
  const [marks, setMarks] = useState(initialMarks);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  async function save() {
    const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
    if (records.length === 0) return;
    const done = await run(() => api(`/teacher/sessions/${sessionId}/attendance`, { method: "PUT", body: { records } }));
    if (done) setSaved(true);
  }

  return (
    <>
      {students.length === 0 && <Empty>No students in this group yet.</Empty>}
      {students.map((s) => (
        <Card key={s.studentId}>
          <Text style={{ fontFamily: fonts.bodyBold, color: colors.text }}>{s.fullName}</Text>
          {joined[s.studentId] && <Muted small>Joined at {formatTime(joined[s.studentId])}</Muted>}
          <View style={styles.row}>
            {MARKS.map(([status, label]) => (
              <Chip
                key={status}
                label={label}
                selected={marks[s.studentId] === status}
                onPress={() => {
                  setMarks({ ...marks, [s.studentId]: status });
                  setSaved(false);
                }}
              />
            ))}
          </View>
          <FeedbackBox student={s} />
        </Card>
      ))}
      <ErrorText error={error} />
      {students.some((s) => joined[s.studentId] && !marks[s.studentId]) && (
        <Button
          variant="outline"
          label="Mark everyone who joined as Present"
          onPress={() => {
            const fromJoins = Object.fromEntries(students.filter((s) => joined[s.studentId] && !marks[s.studentId]).map((s) => [s.studentId, "PRESENT" as const]));
            setMarks({ ...marks, ...fromJoins });
            setSaved(false);
          }}
        />
      )}
      {students.length > 0 && (
        <Button label={busy ? "Saving…" : saved ? "Attendance saved ✓" : "Save attendance"} onPress={save} disabled={busy || Object.keys(marks).length === 0} />
      )}
    </>
  );
}

function FeedbackBox({ student }: { student: RosterStudent }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function sendText() {
    if (!text.trim()) return;
    const done = await run(() => api("/teacher/feedback", { body: { enrollmentId: student.enrollmentId, text: text.trim() } }));
    if (done) {
      setText("");
      setSent("Feedback sent ✓");
    }
  }

  async function sendVoice(uri: string, seconds: number) {
    const form = new FormData();
    form.append("enrollmentId", student.enrollmentId);
    form.append("durationSeconds", String(seconds));
    if (Platform.OS === "web") {
      form.append("voice", await (await fetch(uri)).blob(), "voice-note.webm");
    } else {
      form.append("voice", { uri, name: "voice-note.m4a", type: "audio/mp4" } as unknown as Blob);
    }
    const done = await run(() => api("/teacher/feedback", { form }));
    if (done) setSent("Voice note sent ✓");
  }

  return (
    <View style={{ gap: 8 }}>
      <Field
        label={`Feedback for ${student.fullName}`}
        placeholder="Write feedback on today's recitation…"
        value={text}
        onChangeText={(value) => {
          setText(value);
          setSent(null);
        }}
      />
      <View style={styles.row}>
        <Button small label="Send" onPress={sendText} disabled={busy || !text.trim()} />
        <VoiceRecorder onRecorded={sendVoice} disabled={busy} />
      </View>
      {sent && <Muted small>{sent}</Muted>}
      <ErrorText error={error} />
    </View>
  );
}
