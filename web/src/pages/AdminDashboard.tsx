// Admin Dashboard (prototype screen 8): verify payments, approve students into
// class groups, and manage courses, groups, teachers and payment accounts.
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Layout } from "../components/Layout.tsx";
import { Empty, ErrorMessage, Loaded, Modal, PrivateImage, StatusPill } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { formatDate, formatDateTime, formatPkr, initials, METHOD_LABELS } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import type { AdminClassGroup, AdminCourse, AdminEnrollment, AdminPayment, PaymentAccount, PaymentMethod, TeacherSummary } from "../lib/types.ts";

const TABS = [
  ["enrollments", "Enrollments"],
  ["payments", "Payments"],
  ["courses", "Courses"],
  ["groups", "Class groups"],
  ["teachers", "Teachers"],
  ["accounts", "Payment accounts"],
] as const;
type Tab = (typeof TABS)[number][0];

export function AdminDashboardPage() {
  const [tab, setTab] = useState<Tab>("enrollments");
  return (
    <Layout subtitle="Admin" greeting={{ title: "Admin — Enrollments", text: "Verify payments & assign groups" }}>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "enrollments" && <EnrollmentsTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "courses" && <CoursesTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "teachers" && <TeachersTab />}
      {tab === "accounts" && <AccountsTab />}
    </Layout>
  );
}

// ── Enrollments ──────────────────────────────────────────────────

function EnrollmentsTab() {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "COMPLETED">("PENDING");
  const state = useLoad(async () => {
    const [{ enrollments }, { classGroups }] = await Promise.all([
      api<{ enrollments: AdminEnrollment[] }>(`/admin/enrollments?status=${status}`),
      api<{ classGroups: AdminClassGroup[] }>("/admin/class-groups"),
    ]);
    return { enrollments, classGroups };
  }, [status]);

  return (
    <>
      <div className="chips" role="group" aria-label="Show">
        {(["PENDING", "APPROVED", "COMPLETED"] as const).map((s) => (
          <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s === "PENDING" ? "Pending" : s === "APPROVED" ? "Approved" : "Completed"}
          </button>
        ))}
      </div>
      <Loaded state={state}>
        {({ enrollments, classGroups }) =>
          enrollments.length === 0 ? (
            <Empty>Nothing here right now.</Empty>
          ) : (
            <div className="list">
              {enrollments.map((e) => (
                <EnrollmentRow key={e.id} enrollment={e} groups={classGroups.filter((g) => g.course.id === e.course.id && g.isActive)} onChange={state.reload} />
              ))}
            </div>
          )
        }
      </Loaded>
    </>
  );
}

