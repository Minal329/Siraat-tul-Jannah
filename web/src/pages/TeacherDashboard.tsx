// Teacher Dashboard (prototype screen 4): pick a group, schedule classes,
// mark attendance, and send each student written or voice feedback.
import { useState, type FormEvent } from "react";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded } from "../components/ui.tsx";
import { VoiceRecorder } from "../components/VoiceRecorder.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/useAuth.ts";
import { formatDateTime, formatTime, greetingName, initials, localInputToIso } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import type { AttendanceStatus, LivePlatform, RosterStudent, Session, TeacherGroup } from "../lib/types.ts";

export function TeacherDashboardPage() {
  const { user } = useAuth();
  const groups = useLoad(() => api<{ classGroups: TeacherGroup[] }>("/teacher/class-groups"), []);
  const [chosenGroupId, setGroupId] = useState<string | null>(null);
  const groupId = chosenGroupId ?? groups.data?.classGroups[0]?.id ?? null;

  return (
    <Layout
      subtitle="Teacher Dashboard"
      greeting={{ title: `Assalamu Alaikum, ${greetingName(user?.profile?.fullName) || "Admin"}`, text: "Mark attendance and review today's class" }}
    >
      <Loaded state={groups}>
        {({ classGroups }) =>
          classGroups.length === 0 ? (
            <Empty>You don't have any active class groups yet. The academy assigns groups to teachers.</Empty>
          ) : (
            <>
              <div className="chips" role="group" aria-label="Choose a class group">
                {classGroups.map((g) => (
                  <button key={g.id} className="chip" aria-pressed={g.id === groupId} onClick={() => setGroupId(g.id)}>
                    {g.name}
                  </button>
                ))}
              </div>
              {groupId && <GroupPanel key={groupId} groupId={groupId} />}
            </>
          )
        }
      </Loaded>
    </Layout>
  );
}

type GroupDetails = { classGroup: TeacherGroup & { students: RosterStudent[]; whatsappGroupLink: string | null; zoomMeetingId: string | null } };

