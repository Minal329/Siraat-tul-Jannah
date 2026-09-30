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

async function setup(options: { maxStudents?: number; paid?: boolean } = {}) {
  const course = await createCourse({ title: "Tajweed" });
  const group = await prisma.classGroup.create({
    data: {
      courseId: course.id, name: "Tajweed — Batch 1", maxStudents: options.maxStudents ?? null,
      whatsappGroupLink: "https://chat.whatsapp.com/abc123",
    },
  });
  return { course, group, enrollment: await pendingEnrollment(course.id, options.paid ?? true) };
}

async function pendingEnrollment(courseId: string, paid = true) {
  const user = await createUser({ role: "STUDENT", fullName: "Ayesha Siddiqui" });
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
  const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, courseId } });
  if (paid) {
    await prisma.payment.create({
      data: { enrollmentId: enrollment.id, method: "EASYPAISA", amountPkr: 3000, proofImageUrl: "x", status: "VERIFIED" },
    });
  }
  return { ...enrollment, user };
}

const post = (path: string, body: object = {}) =>
  request(app).post(`/api/v1/admin/enrollments${path}`).set("Authorization", adminAuth).send(body);

describe("approval queue", () => {
  it("lists pending applications oldest first, with student contact and payment status", async () => {
    const { course } = await setup();
    await pendingEnrollment(course.id, false);

    const res = await request(app).get("/api/v1/admin/enrollments?status=PENDING").set("Authorization", adminAuth);

    expect(res.status).toBe(200);
    expect(res.body.data.enrollments.map((e: { hasVerifiedPayment: boolean }) => e.hasVerifiedPayment)).toEqual([true, false]);
    expect(res.body.data.enrollments[0]).toMatchObject({
      status: "PENDING",
      student: { fullName: "Ayesha Siddiqui", email: expect.stringContaining("@") },
      course: { title: "Tajweed" },
    });
  });

  it("is admin-only", async () => {
    const { enrollment } = await setup();
    const studentAuth = await bearer(app, enrollment.user);

    expect((await request(app).get("/api/v1/admin/enrollments").set("Authorization", studentAuth)).status).toBe(403);
  });
});

describe("approve", () => {
  it("approves into a class group, recording who approved and when; the student then gets the WhatsApp link", async () => {
    const { group, enrollment } = await setup();

    const res = await post(`/${enrollment.id}/approve`, { classGroupId: group.id });

    expect(res.status).toBe(200);
    expect(res.body.data.enrollment).toMatchObject({ status: "APPROVED", classGroup: { id: group.id } });
    const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(row.approvedById).not.toBeNull();
    expect(row.approvedAt).not.toBeNull();

    const mine = await request(app).get("/api/v1/enrollments/mine").set("Authorization", await bearer(app, enrollment.user));
    expect(mine.body.data.enrollments[0].classGroup.whatsappGroupLink).toBe("https://chat.whatsapp.com/abc123");
  });

  it("refuses without a verified payment unless the admin says so on purpose", async () => {
    const { group, enrollment } = await setup({ paid: false });

    const refused = await post(`/${enrollment.id}/approve`, { classGroupId: group.id });
    const scholarship = await post(`/${enrollment.id}/approve`, { classGroupId: group.id, approveWithoutPayment: true });

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("PAYMENT_NOT_VERIFIED");
    expect(scholarship.status).toBe(200);
  });

  it("refuses a group from another course, an inactive group, or a full group", async () => {
    const { course, group, enrollment } = await setup({ maxStudents: 1 });
    const otherCourse = await createCourse();
    const wrongCourse = await prisma.classGroup.create({ data: { courseId: otherCourse.id, name: "Other" } });
    const inactive = await prisma.classGroup.create({ data: { courseId: course.id, name: "Old", isActive: false } });
    await post(`/${enrollment.id}/approve`, { classGroupId: group.id });
    const second = await pendingEnrollment(course.id);

    expect((await post(`/${second.id}/approve`, { classGroupId: wrongCourse.id })).body.error.code).toBe("INVALID_CLASS_GROUP");
    expect((await post(`/${second.id}/approve`, { classGroupId: inactive.id })).body.error.code).toBe("INVALID_CLASS_GROUP");
    const full = await post(`/${second.id}/approve`, { classGroupId: group.id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("GROUP_FULL");
  });

  it("never overfills a group when two admins approve different students at the same moment", async () => {
    const { course, group, enrollment: first } = await setup({ maxStudents: 1 });
    const second = await pendingEnrollment(course.id);

    const results = await Promise.all([
      post(`/${first.id}/approve`, { classGroupId: group.id }),
      post(`/${second.id}/approve`, { classGroupId: group.id }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.enrollment.count({ where: { classGroupId: group.id, status: "APPROVED" } })).toBe(1);
  });

  it("can't approve twice", async () => {
    const { group, enrollment } = await setup();
    await post(`/${enrollment.id}/approve`, { classGroupId: group.id });

    const again = await post(`/${enrollment.id}/approve`, { classGroupId: group.id });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("NOT_PENDING");
  });
});

describe("reject, move, complete", () => {
  it("rejects with a reason the student can see", async () => {
    const { enrollment } = await setup();

    const noReason = await post(`/${enrollment.id}/reject`, {});
    const res = await post(`/${enrollment.id}/reject`, { reason: "This batch is for sisters only." });

    expect(noReason.status).toBe(400);
    expect(res.body.data.enrollment).toMatchObject({ status: "REJECTED", rejectionReason: "This batch is for sisters only." });
  });

  it("moves an approved student to another group of the same course, respecting capacity", async () => {
    const { course, group, enrollment } = await setup();
    await post(`/${enrollment.id}/approve`, { classGroupId: group.id });
    const evening = await prisma.classGroup.create({ data: { courseId: course.id, name: "Evening", maxStudents: 1 } });
    const other = await pendingEnrollment(course.id);

    const moved = await post(`/${enrollment.id}/move`, { classGroupId: evening.id });
    await post(`/${other.id}/approve`, { classGroupId: group.id });
    const full = await post(`/${other.id}/move`, { classGroupId: evening.id });

    expect(moved.body.data.enrollment.classGroup.id).toBe(evening.id);
    expect(full.body.error.code).toBe("GROUP_FULL");
  });

  it("only moves approved students", async () => {
    const { group, enrollment } = await setup();

    expect((await post(`/${enrollment.id}/move`, { classGroupId: group.id })).body.error.code).toBe("NOT_APPROVED");
  });

  it("marks a course completed, after which the student may enroll in a new batch", async () => {
    const { course, group, enrollment } = await setup();
    await post(`/${enrollment.id}/approve`, { classGroupId: group.id });

    const res = await post(`/${enrollment.id}/complete`);
    const reEnroll = await request(app)
      .post("/api/v1/enrollments")
      .set("Authorization", await bearer(app, enrollment.user))
      .send({ courseId: course.id });

    expect(res.body.data.enrollment.status).toBe("COMPLETED");
    expect(reEnroll.status).toBe(201);
  });

  it("can't complete a pending application", async () => {
    const { enrollment } = await setup();

    expect((await post(`/${enrollment.id}/complete`)).body.error.code).toBe("NOT_APPROVED");
  });

  it("answers 404 for unknown enrollments", async () => {
    await setup();

    expect((await post(`/${crypto.randomUUID()}/reject`, { reason: "Not found" })).status).toBe(404);
  });
});