function EnrollmentRow({ enrollment: e, groups, onChange }: { enrollment: AdminEnrollment; groups: AdminClassGroup[]; onChange: () => void }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [withoutPayment, setWithoutPayment] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const payment = e.payments[0];
  const act = async (path: string, body: object = {}) => {
    if (await run(() => api(`/admin/enrollments/${e.id}/${path}`, { body }))) onChange();
  };

  return (
    <div className="list-item">
      <div className="row">
        <span className="avatar">{initials(e.student.fullName)}</span>
        <div style={{ flex: 1 }}>
          <strong>{e.student.fullName}</strong>
          <div className="muted">
            {e.course.title} · {formatPkr(e.course.feePkr)}
            {payment && ` · ${METHOD_LABELS[payment.method]} PKR ${payment.amountPkr.toLocaleString()}`}
          </div>
          <div className="muted small">{e.student.email}{e.student.whatsappNumber ? ` · ${e.student.whatsappNumber}` : ""} · applied {formatDate(e.appliedAt)}</div>
          <ResetPasswordButton userId={e.student.userId} name={e.student.fullName} />
        </div>
        {payment ? <StatusPill status={payment.status} /> : <span className="pill pill-bad">No payment</span>}
      </div>
      {payment && (
        <button className="btn btn-outline btn-small" style={{ alignSelf: "flex-start" }} onClick={() => setProof(payment.proofUrl)}>
          Payment screenshot{payment.transactionId ? ` · Txn ${payment.transactionId}` : ""}
        </button>
      )}

      {e.status === "PENDING" && (
        <>
          <div className="row">
            <select className="input" style={{ flex: 1, minWidth: 200 }} aria-label="Assign to group" value={groupId} onChange={(ev) => setGroupId(ev.target.value)}>
              {groups.length === 0 && <option value="">No active group for this course — create one first</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.studentCount}{g.maxStudents ? `/${g.maxStudents}` : ""} students)
                </option>
              ))}
            </select>
            <button className="btn" disabled={busy || !groupId} onClick={() => act("approve", { classGroupId: groupId, approveWithoutPayment: withoutPayment || undefined })}>
              Approve &amp; Assign
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => setRejecting(!rejecting)}>Reject</button>
          </div>
          {!e.hasVerifiedPayment && (
            <label className="check small">
              <input type="checkbox" checked={withoutPayment} onChange={(ev) => setWithoutPayment(ev.target.checked)} />
              Approve without a verified payment (scholarship or cash)
            </label>
          )}
          {rejecting && (
            <div className="row">
              <input className="input" style={{ flex: 1 }} aria-label="Reason for rejection" placeholder="Reason the student will see" value={reason} onChange={(ev) => setReason(ev.target.value)} />
              <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => act("reject", { reason: reason.trim() })}>Confirm reject</button>
            </div>
          )}
        </>
      )}
      {e.status === "APPROVED" && (
        <div className="row-between">
          <span className="muted">✓ In {e.classGroup?.name}</span>
          <button className="btn btn-outline btn-small" disabled={busy} onClick={() => act("complete")}>Mark course completed</button>
        </div>
      )}
      {e.status === "COMPLETED" &&
        (e.certificate ? (
          <span className="muted">Certificate <Link to={`/verify/${e.certificate.certificateNumber}`}>{e.certificate.certificateNumber}</Link></span>
        ) : (
          <button
            className="btn btn-gold btn-small"
            style={{ alignSelf: "flex-start" }}
            disabled={busy}
            onClick={async () => {
              if (await run(() => api("/admin/certificates", { body: { enrollmentId: e.id } }))) onChange();
            }}
          >
            Issue certificate
          </button>
        ))}
      <ErrorMessage error={error} />
      {proof && (
        <Modal title={`Payment from ${e.student.fullName}`} onClose={() => setProof(null)}>
          <PrivateImage path={proof} alt={`Payment screenshot from ${e.student.fullName}`} />
        </Modal>
      )}
    </div>
  );
}

// ── Payments ─────────────────────────────────────────────────────

function PaymentsTab() {
  const state = useLoad(() => api<{ payments: AdminPayment[] }>("/admin/payments?status=PENDING"), []);
  return (
    <Loaded state={state}>
      {({ payments }) =>
        payments.length === 0 ? (
          <Empty>No payments waiting for review.</Empty>
        ) : (
          <div className="list">
            {payments.map((p) => <PaymentRow key={p.id} payment={p} onChange={state.reload} />)}
          </div>
        )
      }
    </Loaded>
  );
}

