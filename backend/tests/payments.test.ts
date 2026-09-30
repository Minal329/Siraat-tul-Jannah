import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { detectImageType } from "../src/middleware/upload.ts";
import { bearer } from "./helpers/auth.ts";
import { createCourse, createUser, resetDatabase } from "./helpers/db.ts";

let app = createApp();

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
});

afterAll(async () => {
  await rm(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  await prisma.$disconnect();
});

// Tiny but real image headers followed by filler bytes.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

async function studentWithEnrollment(status: "PENDING" | "APPROVED" | "CANCELLED" | "COMPLETED" = "PENDING") {
  const user = await createUser({ role: "STUDENT", fullName: "Ayesha Siddiqui" });
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
  const course = await createCourse({ title: "Tajweed", feePkr: 3000 });
  const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, courseId: course.id, status } });
  return { user, auth: await bearer(app, user), enrollment };
}

async function adminAuth() {
  return bearer(app, await createUser({ role: "ADMIN" }));
}

function upload(auth: string, enrollmentId: string, file: Buffer | null = PNG, fields: Record<string, string> = {}) {
  let req = request(app)
    .post(`/api/v1/enrollments/${enrollmentId}/payments`)
    .set("Authorization", auth)
    .field("method", fields.method ?? "EASYPAISA")
    .field("amountPkr", fields.amountPkr ?? "3000")
    .field("transactionId", fields.transactionId ?? "TID-12345");
  if (file) req = req.attach("proof", file, { filename: "screenshot.png", contentType: "image/png" });
  return req;
}

describe("payment accounts", () => {
  it("shows logged-in users the active accounts only", async () => {
    await prisma.paymentAccount.createMany({
      data: [
        { method: "EASYPAISA", accountTitle: "Siraat tul Jannah", accountNumber: "0300-1111111" },
        { method: "JAZZCASH", accountTitle: "Old account", accountNumber: "0301-2222222", isActive: false },
      ],
    });
    const { auth } = await studentWithEnrollment();

    const res = await request(app).get("/api/v1/payment-accounts").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.accounts).toEqual([
      expect.objectContaining({ method: "EASYPAISA", accountNumber: "0300-1111111" }),
    ]);
    expect((await request(app).get("/api/v1/payment-accounts")).status).toBe(401);
  });

  it("lets admins add, edit and deactivate accounts, recording who changed them", async () => {
    const auth = await adminAuth();

    const created = await request(app)
      .post("/api/v1/admin/payment-accounts")
      .set("Authorization", auth)
      .send({ method: "JAZZCASH", accountTitle: "Siraat tul Jannah", accountNumber: "0301-1234567" });
    expect(created.status).toBe(201);
    const { id } = created.body.data.account;

    const edited = await request(app)
      .patch(`/api/v1/admin/payment-accounts/${id}`)
      .set("Authorization", auth)
      .send({ accountNumber: "0301-7654321", isActive: false });
    expect(edited.body.data.account).toMatchObject({ accountNumber: "0301-7654321", isActive: false, method: "JAZZCASH" });

    const row = await prisma.paymentAccount.findUniqueOrThrow({ where: { id } });
    expect(row.updatedById).not.toBeNull();
    const all = await request(app).get("/api/v1/admin/payment-accounts").set("Authorization", auth);
    expect(all.body.data.accounts).toHaveLength(1);
  });

  it("keeps account editing admin-only", async () => {
    const { auth } = await studentWithEnrollment();

    const res = await request(app)
      .post("/api/v1/admin/payment-accounts")
      .set("Authorization", auth)
      .send({ method: "EASYPAISA", accountTitle: "Scammer", accountNumber: "0300-6666666" });

    expect(res.status).toBe(403);
    expect(await prisma.paymentAccount.count()).toBe(0);
  });
});

