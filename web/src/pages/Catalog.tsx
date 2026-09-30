// Course Catalog (prototype screen 2): anyone can browse; students can enroll.
import { useState } from "react";
import { useNavigate } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { useAuth } from "../lib/useAuth.ts";
import { formatPkr } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import type { Course, Enrollment } from "../lib/types.ts";

export function CatalogPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const state = useLoad(() => api<{ courses: Course[] }>("/courses"), []);
  const [level, setLevel] = useState<string>("All Courses");
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const { error, run } = useAction();

  async function enroll(course: Course) {
    if (!user) {
      navigate(`/signup?next=${encodeURIComponent("/courses")}`);
      return;
    }
    setEnrollingId(course.id);
    await run(async () => {
      try {
        const { enrollment } = await api<{ enrollment: Enrollment }>("/enrollments", { body: { courseId: course.id } });
        navigate(`/student/pay/${enrollment.id}`);
      } catch (err) {
        // Already applied: take them to their existing application instead.
        if (err instanceof ApiError && err.code === "ENROLLMENT_EXISTS") navigate("/student");
        else throw err;
      }
    });
    setEnrollingId(null);
  }

  return (
    <Layout subtitle="Course Catalog" greeting={{ title: "Our courses", text: "Learn the Quran with qualified teachers, from home." }}>
      <ErrorMessage error={error} />
      <Loaded state={state}>
        {({ courses }) => {
          const levels = ["All Courses", ...new Set(courses.map((c) => c.level).filter((l): l is string => !!l))];
          const shown = level === "All Courses" ? courses : courses.filter((c) => c.level === level);
          return (
            <>
              <div className="chips" role="group" aria-label="Filter by level">
                {levels.map((l) => (
                  <button key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l}
                  </button>
                ))}
              </div>
              {shown.length === 0 && <Empty>No courses here yet.</Empty>}
              <div className="grid">
                {shown.map((course) => (
                  <article key={course.id} className="card">
                    <div className="course-banner">
                      {course.thumbnailUrl ? (
                        <img src={course.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "16px 16px 0 0" }} />
                      ) : (
                        <span style={{ fontFamily: "var(--font-display)", color: "var(--ivory)", fontSize: 22 }}>{course.title}</span>
                      )}
                      <span className={`pill price ${course.feePkr === 0 ? "pill-ok" : "pill-plain"}`}>{formatPkr(course.feePkr)}</span>
                    </div>
                    <div>
                      <h2 className="card-title">{course.title}</h2>
                      <div className="muted">
                        {[course.level, course.durationWeeks ? `${course.durationWeeks} weeks` : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <p className="muted" style={{ margin: 0 }}>{course.description}</p>
                    {(!user || user.role === "STUDENT") && (
                      <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => enroll(course)} disabled={enrollingId === course.id}>
                        {enrollingId === course.id ? "Enrolling…" : "Enroll"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          );
        }}
      </Loaded>
    </Layout>
  );
}
