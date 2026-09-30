// Live Class (prototype screen 6): join on Zoom, or use WhatsApp when the
// connection is weak. (A Zoom player inside the app comes in roadmap step 14.)
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, Loaded } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDateTime } from "../lib/format.ts";
import { useLoad } from "../lib/hooks.ts";
import type { Enrollment, Session } from "../lib/types.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string }; courseTitle: string };

export function LiveClassPage() {
  const { enrollmentId } = useParams();
  const [tab, setTab] = useState<"zoom" | "whatsapp">("zoom");
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
    ]);
    const enrollment = enrollments.find((e) => e.id === enrollmentId) ?? null;
    return { enrollment, sessions: sessions.filter((s) => s.classGroup.id === enrollment?.classGroup?.id), loadedAt: Date.now() };
  }, [enrollmentId]);

  return (
    <Layout subtitle="Live Class">
      <Loaded state={state}>
        {({ enrollment, sessions, loadedAt }) => {
          const group = enrollment?.classGroup;
          if (!enrollment || enrollment.status !== "APPROVED" || !group) {
            return <Empty>Live classes open once you're approved and placed in a class group. <Link to="/student">Back to dashboard</Link></Empty>;
          }
          const next = sessions[0];
          const isLive = next && new Date(next.scheduledAt).getTime() <= loadedAt;
          return (
            <div className="stack" style={{ maxWidth: 640, width: "100%", alignSelf: "center" }}>
              <div className="card">
                <div className="row-between">
                  <div>
                    <h1 className="card-title">{group.name}</h1>
                    <div className="muted">{group.teacherName}</div>
                  </div>
                  {isLive && <span className="pill pill-bad">LIVE</span>}
                </div>
                <div className="muted">
                  {next ? <>Next class: <strong style={{ color: "var(--text)" }}>{formatDateTime(next.scheduledAt)}</strong>{next.topic ? ` — ${next.topic}` : ""}</> : group.scheduleText ?? "No class scheduled yet."}
                </div>
              </div>

              <div className="tabs" role="tablist">
                <button className="tab" role="tab" aria-selected={tab === "zoom"} onClick={() => setTab("zoom")}>Zoom Class</button>
                <button className="tab" role="tab" aria-selected={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>WhatsApp Options</button>
              </div>

              {tab === "zoom" ? (
                <div className="card">
                  {group.zoomJoinUrl ? (
                    <>
                      <a className="btn btn-block" href={group.zoomJoinUrl} target="_blank" rel="noreferrer">Join on Zoom</a>
                      <div className="muted">
                        Meeting ID: <strong>{group.zoomMeetingId}</strong>
                        {group.zoomPasscode && <> · Passcode: <strong>{group.zoomPasscode}</strong></>}
                      </div>
                    </>
                  ) : (
                    <div className="muted">Your teacher hasn't added a Zoom meeting yet.</div>
                  )}
                  <button className="btn btn-outline" onClick={() => setTab("whatsapp")}>Low bandwidth? Use WhatsApp instead</button>
                </div>
              ) : (
                <div className="card">
                  <div className="muted">Choose how you'd like to join this class</div>
                  {group.whatsappGroupLink ? (
                    <>
                      <a className="btn btn-block" href={group.whatsappGroupLink} target="_blank" rel="noreferrer">Join Class WhatsApp Group</a>
                      <div className="quote">To join a group voice or video call, open the group in WhatsApp and tap the call icon when your teacher starts it.</div>
                    </>
                  ) : (
                    <div className="muted">Your teacher hasn't added a WhatsApp group yet.</div>
                  )}
                </div>
              )}
            </div>
          );
        }}
      </Loaded>
    </Layout>
  );
}
