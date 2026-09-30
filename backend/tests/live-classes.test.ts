import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { env } from "../src/config/env.ts";
import { prisma } from "../src/lib/prisma.ts";
import { clearZoomTokenCache } from "../src/lib/zoom.ts";
import { bearer } from "./helpers/auth.ts";
import { createCourse, createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;

// A teacher with one group (Zoom + WhatsApp set up), an approved student, a pending one,
// and a student in another group.
async function classroom() {
  const course = await createCourse({ title: "Noorani Qaida" });
  const teacherUser = await createUser({ role: "TEACHER", fullName: "Ustadha Maryam" });
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
  const group = await prisma.classGroup.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      name: "Qaida — Batch 1",
      zoomMeetingId: "123 456 7890",
      zoomPasscode: "quran",
      whatsappGroupLink: "https://chat.whatsapp.com/abc123",
    },
  });
  const otherGroup = await prisma.classGroup.create({ data: { courseId: course.id, name: "Qaida — Batch 2" } });

  async function student(fullName: string, classGroupId: string | null, status: "APPROVED" | "PENDING" = "APPROVED") {
    const user = await createUser({ role: "STUDENT", fullName });
    const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
    const enrollment = await prisma.enrollment.create({ data: { studentId: profile.id, courseId: course.id, classGroupId, status } });
    return { id: profile.id, enrollmentId: enrollment.id, auth: await bearer(app, user) };
  }

  return {
    course,
    group,
    otherGroup,
    teacherAuth: await bearer(app, teacherUser),
    ayesha: await student("Ayesha", group.id),
    pending: await student("Hira", null, "PENDING"),
    outsider: await student("Zainab", otherGroup.id),
  };
}

const sessionAt = (classGroupId: string, offsetMs: number, topic = "Lesson 5") =>
  prisma.classSession.create({ data: { classGroupId, topic, scheduledAt: new Date(Date.now() + offsetMs) } });

