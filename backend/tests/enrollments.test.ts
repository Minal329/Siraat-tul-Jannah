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

async function student() {
  const user = await createUser({ role: "STUDENT" });
  const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
  return { user, studentId: profile.id, auth: await bearer(app, user) };
}

const enroll = (auth: string, courseId: string) =>
  request(app).post("/api/v1/enrollments").set("Authorization", auth).send({ courseId });

describe("POST /enrollments", () => {
  it("lets a student apply for a published course", async () => {
    const { auth, studentId } = await student();
    const course = await createCourse({ title: "Tajweed", feePkr: 3000 });

    const res = await enroll(auth, course.id);

    expect(res.status).toBe(201);
    expect(res.body.data.enrollment).toMatchObject({
      status: "PENDING",
      course: { id: course.id, title: "Tajweed", feePkr: 3000 },
      classGroup: null,
    });
    expect(await prisma.enrollment.count({ where: { studentId } })).toBe(1);
  });

  it("refuses a second active enrollment in the same course", async () => {
    const { auth } = await student();
    const course = await createCourse();
    await enroll(auth, course.id);

    const again = await enroll(auth, course.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ENROLLMENT_EXISTS");
  });

  it("holds the rule even when two requests arrive at the same moment (double-tap)", async () => {
    const { auth, studentId } = await student();
    const course = await createCourse();

    const results = await Promise.all(Array.from({ length: 5 }, () => enroll(auth, course.id)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.enrollment.count({ where: { studentId } })).toBe(1);
  });

  it("allows several different courses at once", async () => {
    const { auth } = await student();
    const [qaida, tajweed] = [await createCourse(), await createCourse()];

    expect((await enroll(auth, qaida.id)).status).toBe(201);
    expect((await enroll(auth, tajweed.id)).status).toBe(201);
  });

  it("allows re-enrolling in a new batch once the previous enrollment is completed", async () => {
    const { auth, studentId } = await student();
    const course = await createCourse();
    await prisma.enrollment.create({ data: { studentId, courseId: course.id, status: "COMPLETED" } });

    expect((await enroll(auth, course.id)).status).toBe(201);
  });

  it("allows applying again after a rejection or cancellation", async () => {
    const { auth, studentId } = await student();
    const course = await createCourse();
    await prisma.enrollment.createMany({
      data: [
        { studentId, courseId: course.id, status: "REJECTED" },
        { studentId, courseId: course.id, status: "CANCELLED" },
      ],
    });

    expect((await enroll(auth, course.id)).status).toBe(201);
  });

  it("does not allow enrolling in unpublished or unknown courses", async () => {
    const { auth } = await student();
    const draft = await createCourse({ isPublished: false });

    expect((await enroll(auth, draft.id)).status).toBe(404);
    expect((await enroll(auth, crypto.randomUUID())).status).toBe(404);
    expect((await enroll(auth, "not-a-uuid")).status).toBe(400);
  });

  it("is for students only", async () => {
    const course = await createCourse();
    const teacherAuth = await bearer(app, await createUser({ role: "TEACHER" }));

    expect((await enroll(teacherAuth, course.id)).status).toBe(403);
    expect((await request(app).post("/api/v1/enrollments").send({ courseId: course.id })).status).toBe(401);
  });
});

describe("GET /enrollments/mine", () => {
  it("shows my enrollments, newest first, with class group and certificate — and nobody else's", async () => {
    const me = await student();
    const other = await student();
    const [qaida, tajweed] = [await createCourse({ title: "Noorani Qaida" }), await createCourse({ title: "Tajweed" })];
    const group = await prisma.classGroup.create({
      data: { courseId: qaida.id, name: "Batch 0", scheduleText: "Mon 8pm", zoomPasscode: "secret" },
    });
    const done = await prisma.enrollment.create({
      data: { studentId: me.studentId, courseId: qaida.id, classGroupId: group.id, status: "COMPLETED" },
    });
    await prisma.certificate.create({ data: { enrollmentId: done.id, certificateNumber: "STJ-TEST-1" } });
    await enroll(me.auth, tajweed.id);
    await enroll(other.auth, tajweed.id);

    const res = await request(app).get("/api/v1/enrollments/mine").set("Authorization", me.auth);

    expect(res.status).toBe(200);
    const list = res.body.data.enrollments;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ status: "PENDING", course: { title: "Tajweed" } });
    expect(list[1]).toMatchObject({
      status: "COMPLETED",
      classGroup: { name: "Batch 0", scheduleText: "Mon 8pm" },
      certificate: { certificateNumber: "STJ-TEST-1" },
    });
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});

describe("POST /enrollments/:id/cancel", () => {
  it("withdraws a pending application, after which the student may apply again", async () => {
    const { auth } = await student();
    const course = await createCourse();
    const { id } = (await enroll(auth, course.id)).body.data.enrollment;

    const res = await request(app).post(`/api/v1/enrollments/${id}/cancel`).set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.enrollment.status).toBe("CANCELLED");
    expect((await enroll(auth, course.id)).status).toBe(201);
  });

  it("cannot cancel an approved enrollment", async () => {
    const { auth, studentId } = await student();
    const course = await createCourse();
    const approved = await prisma.enrollment.create({ data: { studentId, courseId: course.id, status: "APPROVED" } });

    const res = await request(app).post(`/api/v1/enrollments/${approved.id}/cancel`).set("Authorization", auth);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CANNOT_CANCEL");
  });

  it("cannot touch another student's enrollment (looks like it doesn't exist)", async () => {
    const owner = await student();
    const intruder = await student();
    const course = await createCourse();
    const { id } = (await enroll(owner.auth, course.id)).body.data.enrollment;

    const res = await request(app).post(`/api/v1/enrollments/${id}/cancel`).set("Authorization", intruder.auth);

    expect(res.status).toBe(404);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });
});
