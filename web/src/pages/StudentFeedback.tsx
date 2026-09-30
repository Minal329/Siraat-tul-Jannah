// A student's feedback from their teachers — written notes and voice notes.
import { Layout } from "../components/Layout.tsx";
import { Empty, Loaded, PrivateAudio } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDateTime } from "../lib/format.ts";
import { useLoad } from "../lib/hooks.ts";
import type { Feedback } from "../lib/types.ts";

export function StudentFeedbackPage() {
  const state = useLoad(() => api<{ feedback: Feedback[]; unreadCount: number }>("/feedback/mine"), []);

  async function markRead(id: string) {
    await api(`/feedback/${id}/read`, { method: "POST" });
    state.reload();
  }

  return (
    <Layout subtitle="Feedback">
      <Loaded state={state}>
        {({ feedback, unreadCount }) => (
          <>
            <div className="row-between">
              <h1 className="section-title">From your teachers</h1>
              {unreadCount > 0 && <span className="pill pill-warn">{unreadCount} new</span>}
            </div>
            {feedback.length === 0 && <Empty>No feedback yet.</Empty>}
            <div className="list">
              {feedback.map((f) => (
                <article key={f.id} className="list-item" style={f.readAt ? undefined : { borderColor: "var(--gold)" }}>
                  <div className="row-between">
                    <strong>{f.teacherName}</strong>
                    <span className="muted">{[f.courseTitle, formatDateTime(f.sentAt)].filter(Boolean).join(" · ")}</span>
                  </div>
                  {f.text && <div className="quote">{f.text}</div>}
                  {f.voiceUrl && <PrivateAudio path={f.voiceUrl} label={`Voice note from ${f.teacherName}`} />}
                  {!f.readAt && (
                    <button className="btn btn-outline btn-small" style={{ alignSelf: "flex-start" }} onClick={() => markRead(f.id)}>
                      Mark as read
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </Loaded>
    </Layout>
  );
}