describe("teacher: starting, switching and ending a live class", () => {
  it("goes live, lets students join, and shows the teacher who joined", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const session = await sessionAt(group.id, 10 * 60 * 1000); // starts in 10 minutes — starting early is fine

    const before = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", ayesha.auth);
    expect(before.body.data).toEqual({ session: null, joinedAt: null });

    const started = await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({});
    expect(started.status).toBe(200);
    expect(started.body.data.session).toMatchObject({ status: "LIVE", livePlatform: "ZOOM", startedAt: expect.any(String) });

    const live = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", ayesha.auth);
    expect(live.body.data.session).toMatchObject({ id: session.id, status: "LIVE", topic: "Lesson 5" });

    const join = await request(app)
      .post(`/api/v1/enrollments/${ayesha.enrollmentId}/live/join`)
      .set("Authorization", ayesha.auth)
      .send({ platform: "ZOOM" });
    expect(join.status).toBe(200);
    expect(join.body.data.joinUrl).toBe("https://zoom.us/j/1234567890");

    // Joining again (e.g. after a dropped connection) keeps the first time.
    const again = await request(app)
      .post(`/api/v1/enrollments/${ayesha.enrollmentId}/live/join`)
      .set("Authorization", ayesha.auth)
      .send({ platform: "WHATSAPP" });
    expect(again.body.data.joinedAt).toBe(join.body.data.joinedAt);

    const roster = await request(app).get(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth);
    expect(roster.body.data.students).toEqual([
      expect.objectContaining({ fullName: "Ayesha", joinedAt: join.body.data.joinedAt, joinedVia: "ZOOM", status: null }),
    ]);

    // A class started early can be marked straight away.
    const marked = await request(app)
      .put(`/api/v1/teacher/sessions/${session.id}/attendance`)
      .set("Authorization", teacherAuth)
      .send({ records: [{ studentId: ayesha.id, status: "PRESENT" }] });
    expect(marked.status).toBe(200);
  });

  it("switches to WhatsApp with a note for students when Zoom fails", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const session = await sessionAt(group.id, 0);
    await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({ platform: "ZOOM" });

    const switched = await request(app)
      .patch(`/api/v1/teacher/sessions/${session.id}/live`)
      .set("Authorization", teacherAuth)
      .send({ platform: "WHATSAPP", note: "Zoom is down — join the WhatsApp call" });
    expect(switched.body.data.session).toMatchObject({ livePlatform: "WHATSAPP", liveNote: "Zoom is down — join the WhatsApp call" });

    const live = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", ayesha.auth);
    expect(live.body.data.session).toMatchObject({ livePlatform: "WHATSAPP", liveNote: "Zoom is down — join the WhatsApp call" });

    const join = await request(app)
      .post(`/api/v1/enrollments/${ayesha.enrollmentId}/live/join`)
      .set("Authorization", ayesha.auth)
      .send({ platform: "WHATSAPP" });
    expect(join.body.data.joinUrl).toBe("https://chat.whatsapp.com/abc123");
  });

  it("ends a class: it's no longer live and joining is refused", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const session = await sessionAt(group.id, 0);
    await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({});

    const ended = await request(app).post(`/api/v1/teacher/sessions/${session.id}/end`).set("Authorization", teacherAuth);
    expect(ended.body.data.session).toMatchObject({ status: "COMPLETED", endedAt: expect.any(String) });

    const live = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", ayesha.auth);
    expect(live.body.data.session).toBeNull();
    const join = await request(app)
      .post(`/api/v1/enrollments/${ayesha.enrollmentId}/live/join`)
      .set("Authorization", ayesha.auth)
      .send({ platform: "ZOOM" });
    expect(join.status).toBe(409);
    expect(join.body.error.code).toBe("SESSION_NOT_LIVE");

    const endAgain = await request(app).post(`/api/v1/teacher/sessions/${session.id}/end`).set("Authorization", teacherAuth);
    expect(endAgain.status).toBe(409);
  });

  it("refuses to start too early, a cancelled class, or another teacher's class", async () => {
    const { group, otherGroup, teacherAuth } = await classroom();
    const tomorrow = await sessionAt(group.id, 24 * HOUR);
    const cancelled = await prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(), status: "CANCELLED" } });
    const notMine = await sessionAt(otherGroup.id, 0);

    const early = await request(app).post(`/api/v1/teacher/sessions/${tomorrow.id}/start`).set("Authorization", teacherAuth).send({});
    const cancel = await request(app).post(`/api/v1/teacher/sessions/${cancelled.id}/start`).set("Authorization", teacherAuth).send({});
    const other = await request(app).post(`/api/v1/teacher/sessions/${notMine.id}/start`).set("Authorization", teacherAuth).send({});

    expect([early.status, early.body.error.code]).toEqual([409, "TOO_EARLY"]);
    expect([cancel.status, cancel.body.error.code]).toEqual([409, "SESSION_NOT_STARTABLE"]);
    expect(other.status).toBe(404);
  });

  it("starting a new class ends one the teacher forgot to end", async () => {
    const { group, teacherAuth } = await classroom();
    const yesterday = await sessionAt(group.id, -24 * HOUR, "Lesson 4");
    const today = await sessionAt(group.id, 0);
    await request(app).post(`/api/v1/teacher/sessions/${yesterday.id}/start`).set("Authorization", teacherAuth).send({});

    await request(app).post(`/api/v1/teacher/sessions/${today.id}/start`).set("Authorization", teacherAuth).send({});

    const old = await prisma.classSession.findUniqueOrThrow({ where: { id: yesterday.id } });
    expect(old.status).toBe("COMPLETED");
    expect(old.endedAt).not.toBeNull();
  });

  it("the database allows only one live class per group", async () => {
    const { group } = await classroom();
    await prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(), status: "LIVE", startedAt: new Date() } });

    await expect(
      prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(), status: "LIVE", startedAt: new Date() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("a class left live for hours stops showing as live to students", async () => {
    const { group, ayesha } = await classroom();
    await prisma.classSession.create({
      data: { classGroupId: group.id, scheduledAt: new Date(Date.now() - 8 * HOUR), status: "LIVE", startedAt: new Date(Date.now() - 7 * HOUR) },
    });

    const live = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", ayesha.auth);
    const schedule = await request(app).get("/api/v1/enrollments/schedule").set("Authorization", ayesha.auth);
    expect(live.body.data.session).toBeNull();
    expect(schedule.body.data.sessions).toEqual([]);
  });

  it("keeps an over-running live class in the student's schedule", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const session = await prisma.classSession.create({
      data: { classGroupId: group.id, scheduledAt: new Date(Date.now() - 50 * 60 * 1000), durationMinutes: 30 },
    });
    await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({});

    const schedule = await request(app).get("/api/v1/enrollments/schedule").set("Authorization", ayesha.auth);
    expect(schedule.body.data.sessions).toEqual([expect.objectContaining({ id: session.id, status: "LIVE" })]);
  });

  it("only start/end change a class to live or completed", async () => {
    const { group, teacherAuth } = await classroom();
    const session = await sessionAt(group.id, 0);

    const toLive = await request(app).patch(`/api/v1/teacher/sessions/${session.id}`).set("Authorization", teacherAuth).send({ status: "LIVE" });
    expect(toLive.status).toBe(400);

    await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({});
    const cancelLive = await request(app)
      .patch(`/api/v1/teacher/sessions/${session.id}`)
      .set("Authorization", teacherAuth)
      .send({ status: "CANCELLED" });
    expect([cancelLive.status, cancelLive.body.error.code]).toEqual([409, "SESSION_LIVE"]);
  });
});

