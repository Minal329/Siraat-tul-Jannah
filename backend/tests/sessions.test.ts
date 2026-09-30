import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
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
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

// A teacher with one group, two approved students and one student in another group.
async function classroom() {
  const course = await createCourse({ title: "Noorani Qaida" });
  const teacherUser = await createUser({ role: "TEACHER", fullName: "Ustadha Maryam" });
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
  const group = await prisma.classGroup.create({
    data: { courseId: course.id, teacherId: teacher.id, name: "Qaida — Batch 1", zoomPasscode: "quran" },
  });
  const otherGroup = await prisma.classGroup.create({ data: { courseId: course.id, name: "Qaida — Batch 2" } });

  async function student(fullName: string, classGroupId: string) {
    const user = await createUser({ role: "STUDENT", fullName });
    const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
    const enrollment = await prisma.enrollment.create({
      data: { studentId: profile.id, courseId: course.id, classGroupId, status: "APPROVED" },
    });
    return { user, id: profile.id, enrollmentId: enrollment.id };
  }

  return {
    course,
    group,
    otherGroup,
    teacherAuth: await bearer(app, teacherUser),
    ayesha: await student("Ayesha", group.id),
    hira: await student("Hira", group.id),
    outsider: await student("Zainab", otherGroup.id),
  };
}

async function pastSession(classGroupId: string, topic = "Lesson 4") {
  return prisma.classSession.create({ data: { classGroupId, topic, scheduledAt: new Date(Date.now() - 2 * HOUR) } });
}

describe("teacher: groups and scheduling", () => {
  it("shows a teacher only their own groups, with roster and Zoom details", async () => {
    const { group, teacherAuth } = await classroom();

    const list = await request(app).get("/api/v1/teacher/class-groups").set("Authorization", teacherAuth);
    const one = await request(app).get(`/api/v1/teacher/class-groups/${group.id}`).set("Authorization", teacherAuth);

    expect(list.body.data.classGroups).toEqual([expect.objectContaining({ name: "Qaida — Batch 1", studentCount: 2 })]);
    expect(one.body.data.classGroup).toMatchObject({ zoomPasscode: "quran" });
    expect(one.body.data.classGroup.students.map((s: { fullName: string }) => s.fullName)).toEqual(["Ayesha", "Hira"]);
  });

  it("hides other teachers' groups completely", async () => {
    const { otherGroup, teacherAuth } = await classroom();

    const res = await request(app).get(`/api/v1/teacher/class-groups/${otherGroup.id}`).set("Authorization", teacherAuth);
    const schedule = await request(app)
      .post(`/api/v1/teacher/class-groups/${otherGroup.id}/sessions`)
      .set("Authorization", teacherAuth)
      .send({ scheduledAt: at(24 * HOUR) });

    expect(res.status).toBe(404);
    expect(schedule.status).toBe(404);
  });

  it("schedules, reschedules and cancels a class", async () => {
    const { group, teacherAuth } = await classroom();

    const created = await request(app)
      .post(`/api/v1/teacher/class-groups/${group.id}/sessions`)
      .set("Authorization", teacherAuth)
      .send({ scheduledAt: "2027-01-15T20:00:00+05:00", topic: "Lesson 5 — Tanween" });
    const { id } = created.body.data.session;
    const moved = await request(app).patch(`/api/v1/teacher/sessions/${id}`).set("Authorization", teacherAuth).send({ scheduledAt: "2027-01-16T20:00:00+05:00" });
    const cancelled = await request(app).patch(`/api/v1/teacher/sessions/${id}`).set("Authorization", teacherAuth).send({ status: "CANCELLED" });

    expect(created.status).toBe(201);
    expect(created.body.data.session).toMatchObject({ scheduledAt: "2027-01-15T15:00:00.000Z", durationMinutes: 60, status: "SCHEDULED" });
    expect(moved.body.data.session.scheduledAt).toBe("2027-01-16T15:00:00.000Z");
    expect(cancelled.body.data.session.status).toBe("CANCELLED");
  });

  it("rejects times without a timezone and inactive groups", async () => {
    const { group, teacherAuth } = await classroom();

    const noZone = await request(app).post(`/api/v1/teacher/class-groups/${group.id}/sessions`).set("Authorization", teacherAuth).send({ scheduledAt: "2027-01-15 20:00" });
    await prisma.classGroup.update({ where: { id: group.id }, data: { isActive: false } });
    const inactive = await request(app).post(`/api/v1/teacher/class-groups/${group.id}/sessions`).set("Authorization", teacherAuth).send({ scheduledAt: at(HOUR) });

    expect(noZone.status).toBe(400);
    expect(inactive.body.error.code).toBe("GROUP_INACTIVE");
  });

  it("is for teachers and admins, not students; admins can act on any group", async () => {
    const { otherGroup, ayesha } = await classroom();
    const adminAuth = await bearer(app, await createUser({ role: "ADMIN" }));

    expect((await request(app).get("/api/v1/teacher/class-groups").set("Authorization", await bearer(app, ayesha.user))).status).toBe(403);
    const byAdmin = await request(app).post(`/api/v1/teacher/class-groups/${otherGroup.id}/sessions`).set("Authorization", adminAuth).send({ scheduledAt: at(HOUR) });
    expect(byAdmin.status).toBe(201);
  });
});

