// Teachers (and admins) share recorded lectures: a link to the video on
// YouTube (unlisted), Vimeo or similar — never a file upload.
import { useState, type FormEvent } from "react";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDate } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import type { Lecture, TeacherGroup } from "../lib/types.ts";

export function TeacherLecturesPage() {
  const state = useLoad(async () => {
    const [{ lectures }, { classGroups }] = await Promise.all([
      api<{ lectures: Lecture[] }>("/teacher/lectures"),
      api<{ classGroups: TeacherGroup[] }>("/teacher/class-groups"),
    ]);
    return { lectures, classGroups };
  }, []);

  async function togglePublished(lecture: Lecture) {
    await api(`/teacher/lectures/${lecture.id}`, { method: "PATCH", body: { published: !lecture.published } });
    state.reload();
  }

  return (
    <Layout subtitle="Recorded Lectures">
      <Loaded state={state}>
        {({ lectures, classGroups }) => (
          <>
            {classGroups.length > 0 && <AddLectureForm groups={classGroups} onAdded={state.reload} />}
            <h2 className="section-title">Shared lectures</h2>
            {lectures.length === 0 && <Empty>No lectures shared yet.</Empty>}
            <div className="list">
              {lectures.map((l) => (
                <div key={l.id} className="list-item">
                  <div className="row-between">
                    <div>
                      <strong>{l.title}</strong>
                      <div className="muted">
                        {[l.course.title, l.classGroup ? `${l.classGroup.name} only` : "All groups", l.publishedAt ? formatDate(l.publishedAt) : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className={`pill ${l.published ? "pill-ok" : "pill-warn"}`}>{l.published ? "Published" : "Draft"}</span>
                  </div>
                  <div className="row">
                    <a className="btn btn-outline btn-small" href={l.videoUrl} target="_blank" rel="noreferrer">Open video</a>
                    <button className="btn btn-outline btn-small" onClick={() => togglePublished(l)}>{l.published ? "Unpublish" : "Publish"}</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Loaded>
    </Layout>
  );
}

function AddLectureForm({ groups, onAdded }: { groups: TeacherGroup[]; onAdded: () => void }) {
  const [groupId, setGroupId] = useState(groups[0].id);
  const [groupOnly, setGroupOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [minutes, setMinutes] = useState("");
  const [publish, setPublish] = useState(true);
  const { busy, error, run } = useAction();
  const group = groups.find((g) => g.id === groupId)!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const done = await run(() =>
      api("/teacher/lectures", {
        body: {
          courseId: group.course.id,
          classGroupId: groupOnly ? group.id : undefined,
          title: title.trim(),
          videoUrl: videoUrl.trim(),
          durationSeconds: minutes ? Math.round(Number(minutes) * 60) : undefined,
          published: publish,
        },
      }),
    );
    if (done) {
      setTitle("");
      setVideoUrl("");
      setMinutes("");
      onAdded();
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">Share a lecture recording</h2>
      <p className="muted" style={{ margin: 0 }}>Upload the video to YouTube (as "Unlisted") or Vimeo first, then paste its link here.</p>
      <div className="field">
        <label htmlFor="lec-group">Course / group</label>
        <select id="lec-group" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.course.title} — {g.name}</option>)}
        </select>
      </div>
      <label className="check"><input type="checkbox" checked={groupOnly} onChange={(e) => setGroupOnly(e.target.checked)} /> Only for this group (otherwise every group of the course)</label>
      <div className="field">
        <label htmlFor="lec-title">Title</label>
        <input id="lec-title" className="input" required placeholder="Lesson 5 — Tanween" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="lec-url">Video link</label>
        <input id="lec-url" className="input" type="url" required placeholder="https://youtu.be/…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="lec-min">Length in minutes (optional)</label>
        <input id="lec-min" className="input" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <label className="check"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish now (students can see it)</label>
      <ErrorMessage error={error} />
      <button className="btn" disabled={busy}>{busy ? "Saving…" : "Share lecture"}</button>
    </form>
  );
}