describe("students: who may see and join a live class", () => {
  it("refuses students who aren't approved into the group, and other students' enrollments", async () => {
    const { group, teacherAuth, ayesha, pending, outsider } = await classroom();
    const session = await sessionAt(group.id, 0);
    await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({});

    const notYet = await request(app).get(`/api/v1/enrollments/${pending.enrollmentId}/live`).set("Authorization", pending.auth);
    expect([notYet.status, notYet.body.error.code]).toEqual([409, "NOT_IN_CLASS"]);

    const someoneElses = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/live`).set("Authorization", outsider.auth);
    expect(someoneElses.status).toBe(404);

    // The other group's student sees nothing live in their own group.
    const own = await request(app).get(`/api/v1/enrollments/${outsider.enrollmentId}/live`).set("Authorization", outsider.auth);
    expect(own.body.data.session).toBeNull();
  });

  it("explains when the teacher hasn't added a link for that platform", async () => {
    const { otherGroup, outsider } = await classroom(); // Batch 2 has no Zoom or WhatsApp yet
    await prisma.classSession.create({ data: { classGroupId: otherGroup.id, scheduledAt: new Date(), status: "LIVE", startedAt: new Date() } });

    const join = await request(app)
      .post(`/api/v1/enrollments/${outsider.enrollmentId}/live/join`)
      .set("Authorization", outsider.auth)
      .send({ platform: "ZOOM" });
    expect([join.status, join.body.error.code]).toEqual([409, "NO_JOIN_LINK"]);
    expect(await prisma.sessionJoin.count()).toBe(0);
  });
});

describe("admin: creating Zoom meetings through the Zoom API", () => {
  const saved = { account: env.ZOOM_ACCOUNT_ID, id: env.ZOOM_CLIENT_ID, secret: env.ZOOM_CLIENT_SECRET };
  function connectZoom() {
    env.ZOOM_ACCOUNT_ID = "acct";
    env.ZOOM_CLIENT_ID = "client";
    env.ZOOM_CLIENT_SECRET = "secret";
  }
  afterEach(() => {
    env.ZOOM_ACCOUNT_ID = saved.account;
    env.ZOOM_CLIENT_ID = saved.id;
    env.ZOOM_CLIENT_SECRET = saved.secret;
    clearZoomTokenCache();
    vi.restoreAllMocks();
  });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function admin() {
    return bearer(app, await createUser({ role: "ADMIN" }));
  }

  it("says so when Zoom isn't connected", async () => {
    const { group } = await classroom();
    const auth = await admin();

    const status = await request(app).get("/api/v1/admin/class-groups/zoom-status").set("Authorization", auth);
    const create = await request(app).post(`/api/v1/admin/class-groups/${group.id}/zoom-meeting`).set("Authorization", auth);

    expect(status.body.data).toEqual({ zoomConfigured: false });
    expect([create.status, create.body.error.code]).toEqual([503, "ZOOM_NOT_CONFIGURED"]);
  });

  it("creates a meeting, saves its link, and students get that link", async () => {
    connectZoom();
    const { group, ayesha } = await classroom();
    const auth = await admin();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).startsWith("https://zoom.us/oauth/token")) return json(200, { access_token: "tok", expires_in: 3600 });
      return json(201, { id: 98765432101, password: "abc123", join_url: "https://us06web.zoom.us/j/98765432101?pwd=xyz" });
    });

    const first = await request(app).post(`/api/v1/admin/class-groups/${group.id}/zoom-meeting`).set("Authorization", auth);
    await request(app).post(`/api/v1/admin/class-groups/${group.id}/zoom-meeting`).set("Authorization", auth);

    expect(first.status).toBe(200);
    expect(first.body.data.classGroup).toMatchObject({
      zoomMeetingId: "98765432101",
      zoomPasscode: "abc123",
      zoomJoinUrl: "https://us06web.zoom.us/j/98765432101?pwd=xyz",
    });
    // The login token is reused: one token request for two meetings.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://zoom.us/oauth/token"))).toHaveLength(1);
    const [meetingUrl, meetingInit] = fetchMock.mock.calls[1];
    expect(meetingUrl).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect((meetingInit!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(meetingInit!.body))).toMatchObject({ topic: "Noorani Qaida — Qaida — Batch 1", type: 3 });

    const mine = await request(app).get("/api/v1/enrollments/mine").set("Authorization", ayesha.auth);
    expect(mine.body.data.enrollments[0].classGroup.zoomJoinUrl).toBe("https://us06web.zoom.us/j/98765432101?pwd=xyz");
  });

  it("typing a meeting ID by hand replaces the saved Zoom link", async () => {
    const { group } = await classroom();
    await prisma.classGroup.update({ where: { id: group.id }, data: { zoomJoinUrl: "https://us06web.zoom.us/j/1?pwd=x" } });

    const res = await request(app)
      .patch(`/api/v1/admin/class-groups/${group.id}`)
      .set("Authorization", await admin())
      .send({ zoomMeetingId: "555 666 7777" });

    expect(res.body.data.classGroup).toMatchObject({ zoomMeetingId: "555 666 7777", zoomJoinUrl: null });
  });

  it("reports a Zoom failure clearly and keeps the old details", async () => {
    connectZoom();
    const { group } = await classroom();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { reason: "Invalid client_id or client_secret" }));

    const res = await request(app).post(`/api/v1/admin/class-groups/${group.id}/zoom-meeting`).set("Authorization", await admin());

    expect([res.status, res.body.error.code]).toEqual([502, "ZOOM_ERROR"]);
    expect((await prisma.classGroup.findUniqueOrThrow({ where: { id: group.id } })).zoomMeetingId).toBe("123 456 7890");
  });

  it("is admin-only", async () => {
    const { group, teacherAuth } = await classroom();
    const res = await request(app).post(`/api/v1/admin/class-groups/${group.id}/zoom-meeting`).set("Authorization", teacherAuth);
    expect(res.status).toBe(403);
  });
});