function PaymentRow({ payment: p, onChange }: { payment: AdminPayment; onChange: () => void }) {
  const [showProof, setShowProof] = useState(false);
  const [note, setNote] = useState("");
  const { busy, error, run } = useAction();
  const review = async (decision: "verify" | "reject") => {
    if (await run(() => api(`/admin/payments/${p.id}/${decision}`, { body: decision === "reject" ? { note: note.trim() } : {} }))) onChange();
  };
  const mismatch = p.amountPkr !== p.enrollment.courseFeePkr;

  return (
    <div className="list-item">
      <div className="row-between">
        <div>
          <strong>{p.student.fullName}</strong>
          <div className="muted">{p.enrollment.courseTitle} · {METHOD_LABELS[p.method]} · Txn {p.transactionId ?? "—"} · {formatDateTime(p.submittedAt)}</div>
        </div>
        <strong>PKR {p.amountPkr.toLocaleString()}</strong>
      </div>
      {mismatch && <div className="alert alert-warn">Amount differs from the course fee ({formatPkr(p.enrollment.courseFeePkr)}).</div>}
      <div className="row">
        <button className="btn btn-outline btn-small" onClick={() => setShowProof(true)}>View screenshot</button>
        <button className="btn btn-small" disabled={busy} onClick={() => review("verify")}>Verify</button>
        <input className="input" style={{ flex: 1, minWidth: 180, minHeight: 36 }} aria-label="Reason for rejecting" placeholder="Reason, if rejecting" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-danger btn-small" disabled={busy || note.trim().length < 3} onClick={() => review("reject")}>Reject</button>
      </div>
      <ErrorMessage error={error} />
      {showProof && (
        <Modal title={`Payment from ${p.student.fullName}`} onClose={() => setShowProof(false)}>
          <PrivateImage path={p.proofUrl} alt={`Payment screenshot from ${p.student.fullName}`} />
        </Modal>
      )}
    </div>
  );
}

// ── Courses ──────────────────────────────────────────────────────

