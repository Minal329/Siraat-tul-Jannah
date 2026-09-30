import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { bearer } from "./helpers/auth.ts";
import { createCourse, createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();
let adminAuth = "";

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  adminAuth = await bearer(app, await createUser({ role: "ADMIN" }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function teacher(fullName = "Ustadha Maryam") {
  const user = await createUser({ role: "TEACHER", fullName });
  return prisma.teacher.findUniqueOrThrow({ where: { userId: user.id } });
}

const create = (body: object) => request(app).post("/api/v1/admin/class-groups").set("Authorization", adminAuth).send(body);
const update = (id: string, body: object) =>
  request(app).patch(`/api/v1/admin/class-groups/${id}`).set("Authorization", adminAuth).send(body);

describe("admin class groups", () => {
  it("creates a batch with a teacher, schedule, capacity and links", async () => {
    const course = await createCourse({ title: "Tajweed" });
    const maryam = await teacher();

    const res = await create({
      courseId: course.id, teacherId: maryam.id, name: "Tajweed — Batch 2 — Evening", batchLabel: "Batch 2",
      scheduleText: "Mon/Wed/Fri 8–9 pm PKT", startDate: "2027-01-10", endDate: "2027-04-30", maxStudents: 10,
      zoomMeetingId: "123 456 7890", zoomPasscode: "quran", whatsappGroupLink: "https://chat.whatsapp.com/xyz",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.classGroup).toMatchObject({
      name: "Tajweed — Batch 2 — Evening",
      startDate: "2027-01-10T00:00:00.000Z",
      maxStudents: 10,
      studentCount: 0,
      isActive: true,
      course: { title: "Tajweed" },
      teacher: { fullName: "Ustadha Maryam" },
    });
  });

  it("validates dates, WhatsApp links, the course and the teacher", async () => {
    const course = await createCourse();

    const backwards = await create({ courseId: course.id, name: "Batch", startDate: "2027-05-01", endDate: "2027-01-01" });
    const notWhatsapp = await create({ courseId: course.id, name: "Batch", whatsappGroupLink: "https://evil.example/join" });
    const noCourse = await create({ courseId: crypto.randomUUID(), name: "Batch" });
    const noTeacher = await create({ courseId: course.id, name: "Batch", teacherId: crypto.randomUUID() });

    expect(backwards.status).toBe(400);
    expect(notWhatsapp.status).toBe(400);
    expect(noCourse.body.error.code).toBe("INVALID_COURSE");
    expect(noTeacher.body.error.code).toBe("INVALID_TEACHER");
    expect(await prisma.classGroup.count()).toBe(0);
  });

  it("won't assign a teacher whose account is disabled", async () => {
    const course = await createCourse();
    const maryam = await teacher();
    await prisma.user.update({ where: { id: maryam.userId }, data: { isActive: false } });

    expect((await create({ courseId: course.id, name: "Batch", teacherId: maryam.id })).body.error.code).toBe("INVALID_TEACHER");
  });

  it("edits a group, checking dates against the values already saved", async () => {
    const course = await createCourse();
    const { id } = (await create({ courseId: course.id, name: "Batch", startDate: "2027-03-01" })).body.data.classGroup;
    const fatima = await teacher("Ustadha Fatima");

    const badEnd = await update(id, { endDate: "2027-02-01" });
    const ok = await update(id, { teacherId: fatima.id, isActive: false });

    expect(badEnd.body.error.code).toBe("INVALID_DATES");
    expect(ok.body.data.classGroup).toMatchObject({ teacher: { fullName: "Ustadha Fatima" }, isActive: false, startDate: "2027-03-01T00:00:00.000Z" });
  });

  it("won't shrink capacity below the students already in the group", async () => {
    const course = await createCourse();
    const group = await prisma.classGroup.create({ data: { courseId: course.id, name: "Batch" } });
    for (let i = 0; i < 2; i++) {
      const user = await createUser({ role: "STUDENT" });
      const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
      await prisma.enrollment.create({ data: { studentId: student.id, courseId: course.id, classGroupId: group.id, status: "APPROVED" } });
    }

    const res = await update(group.id, { maxStudents: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("GROUP_TOO_SMALL");
  });

  it("lists groups by course and shows a group's roster", async () => {
    const course = await createCourse();
    const other = await createCourse();
    const group = await prisma.classGroup.create({ data: { courseId: course.id, name: "Batch 1" } });
    await prisma.classGroup.create({ data: { courseId: other.id, name: "Other course batch" } });
    const user = await createUser({ role: "STUDENT", fullName: "Hira Malik" });
    const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
    await prisma.enrollment.create({ data: { studentId: student.id, courseId: course.id, classGroupId: group.id, status: "APPROVED" } });

    const list = await request(app).get(`/api/v1/admin/class-groups?courseId=${course.id}`).set("Authorization", adminAuth);
    const one = await request(app).get(`/api/v1/admin/class-groups/${group.id}`).set("Authorization", adminAuth);

    expect(list.body.data.classGroups).toHaveLength(1);
    expect(list.body.data.classGroups[0].studentCount).toBe(1);
    expect(one.body.data.classGroup.students).toEqual([expect.objectContaining({ fullName: "Hira Malik" })]);
  });

  it("is admin-only", async () => {
    const course = await createCourse();
    const teacherAuth = await bearer(app, await createUser({ role: "TEACHER" }));

    const res = await request(app)
      .post("/api/v1/admin/class-groups")
      .set("Authorization", teacherAuth)
      .send({ courseId: course.id, name: "Sneaky batch" });

    expect(res.status).toBe(403);
  });
});
