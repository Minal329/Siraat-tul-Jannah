// Live Class (prototype screen 6): shows when the class is live (checked every
// 30 seconds), and joins on Zoom — or WhatsApp when the connection is weak or
// the teacher has switched the class there.
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDateTime, formatTime } from "../lib/format.ts";
import { useAction, useInterval, useLoad } from "../lib/hooks.ts";
import type { Enrollment, LivePlatform, Session } from "../lib/types.ts";

type ScheduleItem = Session & { classGroup: { id: string; name: string }; courseTitle: string };
type LiveState = { session: Session | null; joinedAt: string | null };

export function LiveClassPage() {
  const { enrollmentId } = useParams();
  const [chosenTab, setTab] = useState<"zoom" | "whatsapp" | null>(null);
  const state = useLoad(async () => {
    const [{ enrollments }, { sessions }] = await Promise.all([
      api<{ enrollments: Enrollment[] }>("/enrollments/mine"),
      api<{ sessions: ScheduleItem[] }>("/enrollments/schedule"),
    ]);
    const enrollment = enrollments.find((e) => e.id === enrollmentId) ?? null;
    return { enrollment, sessions: sessions.filter((s) => s.classGroup.id === enrollment?.classGroup?.id) };
  }, [enrollmentId]);

  const canJoin = state.data?.enrollment?.status === "APPROVED" && !!state.data.enrollment.classGroup;
  const live = useLoad<LiveState>(
    () => (canJoin ? api<LiveState>(`/enrollments/${enrollmentId}/live`) : Promise.resolve({ session: null, joinedAt: null })),
    [enrollmentId, canJoin],
  );
  useInterval(live.reload, 30_000);

  return (
    <Layout subtitle="Live Class">
      <Loaded state={state}>
        {({ enrollment, sessions }) => {
          const group = enrollment?.classGroup;
          if (!enrollment || enrollment.status !== "APPROVED" || !group) {
            return <Empty>Live classes open once you're approved and placed in a class group. <Link to="/student">Back to dashboard</Link></Empty>;
          }
          const liveSession = live.data?.session ?? null;
          const next = sessions.find((s) => s.status !== "LIVE");
          // Follow the teacher: if they moved the class to WhatsApp, open that tab.
          const tab = chosenTab ?? (liveSession?.livePlatform === "WHATSAPP" ? "whatsapp" : "zoom");
          return (
            <div className="stack" style={{ maxWidth: 640, width: "100%", alignSelf: "center" }}>
              <div className="card">
                <div className="row-between">
                  <div>
                    <h1 className="card-title">{group.name}</h1>
                    <div className="muted">{group.teacherName}</div>
                  </div>
                  {liveSession && <span className="pill pill-bad">LIVE</span>}
                </div>
                {!liveSession && (
                  <div className="muted">
                    {next ? <>Next class: <strong style={{ color: "var(--text)" }}>{formatDateTime(next.scheduledAt)}</strong>{next.topic ? ` — ${next.topic}` : ""}</> : group.scheduleText ?? "No class scheduled yet."}
                  </div>
                )}
              </div>

              {liveSession && (
                <LiveBanner
                  enrollmentId={enrollment.id}
                  session={liveSession}
                  joinedAt={live.data?.joinedAt ?? null}
                  hasLink={liveSession.livePlatform === "WHATSAPP" ? !!group.whatsappGroupLink : !!group.zoomJoinUrl}
                  onJoined={live.reload}
                />
              )}

              <div className="tabs" role="tablist">
                <button className="tab" role="tab" aria-selected={tab === "zoom"} onClick={() => setTab("zoom")}>Zoom Class</button>
                <button className="tab" role="tab" aria-selected={tab === "whatsapp"} onClick={() => setTab("whatsapp")}>WhatsApp Options</button>
              </div>

              {tab === "zoom" ? (
                <div className="card">
                  {group.zoomJoinUrl ? (
                    <>
                      <JoinButton enrollmentId={enrollment.id} platform="ZOOM" href={group.zoomJoinUrl} live={!!liveSession} onJoined={live.reload}>Join on Zoom</JoinButton>
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
                      <JoinButton enrollmentId={enrollment.id} platform="WHATSAPP" href={group.whatsappGroupLink} live={!!liveSession} onJoined={live.reload}>
                        Join Class WhatsApp Group
                      </JoinButton>
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

function LiveBanner({ enrollmentId, session, joinedAt, hasLink, onJoined }: {
  enrollmentId: string;
  session: Session;
  joinedAt: string | null;
  hasLink: boolean;
  onJoined: () => void;
}) {
  const platform = session.livePlatform ?? "ZOOM";
  return (
    <div className="card live-banner" role="status">
      <strong>Your class is live{session.topic ? ` — ${session.topic}` : ""}</strong>
      <div className="muted">
        Started {session.startedAt ? formatTime(session.startedAt) : "just now"} on {platform === "ZOOM" ? "Zoom" : "WhatsApp"}
        {joinedAt && ` · you joined at ${formatTime(joinedAt)}`}
      </div>
      {session.liveNote && <div className="quote">{session.liveNote}</div>}
      {hasLink ? (
        <JoinButton enrollmentId={enrollmentId} platform={platform} live onJoined={onJoined}>
          {platform === "ZOOM" ? "Join now on Zoom" : "Join now on WhatsApp"}
        </JoinButton>
      ) : (
        <div className="muted">
          Your teacher hasn't added a {platform === "ZOOM" ? "Zoom meeting" : "WhatsApp group"} link for this class yet — please message them.
        </div>
      )}
    </div>
  );
}

// While the class is live, "Join" is recorded first (a hint for the teacher's
// attendance) and then opens the link. Otherwise it's a plain link.
function JoinButton({ enrollmentId, platform, href, live, onJoined, children }: {
  enrollmentId: string;
  platform: LivePlatform;
  href?: string;
  live: boolean;
  onJoined: () => void;
  children: React.ReactNode;
}) {
  const { busy, error, run } = useAction();
  const join = useCallback(async () => {
    // Open the new tab straight away (browsers block tabs opened after a delay),
    // then send it to the link once we have it.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const result = await run(() => api<{ joinUrl: string }>(`/enrollments/${enrollmentId}/live/join`, { body: { platform } }));
    if (!result) return tab?.close();
    if (tab) tab.location.href = result.joinUrl;
    else window.location.href = result.joinUrl;
    onJoined();
  }, [enrollmentId, platform, run, onJoined]);

  if (!live && href) {
    return <a className="btn btn-block" href={href} target="_blank" rel="noreferrer">{children}</a>;
  }
  return (
    <>
      <button className="btn btn-block" onClick={join} disabled={busy}>{busy ? "Opening…" : children}</button>
      <ErrorMessage error={error} />
    </>
  );
}