function GroupPanel({ groupId }: { groupId: string }) {
  const state = useLoad(
    async () => {
      const [details, { sessions }] = await Promise.all([
        api<GroupDetails>(`/teacher/class-groups/${groupId}`),
        api<{ sessions: (Session & { attendanceMarked: number })[] }>(`/teacher/class-groups/${groupId}/sessions`),
      ]);
      return { group: details.classGroup, sessions, now: Date.now() };
    },
    [groupId],
  );
  const [sessionId, setSessionId] = useState<string | null>(null);

  return (
    <Loaded state={state}>
      {({ group, sessions, now }) => {
        const hasStarted = (s: Session) => s.status === "LIVE" || new Date(s.scheduledAt).getTime() <= now;
        const started = sessions.filter((s) => s.status !== "CANCELLED" && hasStarted(s));
        const upcoming = sessions.filter((s) => s.status === "SCHEDULED" && !hasStarted(s)).reverse();
        // The class to start: live now, or scheduled within the hour (or started in the last 4 hours).
        const liveSession = sessions.find((s) => s.status === "LIVE");
        const startable = sessions
          .filter((s) => s.status === "SCHEDULED")
          .filter((s) => {
            const t = new Date(s.scheduledAt).getTime();
            return t - now <= 60 * 60 * 1000 && now - t <= 4 * 60 * 60 * 1000;
          })
          .at(-1);
        const selected = sessionId ?? started[0]?.id ?? null;
        return (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
            <div className="stack">
              <div className="card">
                <div className="row-between">
                  <h2 className="card-title">{group.course.title}</h2>
                  <span className="muted">{group.students.length} students</span>
                </div>
                <div className="muted">{group.scheduleText ?? "No regular schedule set"}</div>
                {upcoming.length > 0 && (
                  <div className="small muted">
                    Upcoming: {upcoming.slice(0, 3).map((s) => `${formatDateTime(s.scheduledAt)}${s.topic ? ` (${s.topic})` : ""}`).join(" · ")}
                  </div>
                )}
              </div>
              <LiveControls key={(liveSession ?? startable)?.id ?? "none"} session={liveSession ?? startable ?? null} onChanged={state.reload} />
              <ScheduleForm groupId={group.id} onScheduled={state.reload} />
            </div>

            <div className="stack">
              <div className="stack" style={{ gap: 8 }}>
                <h2 className="section-title">Attendance</h2>
                {started.length > 0 && (
                  <select className="input" style={{ minHeight: 36 }} aria-label="Choose class" value={selected ?? ""} onChange={(e) => setSessionId(e.target.value)}>
                    {started.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDateTime(s.scheduledAt)}{s.topic ? ` — ${s.topic}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selected ? (
                <AttendancePanel key={selected} sessionId={selected} students={group.students} />
              ) : (
                <Empty>No class has started yet. Schedule one, then mark attendance once it begins.</Empty>
              )}
            </div>
          </div>
        );
      }}
    </Loaded>
  );
}

function ScheduleForm({ groupId, onScheduled }: { groupId: string; onScheduled: () => void }) {
  const [when, setWhen] = useState("");
  const [topic, setTopic] = useState("");
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const done = await run(() =>
      api(`/teacher/class-groups/${groupId}/sessions`, { body: { scheduledAt: localInputToIso(when), topic: topic.trim() || undefined } }),
    );
    if (done) {
      setWhen("");
      setTopic("");
      onScheduled();
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">Schedule a class</h3>
      <div className="field">
        <label htmlFor="when">Date and time</label>
        <input id="when" className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="topic">Topic (optional)</label>
        <input id="topic" className="input" placeholder="e.g. Lesson 6 — Sukoon" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <ErrorMessage error={error} />
      <button className="btn" disabled={busy}>{busy ? "Saving…" : "Schedule"}</button>
    </form>
  );
}

const MARKS: [AttendanceStatus, string][] = [
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["ABSENT", "Absent"],
  ["EXCUSED", "Excused"],
];

// Start the class (students see "Your class is live"), switch to WhatsApp if Zoom
// fails, and end it when finished.
function LiveControls({ session, onChanged }: { session: Session | null; onChanged: () => void }) {
  const [note, setNote] = useState(session?.liveNote ?? "");
  const { busy, error, run } = useAction();

  if (!session) {
    return (
      <div className="card">
        <h3 className="card-title">Live class</h3>
        <div className="muted small">You can start a class up to an hour before its scheduled time. Schedule one below.</div>
      </div>
    );
  }

  const act = async (path: string, body?: unknown, method: "POST" | "PATCH" = "POST") => {
    const done = await run(() => api(`/teacher/sessions/${session.id}/${path}`, { method, body: body ?? {} }));
    if (done) onChanged();
  };
  const other: LivePlatform = session.livePlatform === "WHATSAPP" ? "ZOOM" : "WHATSAPP";

  return (
    <div className={`card ${session.status === "LIVE" ? "live-banner" : ""}`}>
      <h3 className="card-title">
        {session.status === "LIVE" && <span className="live-dot" aria-hidden />}
        {session.status === "LIVE" ? "Class is live" : "Ready to start"}
      </h3>
      <div className="muted">
        {session.topic ?? "Class"} · {formatDateTime(session.scheduledAt)}
        {session.status === "LIVE" && session.startedAt && ` · live since ${formatTime(session.startedAt)} on ${session.livePlatform === "WHATSAPP" ? "WhatsApp" : "Zoom"}`}
      </div>
      {session.status === "LIVE" ? (
        <>
          <div className="field">
            <label htmlFor="live-note">Note for students (optional)</label>
            <input id="live-note" className="input" placeholder="e.g. Zoom is down — join the WhatsApp call" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-small btn-outline" disabled={busy} onClick={() => act("live", { note: note.trim() || null }, "PATCH")}>Save note</button>
            <button className="btn btn-small btn-outline" disabled={busy} onClick={() => act("live", { platform: other, note: note.trim() || null }, "PATCH")}>
              Switch to {other === "WHATSAPP" ? "WhatsApp" : "Zoom"}
            </button>
            <button className="btn btn-small btn-danger" disabled={busy} onClick={() => act("end")}>End class</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => act("start", { platform: "ZOOM" })}>Start class on Zoom</button>
          <button className="btn btn-outline" disabled={busy} onClick={() => act("start", { platform: "WHATSAPP" })}>Start on WhatsApp</button>
        </div>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}

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
    <div className="list">
      {students.length === 0 && <Empty>No students in this group yet.</Empty>}
      {students.map((s) => (
        <div key={s.studentId} className="list-item">
          <div className="row">
            <span className="avatar">{initials(s.fullName)}</span>
            <strong>{s.fullName}</strong>
            {joined[s.studentId] && <span className="pill pill-ok small">Joined {formatTime(joined[s.studentId])}</span>}
          </div>
          <div className="row" role="group" aria-label={`Attendance for ${s.fullName}`}>
            {MARKS.map(([status, label]) => (
              <button
                key={status}
                className="chip"
                aria-pressed={marks[s.studentId] === status}
                onClick={() => {
                  setMarks({ ...marks, [s.studentId]: status });
                  setSaved(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <FeedbackBox student={s} />
        </div>
      ))}
      <ErrorMessage error={error} />
      {students.some((s) => joined[s.studentId] && !marks[s.studentId]) && (
        <button
          className="btn btn-outline"
          onClick={() => {
            const fromJoins = Object.fromEntries(students.filter((s) => joined[s.studentId] && !marks[s.studentId]).map((s) => [s.studentId, "PRESENT" as const]));
            setMarks({ ...marks, ...fromJoins });
            setSaved(false);
          }}
        >
          Mark everyone who joined as Present
        </button>
      )}
      {students.length > 0 && (
        <button className="btn" onClick={save} disabled={busy || Object.keys(marks).length === 0}>
          {busy ? "Saving…" : saved ? "Attendance saved ✓" : "Save attendance"}
        </button>
      )}
    </div>
  );
}

function FeedbackBox({ student }: { student: RosterStudent }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function sendText(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const done = await run(() => api("/teacher/feedback", { body: { enrollmentId: student.enrollmentId, text: text.trim() } }));
    if (done) {
      setText("");
      setSent("Feedback sent ✓");
    }
  }

  async function sendVoice(file: File, seconds: number) {
    const form = new FormData();
    form.set("enrollmentId", student.enrollmentId);
    form.set("durationSeconds", String(seconds));
    form.set("voice", file);
    const done = await run(() => api("/teacher/feedback", { form }));
    if (done) setSent("Voice note sent ✓");
  }

  return (
    <form className="row" onSubmit={sendText}>
      <input
        className="input"
        style={{ flex: 1, minWidth: 180 }}
        aria-label={`Feedback for ${student.fullName}`}
        placeholder="Write feedback on today's recitation…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSent(null);
        }}
      />
      <button className="btn btn-small" disabled={busy || !text.trim()}>Send</button>
      <VoiceRecorder onRecorded={sendVoice} disabled={busy} />
      {sent && <span className="muted small" role="status">{sent}</span>}
      {error && <span className="small" style={{ color: "var(--danger)" }} role="alert">{error}</span>}
    </form>
  );
}