describe("submitting a payment", () => {
  it("accepts a screenshot and stores it privately under a random name", async () => {
    const { auth, enrollment } = await studentWithEnrollment();

    const res = await upload(auth, enrollment.id);

    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({
      method: "EASYPAISA",
      amountPkr: 3000,
      transactionId: "TID-12345",
      status: "PENDING",
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: res.body.data.payment.id } });
    expect(row.proofImageUrl).toMatch(/^payments\/[0-9a-f-]{36}\.png$/);
    expect(row.proofImageUrl).not.toContain("screenshot");
    expect(existsSync(path.join(process.env.UPLOAD_DIR!, row.proofImageUrl))).toBe(true);
  });

  it("works for approved enrollments too (e.g. monthly fees)", async () => {
    const { auth, enrollment } = await studentWithEnrollment("APPROVED");

    expect((await upload(auth, enrollment.id, JPG)).status).toBe(201);
  });

  it("rejects files that only pretend to be images", async () => {
    const { auth, enrollment } = await studentWithEnrollment();
    const fake = Buffer.from("<script>alert('hi')</script>");

    const res = await upload(auth, enrollment.id, fake);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE");
    expect(await prisma.payment.count()).toBe(0);
  });

  it("rejects files over 5 MB", async () => {
    const { auth, enrollment } = await studentWithEnrollment();
    const huge = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);

    const res = await upload(auth, enrollment.id, huge);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("requires a screenshot and valid details", async () => {
    const { auth, enrollment } = await studentWithEnrollment();

    const noFile = await upload(auth, enrollment.id, null);
    const badAmount = await upload(auth, enrollment.id, PNG, { amountPkr: "-5" });
    const badMethod = await upload(auth, enrollment.id, PNG, { method: "CASH_IN_ENVELOPE" });

    expect(noFile.body.error.code).toBe("FILE_REQUIRED");
    expect(badAmount.status).toBe(400);
    expect(badMethod.status).toBe(400);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("allows only one payment waiting for review at a time", async () => {
    const { auth, enrollment } = await studentWithEnrollment();
    await upload(auth, enrollment.id);

    const second = await upload(auth, enrollment.id);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("PAYMENT_PENDING");
  });

  it("refuses payments for cancelled or completed enrollments", async () => {
    for (const status of ["CANCELLED", "COMPLETED"] as const) {
      const { auth, enrollment } = await studentWithEnrollment(status);
      const res = await upload(auth, enrollment.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ENROLLMENT_CLOSED");
    }
  });

  it("cannot pay into another student's enrollment", async () => {
    const owner = await studentWithEnrollment();
    const intruder = await studentWithEnrollment();

    const res = await upload(intruder.auth, owner.enrollment.id);

    expect(res.status).toBe(404);
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe("viewing the screenshot", () => {
  async function submitted() {
    const s = await studentWithEnrollment();
    const { id } = (await upload(s.auth, s.enrollment.id)).body.data.payment;
    return { ...s, paymentId: id as string };
  }

  it("shows the screenshot to the student who paid, and not to be cached", async () => {
    const { auth, paymentId } = await submitted();

    const res = await request(app).get(`/api/v1/payments/${paymentId}/proof`).set("Authorization", auth).buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  it("shows it to admins", async () => {
    const { paymentId } = await submitted();

    const res = await request(app).get(`/api/v1/payments/${paymentId}/proof`).set("Authorization", await adminAuth());

    expect(res.status).toBe(200);
  });

  it("hides it from other students, teachers and logged-out visitors", async () => {
    const { paymentId } = await submitted();
    const other = await studentWithEnrollment();
    const teacherAuth = await bearer(app, await createUser({ role: "TEACHER" }));
    const url = `/api/v1/payments/${paymentId}/proof`;

    expect((await request(app).get(url).set("Authorization", other.auth)).status).toBe(404);
    expect((await request(app).get(url).set("Authorization", teacherAuth)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe("admin review", () => {
  async function pendingPayment() {
    const s = await studentWithEnrollment();
    const { id } = (await upload(s.auth, s.enrollment.id)).body.data.payment;
    return { ...s, paymentId: id as string };
  }

  it("lists payments waiting for review with the student and course", async () => {
    await pendingPayment();

    const res = await request(app).get("/api/v1/admin/payments?status=PENDING").set("Authorization", await adminAuth());

    expect(res.status).toBe(200);
    expect(res.body.data.payments).toEqual([
      expect.objectContaining({
        status: "PENDING",
        amountPkr: 3000,
        student: expect.objectContaining({ fullName: "Ayesha Siddiqui" }),
        enrollment: expect.objectContaining({ courseTitle: "Tajweed", courseFeePkr: 3000 }),
      }),
    ]);
  });

  it("verifies a payment once, recording who did it", async () => {
    const { paymentId } = await pendingPayment();
    const auth = await adminAuth();

    const res = await request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set("Authorization", auth).send({});
    const again = await request(app).post(`/api/v1/admin/payments/${paymentId}/reject`).set("Authorization", auth).send({ note: "Oops" });

    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe("VERIFIED");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_REVIEWED");
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(row.reviewedById).not.toBeNull();
    expect(row.reviewedAt).not.toBeNull();
  });

  it("rejects with a reason the student can see, and then lets them try again", async () => {
    const { auth: studentAuth, enrollment, paymentId } = await pendingPayment();
    const auth = await adminAuth();

    const noReason = await request(app).post(`/api/v1/admin/payments/${paymentId}/reject`).set("Authorization", auth).send({});
    const rejected = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/reject`)
      .set("Authorization", auth)
      .send({ note: "Transaction ID not found. Please check and upload again." });

    expect(noReason.status).toBe(400);
    expect(rejected.status).toBe(200);
    const mine = await request(app).get("/api/v1/enrollments/mine").set("Authorization", studentAuth);
    expect(mine.body.data.enrollments[0].payments[0]).toMatchObject({
      status: "REJECTED",
      reviewNote: "Transaction ID not found. Please check and upload again.",
    });
    expect((await upload(studentAuth, enrollment.id)).status).toBe(201);
  });

  it("lets only one of two simultaneous reviews win", async () => {
    const { paymentId } = await pendingPayment();
    const auth = await adminAuth();

    const results = await Promise.all([
      request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set("Authorization", auth).send({}),
      request(app).post(`/api/v1/admin/payments/${paymentId}/reject`).set("Authorization", auth).send({ note: "Blurry image" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("is admin-only", async () => {
    const { auth, paymentId } = await pendingPayment();

    const res = await request(app).post(`/api/v1/admin/payments/${paymentId}/verify`).set("Authorization", auth).send({});

    expect(res.status).toBe(403);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("PENDING");
  });
});

describe("detectImageType", () => {
  it("recognises images by their bytes, not their name", () => {
    expect(detectImageType(PNG)).toBe("png");
    expect(detectImageType(JPG)).toBe("jpg");
    expect(detectImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe("webp");
    expect(detectImageType(Buffer.from("%PDF-1.7"))).toBeNull();
  });
});