function CoursesTab() {
  const state = useLoad(() => api<{ courses: AdminCourse[] }>("/admin/courses"), []);
  const [form, setForm] = useState({ title: "", description: "", feePkr: "", level: "", publish: false });
  const { busy, error, run } = useAction();

  async function create(e: FormEvent) {
    e.preventDefault();
    const done = await run(() =>
      api("/admin/courses", {
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          feePkr: Number(form.feePkr || 0),
          level: form.level.trim() || undefined,
          isPublished: form.publish,
        },
      }),
    );
    if (done) {
      setForm({ title: "", description: "", feePkr: "", level: "", publish: false });
      state.reload();
    }
  }

  async function update(course: AdminCourse, changes: Partial<AdminCourse>) {
    await run(() => api(`/admin/courses/${course.id}`, { method: "PATCH", body: changes }));
    state.reload();
  }

  return (
    <>
      <form className="card" onSubmit={create}>
        <h2 className="card-title">Add New Course</h2>
        <div className="field"><label htmlFor="c-title">Course title</label><input id="c-title" className="input" required placeholder="e.g. Weekend Tajweed Circle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="field"><label htmlFor="c-desc">Description</label><textarea id="c-desc" className="input" required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor="c-fee">Fee (PKR, 0 = free)</label><input id="c-fee" className="input" type="number" min={0} step={1} value={form.feePkr} onChange={(e) => setForm({ ...form, feePkr: e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor="c-level">Level / category</label><input id="c-level" className="input" placeholder="Beginner" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} /> Publish now (show in the catalog)</label>
        <ErrorMessage error={error} />
        <button className="btn" disabled={busy}>Post Course</button>
      </form>
      <Loaded state={state}>
        {({ courses }) => (
          <div className="list">
            {courses.map((c) => (
              <div key={c.id} className="list-item">
                <div className="row-between">
                  <div><strong>{c.title}</strong><div className="muted">{formatPkr(c.feePkr)} · /{c.slug}</div></div>
                  <span className={`pill ${c.isPublished ? "pill-ok" : "pill-warn"}`}>{c.isPublished ? "Published" : "Draft"}</span>
                </div>
                <div className="row">
                  <button className="btn btn-outline btn-small" onClick={() => update(c, { isPublished: !c.isPublished })}>{c.isPublished ? "Unpublish" : "Publish"}</button>
                  <button
                    className="btn btn-outline btn-small"
                    onClick={() => {
                      const fee = window.prompt(`New fee for ${c.title} (PKR)`, String(c.feePkr));
                      if (fee !== null && fee.trim() !== "") update(c, { feePkr: Number(fee) });
                    }}
                  >
                    Change fee
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Loaded>
    </>
  );
}

// ── Class groups ─────────────────────────────────────────────────

function GroupsTab() {
  const state = useLoad(async () => {
    const [{ classGroups }, { courses }, { teachers }, { zoomConfigured }] = await Promise.all([
      api<{ classGroups: AdminClassGroup[] }>("/admin/class-groups"),
      api<{ courses: AdminCourse[] }>("/admin/courses"),
      api<{ teachers: TeacherSummary[] }>("/admin/teachers"),
      api<{ zoomConfigured: boolean }>("/admin/class-groups/zoom-status"),
    ]);
    return { classGroups, courses, teachers, zoomConfigured };
  }, []);

  return (
    <Loaded state={state}>
      {({ classGroups, courses, teachers, zoomConfigured }) => (
        <>
          <NewGroupForm courses={courses} teachers={teachers.filter((t) => t.isActive)} onCreated={state.reload} />
          <div className="list">
            {classGroups.map((g) => (
              <div key={g.id} className="list-item">
                <div className="row-between">
                  <div>
                    <strong>{g.name}</strong>
                    <div className="muted">{g.course.title} · {g.teacher?.fullName ?? "No teacher"} · {g.scheduleText ?? "No schedule"}</div>
                  </div>
                  <span className={`pill ${g.isActive ? "pill-ok" : "pill-bad"}`}>{g.studentCount}{g.maxStudents ? `/${g.maxStudents}` : ""} students{g.isActive ? "" : " · inactive"}</span>
                </div>
                <div className="muted small">
                  Zoom: {g.zoomMeetingId ?? "—"} · WhatsApp: {g.whatsappGroupLink ? "linked" : "—"}
                </div>
                {zoomConfigured && <CreateZoomMeeting group={g} onCreated={state.reload} />}
              </div>
            ))}
          </div>
        </>
      )}
    </Loaded>
  );
}

// Only offered when the Zoom API is connected (see docs/deployment.md).
function CreateZoomMeeting({ group, onCreated }: { group: AdminClassGroup; onCreated: () => void }) {
  const { busy, error, run } = useAction();
  async function create() {
    if (group.zoomMeetingId && !window.confirm(`Replace ${group.name}'s Zoom meeting with a new one? Students will need the new link.`)) return;
    const done = await run(() => api(`/admin/class-groups/${group.id}/zoom-meeting`, { method: "POST" }));
    if (done) onCreated();
  }
  return (
    <div className="row">
      <button className="btn btn-small btn-outline" onClick={create} disabled={busy}>
        {busy ? "Creating…" : group.zoomMeetingId ? "Create a new Zoom meeting" : "Create Zoom meeting"}
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}

function NewGroupForm({ courses, teachers, onCreated }: { courses: AdminCourse[]; teachers: TeacherSummary[]; onCreated: () => void }) {
  const empty = { courseId: courses[0]?.id ?? "", teacherId: "", name: "", scheduleText: "", startDate: "", endDate: "", maxStudents: "", zoomMeetingId: "", zoomPasscode: "", whatsappGroupLink: "" };
  const [f, setF] = useState(empty);
  const { busy, error, run } = useAction();
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const optional = (value: string) => value.trim() || undefined;
    const done = await run(() =>
      api("/admin/class-groups", {
        body: {
          courseId: f.courseId,
          teacherId: optional(f.teacherId),
          name: f.name.trim(),
          scheduleText: optional(f.scheduleText),
          startDate: optional(f.startDate),
          endDate: optional(f.endDate),
          maxStudents: f.maxStudents ? Number(f.maxStudents) : undefined,
          zoomMeetingId: optional(f.zoomMeetingId),
          zoomPasscode: optional(f.zoomPasscode),
          whatsappGroupLink: optional(f.whatsappGroupLink),
        },
      }),
    );
    if (done) {
      setF(empty);
      onCreated();
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">New class group (batch)</h2>
      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="g-course">Course</label>
          <select id="g-course" className="input" value={f.courseId} onChange={set("courseId")}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="g-teacher">Teacher</label>
          <select id="g-teacher" className="input" value={f.teacherId} onChange={set("teacherId")}><option value="">Assign later</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="g-name">Group name</label><input id="g-name" className="input" required placeholder="Tajweed — Batch 3 — Evening" value={f.name} onChange={set("name")} /></div>
      <div className="field"><label htmlFor="g-sched">Schedule</label><input id="g-sched" className="input" placeholder="Mon/Wed/Fri 8–9 pm PKT" value={f.scheduleText} onChange={set("scheduleText")} /></div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor="g-start">Starts</label><input id="g-start" className="input" type="date" value={f.startDate} onChange={set("startDate")} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="g-end">Ends</label><input id="g-end" className="input" type="date" value={f.endDate} onChange={set("endDate")} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="g-max">Max students</label><input id="g-max" className="input" type="number" min={1} value={f.maxStudents} onChange={set("maxStudents")} /></div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label htmlFor="g-zoom">Zoom meeting ID</label><input id="g-zoom" className="input" value={f.zoomMeetingId} onChange={set("zoomMeetingId")} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="g-pass">Zoom passcode</label><input id="g-pass" className="input" value={f.zoomPasscode} onChange={set("zoomPasscode")} /></div>
      </div>
      <div className="field"><label htmlFor="g-wa">WhatsApp group invite link</label><input id="g-wa" className="input" type="url" placeholder="https://chat.whatsapp.com/…" value={f.whatsappGroupLink} onChange={set("whatsappGroupLink")} /></div>
      <ErrorMessage error={error} />
      <button className="btn" disabled={busy || courses.length === 0}>Create group</button>
    </form>
  );
}

// ── Teachers ─────────────────────────────────────────────────────

function TeachersTab() {
  const state = useLoad(() => api<{ teachers: TeacherSummary[] }>("/admin/teachers"), []);
  const [form, setForm] = useState({ fullName: "", email: "", whatsappNumber: "" });
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await run(() =>
      api<{ teacher: TeacherSummary; temporaryPassword: string }>("/admin/teachers", {
        body: { fullName: form.fullName.trim(), email: form.email.trim(), whatsappNumber: form.whatsappNumber.trim() || undefined },
      }),
    );
    if (result) {
      setCreated({ name: result.teacher.fullName, email: result.teacher.email, password: result.temporaryPassword });
      setForm({ fullName: "", email: "", whatsappNumber: "" });
      state.reload();
    }
  }

  async function setActive(t: TeacherSummary, isActive: boolean) {
    await run(() => api(`/admin/users/${t.userId}/status`, { method: "PATCH", body: { isActive } }));
    state.reload();
  }

  return (
    <>
      {created && (
        <div className="alert alert-ok" role="status">
          Account created for <strong>{created.name}</strong> ({created.email}). Temporary password: <strong style={{ fontFamily: "monospace" }}>{created.password}</strong>
          <br />Share it privately — it won't be shown again. They can change it after logging in.
        </div>
      )}
      <form className="card" onSubmit={submit}>
        <h2 className="card-title">Add a teacher</h2>
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="t-name">Full name</label><input id="t-name" className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="t-email">Email</label><input id="t-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="t-wa">WhatsApp number (optional)</label><input id="t-wa" className="input" type="tel" placeholder="+923001234567" value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} /></div>
        <ErrorMessage error={error} />
        <button className="btn" disabled={busy}>Create teacher account</button>
      </form>
      <Loaded state={state}>
        {({ teachers }) => (
          <div className="list">
            {teachers.map((t) => (
              <div key={t.id} className="list-item" style={{ flexDirection: "row", alignItems: "center" }}>
                <span className="avatar">{initials(t.fullName)}</span>
                <div style={{ flex: 1 }}>
                  <strong>{t.fullName}</strong>
                  <div className="muted">{t.email} · {t.activeClassGroups} active group{t.activeClassGroups === 1 ? "" : "s"}</div>
                  <ResetPasswordButton userId={t.userId} name={t.fullName} />
                </div>
                <button className={`btn btn-small ${t.isActive ? "btn-danger" : "btn-outline"}`} onClick={() => setActive(t, !t.isActive)}>
                  {t.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Loaded>
    </>
  );
}

// Forgotten password: the admin gets a temporary one to share privately (shown once).
function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [temporary, setTemporary] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function reset() {
    if (!window.confirm(`Give ${name} a new temporary password? Their old password stops working and they're logged out everywhere.`)) return;
    const result = await run(() => api<{ temporaryPassword: string }>(`/admin/users/${userId}/reset-password`, { method: "POST" }));
    if (result) setTemporary(result.temporaryPassword);
  }

  if (temporary) {
    return (
      <div className="alert alert-ok small" role="status">
        New temporary password for {name}: <strong style={{ fontFamily: "monospace" }}>{temporary}</strong>
        <br />Share it privately — it won't be shown again. Ask them to change it after logging in.
      </div>
    );
  }
  return (
    <>
      <button className="link-button small" onClick={reset} disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
      <ErrorMessage error={error} />
    </>
  );
}

// ── Payment accounts ─────────────────────────────────────────────

function AccountsTab() {
  const state = useLoad(() => api<{ accounts: PaymentAccount[] }>("/admin/payment-accounts"), []);
  const [form, setForm] = useState({ method: "EASYPAISA" as PaymentMethod, accountTitle: "", accountNumber: "" });
  const { busy, error, run } = useAction();

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api("/admin/payment-accounts", { body: { ...form, accountTitle: form.accountTitle.trim(), accountNumber: form.accountNumber.trim() } }))) {
      setForm({ method: "EASYPAISA", accountTitle: "", accountNumber: "" });
      state.reload();
    }
  }

  async function update(account: PaymentAccount, changes: Partial<PaymentAccount>) {
    await run(() => api(`/admin/payment-accounts/${account.id}`, { method: "PATCH", body: changes }));
    state.reload();
  }

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>Students see these numbers on the Enroll &amp; Payment screen.</p>
      <ErrorMessage error={error} />
      <Loaded state={state}>
        {({ accounts }) => (
          <div className="list">
            {accounts.map((a) => (
              <div key={a.id} className="list-item">
                <div className="row-between">
                  <div><strong>{METHOD_LABELS[a.method]}: {a.accountNumber}</strong><div className="muted">{a.accountTitle}</div></div>
                  <span className={`pill ${a.isActive ? "pill-ok" : "pill-bad"}`}>{a.isActive ? "Shown to students" : "Hidden"}</span>
                </div>
                <div className="row">
                  <button
                    className="btn btn-outline btn-small"
                    onClick={() => {
                      const number = window.prompt(`New ${METHOD_LABELS[a.method]} account number`, a.accountNumber);
                      if (number?.trim()) update(a, { accountNumber: number.trim() });
                    }}
                  >
                    Change number
                  </button>
                  <button
                    className="btn btn-outline btn-small"
                    onClick={() => {
                      const title = window.prompt("Account title (name on the account)", a.accountTitle);
                      if (title?.trim()) update(a, { accountTitle: title.trim() });
                    }}
                  >
                    Change title
                  </button>
                  <button className="btn btn-outline btn-small" onClick={() => update(a, { isActive: !a.isActive })}>{a.isActive ? "Hide" : "Show"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Loaded>
      <form className="card" onSubmit={add}>
        <h2 className="card-title">Add an account</h2>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label htmlFor="a-method">Method</label>
            <select id="a-method" className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}>
              {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1 }}><label htmlFor="a-number">Account number</label><input id="a-number" className="input" required placeholder="0300-1234567" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="a-title">Account title</label><input id="a-title" className="input" required placeholder="Siraat tul Jannah Academy" value={form.accountTitle} onChange={(e) => setForm({ ...form, accountTitle: e.target.value })} /></div>
        <button className="btn" disabled={busy}>Add account</button>
      </form>
    </>
  );
}