describe("teacher: attendance", () => {
  it("marks and then corrects attendance, recording which teacher marked it", async () => {
    const { group, teacherAuth, ayesha, hira } = await classroom();
    const session = await pastSession(group.id);
    const url = `/api/v1/teacher/sessions/${session.id}/attendance`;

    const first = await request(app).put(url).set("Authorization", teacherAuth).send({
      records: [{ studentId: ayesha.id, status: "PRESENT" }, { studentId: hira.id, status: "ABSENT" }],
    });
    const corrected = await request(app).put(url).set("Authorization", teacherAuth).send({
      records: [{ studentId: hira.id, status: "EXCUSED", note: "Was unwell" }],
    });

    expect(first.status).toBe(200);
    expect(corrected.body.data.students).toEqual([
      expect.objectContaining({ fullName: "Ayesha", status: "PRESENT" }),
      expect.objectContaining({ fullName: "Hira", status: "EXCUSED", note: "Was unwell" }),
    ]);
    expect(await prisma.attendance.count()).toBe(2);
    expect((await prisma.attendance.findFirstOrThrow()).markedById).not.toBeNull();
  });

  it("shows unmarked students as null so the teacher can see who's missing", async () => {
    const { group, teacherAuth } = await classroom();
    const session = await pastSession(group.id);

    const res = await request(app).get(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth);

    expect(res.body.data.students.map((s: { status: string | null }) => s.status)).toEqual([null, null]);
  });

  it("only marks students who are in this group", async () => {
    const { group, teacherAuth, outsider } = await classroom();
    const session = await pastSession(group.id);

    const res = await request(app).put(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth).send({
      records: [{ studentId: outsider.id, status: "PRESENT" }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "NOT_IN_GROUP", details: { studentIds: [outsider.id] } });
    expect(await prisma.attendance.count()).toBe(0);
  });

  it("won't mark a class that hasn't started or was cancelled", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const future = await prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(Date.now() + HOUR) } });
    const cancelled = await prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(Date.now() - HOUR), status: "CANCELLED" } });
    const body = { records: [{ studentId: ayesha.id, status: "PRESENT" }] };

    const early = await request(app).put(`/api/v1/teacher/sessions/${future.id}/attendance`).set("Authorization", teacherAuth).send(body);
    const off = await request(app).put(`/api/v1/teacher/sessions/${cancelled.id}/attendance`).set("Authorization", teacherAuth).send(body);

    expect(early.body.error.code).toBe("SESSION_NOT_STARTED");
    expect(off.body.error.code).toBe("SESSION_CANCELLED");
  });

  it("rejects the same student twice in one request", async () => {
    const { group, teacherAuth, ayesha } = await classroom();
    const session = await pastSession(group.id);

    const res = await request(app).put(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth).send({
      records: [{ studentId: ayesha.id, status: "PRESENT" }, { studentId: ayesha.id, status: "ABSENT" }],
    });

    expect(res.status).toBe(400);
  });

  it("won't let a teacher mark attendance in another teacher's class", async () => {
    const { otherGroup, teacherAuth, outsider } = await classroom();
    const session = await pastSession(otherGroup.id);

    const res = await request(app).put(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth).send({
      records: [{ studentId: outsider.id, status: "ABSENT" }],
    });

    expect(res.status).toBe(404);
    expect(await prisma.attendance.count()).toBe(0);
  });
});

describe("student: schedule and attendance", () => {
  it("shows upcoming classes for my groups only, soonest first, including one happening now", async () => {
    const { group, otherGroup, ayesha } = await classroom();
    await prisma.classSession.createMany({
      data: [
        { classGroupId: group.id, topic: "Tomorrow", scheduledAt: new Date(Date.now() + 24 * HOUR) },
        { classGroupId: group.id, topic: "Now", scheduledAt: new Date(Date.now() - 10 * 60_000) },
        { classGroupId: group.id, topic: "Yesterday", scheduledAt: new Date(Date.now() - 24 * HOUR) },
        { classGroupId: group.id, topic: "Cancelled", scheduledAt: new Date(Date.now() + 2 * HOUR), status: "CANCELLED" },
        { classGroupId: otherGroup.id, topic: "Not my group", scheduledAt: new Date(Date.now() + HOUR) },
      ],
    });

    const res = await request(app).get("/api/v1/enrollments/schedule").set("Authorization", await bearer(app, ayesha.user));

    expect(res.status).toBe(200);
    expect(res.body.data.sessions.map((s: { topic: string }) => s.topic)).toEqual(["Now", "Tomorrow"]);
    expect(res.body.data.sessions[0]).toMatchObject({ courseTitle: "Noorani Qaida", classGroup: { name: "Qaida — Batch 1" } });
  });

  it("shows my attendance with a summary rate (late counts as attending, excused doesn't count against me)", async () => {
    const { group, ayesha, hira } = await classroom();
    const marks = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
    for (const [i, status] of marks.entries()) {
      const s = await prisma.classSession.create({ data: { classGroupId: group.id, scheduledAt: new Date(Date.now() - (i + 1) * 24 * HOUR) } });
      await prisma.attendance.create({ data: { classSessionId: s.id, studentId: ayesha.id, status } });
      await prisma.attendance.create({ data: { classSessionId: s.id, studentId: hira.id, status: "PRESENT" } });
    }
    await pastSession(group.id, "Not marked yet");

    const res = await request(app).get(`/api/v1/enrollments/${ayesha.enrollmentId}/attendance`).set("Authorization", await bearer(app, ayesha.user));

    expect(res.body.data.summary).toEqual({ classes: 5, present: 1, late: 1, absent: 1, excused: 1, notMarked: 1, attendanceRate: 67 });
  });

  it("won't show another student's attendance", async () => {
    const { ayesha, hira } = await classroom();

    const res = await request(app).get(`/api/v1/enrollments/${hira.enrollmentId}/attendance`).set("Authorization", await bearer(app, ayesha.user));

    expect(res.status).toBe(404);
  });
});
