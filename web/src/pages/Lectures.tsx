// Recorded Lectures (prototype screen 7): filter by course, watch in place.
import { useState } from "react";
import { Layout } from "../components/Layout.tsx";
import { Empty, Loaded, Modal } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDate, formatDuration } from "../lib/format.ts";
import { useLoad } from "../lib/hooks.ts";
import type { Lecture } from "../lib/types.ts";

export function LecturesPage() {
  const state = useLoad(() => api<{ lectures: Lecture[] }>("/lectures"), []);
  const [course, setCourse] = useState("All");
  const [playing, setPlaying] = useState<Lecture | null>(null);

  return (
    <Layout subtitle="Recorded Lectures">
      <Loaded state={state}>
        {({ lectures }) => {
          const courses = ["All", ...new Set(lectures.map((l) => l.course.title))];
          const shown = course === "All" ? lectures : lectures.filter((l) => l.course.title === course);
          return (
            <>
              <div className="chips" role="group" aria-label="Filter by course">
                {courses.map((c) => (
                  <button key={c} className="chip" aria-pressed={course === c} onClick={() => setCourse(c)}>{c}</button>
                ))}
              </div>
              {shown.length === 0 && <Empty>No recordings yet. They'll appear here once your teacher shares them.</Empty>}
              <div className="list">
                {shown.map((lecture) => (
                  <button key={lecture.id} className="list-item" style={{ textAlign: "left", cursor: "pointer", flexDirection: "row", alignItems: "center" }} onClick={() => setPlaying(lecture)}>
                    <span className="avatar" aria-hidden="true">▶</span>
                    <span style={{ flex: 1 }}>
                      <strong>{lecture.title}</strong>
                      <span className="muted" style={{ display: "block" }}>
                        {[lecture.course.title, lecture.publishedAt ? formatDate(lecture.publishedAt) : null, formatDuration(lecture.durationSeconds)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {playing && (
                <Modal title={playing.title} onClose={() => setPlaying(null)}>
                  {playing.embedUrl ? (
                    <iframe className="video-frame" src={playing.embedUrl} title={playing.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
                  ) : (
                    <a className="btn" href={playing.videoUrl} target="_blank" rel="noreferrer">Open the video</a>
                  )}
                  {playing.description && <p className="muted" style={{ margin: 0 }}>{playing.description}</p>}
                </Modal>
              )}
            </>
          );
        }}
      </Loaded>
    </Layout>
  );
}
