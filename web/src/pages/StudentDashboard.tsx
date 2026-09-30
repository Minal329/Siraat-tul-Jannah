// Student Dashboard (prototype screen 3): my courses, attendance, latest feedback,
// next class, and what to do next for each course.
import { Link } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, Loaded, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/useAuth.ts";
import { formatDateTime, greetingName } from "../lib/format.ts";
import { useLoad } from "../lib/hooks.ts";
import type { AttendanceSummary, Enrollment, Feedback, Session } from "../lib/types.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string }; courseTitle: string };

export function StudentDashboardPage() {
  const { user } = useAuth();
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }, { feedback }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
      api<{ feedback: Feedback[] }>("/feedback/mine"),
    ]);
    const shown = enrollments.filter((e) => e.status !== "CANCELLED");
    const attendance = Object.fromEntries(
      await Promise.all(
        shown
          .filter((e) => e.classGroup)
          .map(async (e) => [e.id, (await api<{ summary: AttendanceSummary }>(`/enrollments/${e.id}/attendance`)).summary] as const),
      ),
    );
    return { enrollments: shown, sessions, feedback, attendance };
  }, []);

  return (
    <Layout
      subtitle="My Dashboard"
      greeting={{ title: `Assalamu Alaikum, ${greetingName(user?.profile?.fullName)}`, text: "Here is how your learning is going" }}
    >
      <Loaded state={state}>
        {({ enrollments, sessions, feedback, attendance }) => {
          const rates = Object.values(attendance).map((a) => a.attendanceRate).filter((r): r is number => r !== null);
          const average = rates.length ? Math.round(rates.reduce((sum, r) => sum + r, 0) / rates.length) : null;
          const certificates = enrollments.filter((e) => e.certificate).length;
          return (
            <>
              <div className="stats">
                <div className="stat"><div className="stat-value">{enrollments.length}</div><div className="stat-label">Enrolled</div></div>
                <div className="stat"><div className="stat-value">{average === null ? "—" : `${average}%`}</div><div className="stat-label">Attendance</div></div>
                <div className="stat"><div className="stat-value">{certificates}</div><div className="stat-label">Certificates</div></div>
              </div>

              <div className="row-between">
                <h2 className="section-title">My Courses</h2>
                <Link to="/courses" className="btn btn-outline btn-small">See other courses</Link>
              </div>
              {enrollments.length === 0 && (
                <Empty>
                  You haven't enrolled in a course yet. <Link to="/courses">Browse courses</Link>
                </Empty>
              )}
              <div className="grid">
                {enrollments.map((e) => (
                  <CourseCard
                    key={e.id}
                    enrollment={e}
                    summary={attendance[e.id]}
                    nextClass={sessions.find((s) => s.classGroup.id === e.classGroup?.id)}
                    latestFeedback={feedback.find((f) => f.enrollmentId === e.id)}
                  />
                ))}
              </div>
            </>
          );
        }}
      </Loaded>
    </Layout>
  );
}

function CourseCard({ enrollment: e, summary, nextClass, latestFeedback }: {
  enrollment: Enrollment;
  summary?: AttendanceSummary;
  nextClass?: ScheduleItem;
  latestFeedback?: Feedback;
}) {
  const payment = e.payments[0];
  const rate = summary?.attendanceRate;
  return (
    <article className="card">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <h3 className="card-title">{e.course.title}</h3>
          <div className="muted">{e.classGroup ? `${e.classGroup.teacherName ?? "Teacher to be assigned"} · ${e.classGroup.name}` : "Class group not assigned yet"}</div>
        </div>
        <StatusPill status={e.status} />
      </div>

      {summary && (
        <div>
          <div className="row-between small muted" style={{ marginBottom: 4 }}>
            <span>Attendance</span>
            <strong style={{ color: "var(--text)" }}>{rate === null || rate === undefined ? "No classes yet" : `${rate}%`}</strong>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={rate ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Attendance">
            <div style={{ width: `${rate ?? 0}%` }} />
          </div>
        </div>
      )}

      {latestFeedback && (
        <div className="quote">
          {latestFeedback.text ?? "Voice note from your teacher"}
          <div className="small muted" style={{ marginTop: 4 }}>
            — {latestFeedback.teacherName} · <Link to="/student/feedback">{latestFeedback.type === "VOICE" ? "Listen" : "All feedback"}</Link>
          </div>
        </div>
      )}

      {e.status === "PENDING" && (
        <PendingActions enrollment={e} paymentStatus={payment?.status} reviewNote={payment?.reviewNote ?? null} />
      )}
      {e.status === "REJECTED" && <div className="alert alert-error">Not approved: {e.rejectionReason}</div>}

      {e.status === "APPROVED" && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="small muted">
            Next class: <strong style={{ color: "var(--text)" }}>{nextClass ? formatDateTime(nextClass.scheduledAt) : e.classGroup?.scheduleText ?? "to be announced"}</strong>
          </div>
          <div className="row">
            <Link to={`/student/live/${e.id}`} className="btn" style={{ flex: 1 }}>Join Live Class</Link>
            <Link to="/student/lectures" className="btn btn-outline">Recordings</Link>
          </div>
        </div>
      )}

      {e.certificate && (
        <Link to={`/student/certificates/${e.certificate.certificateNumber}`} className="btn btn-gold">
          View Certificate
        </Link>
      )}
    </article>
  );
}

function PendingActions({ enrollment, paymentStatus, reviewNote }: { enrollment: Enrollment; paymentStatus?: string; reviewNote: string | null }) {
  if (paymentStatus === "PENDING") return <div className="alert alert-ok">Payment received — the academy is checking it.</div>;
  if (paymentStatus === "VERIFIED") return <div className="alert alert-ok">Payment verified — you'll be placed in a class group soon.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {paymentStatus === "REJECTED" && <div className="alert alert-warn">Payment not accepted: {reviewNote}</div>}
      <Link to={`/student/pay/${enrollment.id}`} className="btn">
        {paymentStatus === "REJECTED" ? "Upload payment again" : "Pay & upload screenshot"}
      </Link>
    </div>
  );
}
