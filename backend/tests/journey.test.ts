// The whole academy, start to finish, through the API only — the way the website
// and app use it. If a change breaks any step in between, this test says which.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { bearer } from "./helpers/auth.ts";
import { createUser, resetDatabase } from "./helpers/db.ts";

const app = createApp();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Each step checks its status code with a readable message on failure.
function ok(res: request.Response, status = 200) {
  expect(res.status, `unexpected response: ${JSON.stringify(res.body)}`).toBe(status);
  return res.body.data;
}

describe("a student's whole journey", () => {
  it("signup → pay → approval → live class → feedback → certificate", async () => {
    // ── The academy sets up (admin) ─────────────────────────────
    const admin = await bearer(app, await createUser({ role: "ADMIN" }));

    const { course } = ok(
      await request(app).post("/api/v1/admin/courses").set("Authorization", admin).send({
        title: "Noorani Qaida",
        slug: "noorani-qaida",
        description: "Learn the Arabic letters, their sounds and joining rules.",
        feePkr: 2000,
        isPublished: true,
      }),
      201,
    );
    ok(
      await request(app)
        .post("/api/v1/admin/payment-accounts")
        .set("Authorization", admin)
        .send({ method: "EASYPAISA", accountTitle: "Siraat tul Jannah", accountNumber: "0300-1234567" }),
      201,
    );
    const { teacher, temporaryPassword } = ok(
      await request(app).post("/api/v1/admin/teachers").set("Authorization", admin).send({ fullName: "Ustadha Maryam", email: "maryam@academy.pk" }),
      201,
    );
    const { classGroup } = ok(
      await request(app).post("/api/v1/admin/class-groups").set("Authorization", admin).send({
        courseId: course.id,
        teacherId: teacher.id,
        name: "Qaida — Batch 1 — Evening",
        zoomMeetingId: "123 456 7890",
        whatsappGroupLink: "https://chat.whatsapp.com/abc",
      }),
      201,
    );

    // The teacher replaces the temporary password with her own.
    let teacherAuth = await bearer(app, { email: "maryam@academy.pk", password: temporaryPassword });
    const changed = ok(
      await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", teacherAuth)
        .send({ currentPassword: temporaryPassword, newPassword: "maryam-own-password" }),
    );
    teacherAuth = `Bearer ${changed.tokens.accessToken}`;

    // ── A student signs up, enrolls and pays ────────────────────
    const signup = ok(
      await request(app).post("/api/v1/auth/register").send({ fullName: "Ayesha Khan", email: "ayesha@family.pk", password: "ayesha-password" }),
      201,
    );
    const student = `Bearer ${signup.tokens.accessToken}`;

    const catalog = ok(await request(app).get("/api/v1/courses"));
    expect(catalog.courses.map((c: { title: string }) => c.title)).toEqual(["Noorani Qaida"]);

    const { enrollment } = ok(await request(app).post("/api/v1/enrollments").set("Authorization", student).send({ courseId: course.id }), 201);
    const { accounts } = ok(await request(app).get("/api/v1/payment-accounts").set("Authorization", student));
    expect(accounts[0].accountNumber).toBe("0300-1234567");

    const { payment } = ok(
      await request(app)
        .post(`/api/v1/enrollments/${enrollment.id}/payments`)
        .set("Authorization", student)
        .field("method", "EASYPAISA")
        .field("amountPkr", "2000")
        .field("transactionId", "TX123")
        .attach("proof", PNG, { filename: "screenshot.png", contentType: "image/png" }),
      201,
    );

    // ── The admin checks the screenshot, verifies and approves ──
    const proof = await request(app).get(`/api/v1/payments/${payment.id}/proof`).set("Authorization", admin);
    expect([proof.status, proof.headers["content-type"]]).toEqual([200, "image/png"]);
    ok(await request(app).post(`/api/v1/admin/payments/${payment.id}/verify`).set("Authorization", admin).send({}));
    ok(await request(app).post(`/api/v1/admin/enrollments/${enrollment.id}/approve`).set("Authorization", admin).send({ classGroupId: classGroup.id }));

    const mine = ok(await request(app).get("/api/v1/enrollments/mine").set("Authorization", student));
    expect(mine.enrollments[0]).toMatchObject({ status: "APPROVED", classGroup: { name: "Qaida — Batch 1 — Evening", zoomJoinUrl: "https://zoom.us/j/1234567890" } });

    // ── A live class ────────────────────────────────────────────
    const { session } = ok(
      await request(app)
        .post(`/api/v1/teacher/class-groups/${classGroup.id}/sessions`)
        .set("Authorization", teacherAuth)
        .send({ scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), topic: "Lesson 1 — Alif to Tha" }),
      201,
    );
    ok(await request(app).post(`/api/v1/teacher/sessions/${session.id}/start`).set("Authorization", teacherAuth).send({ platform: "ZOOM" }));

    const live = ok(await request(app).get(`/api/v1/enrollments/${enrollment.id}/live`).set("Authorization", student));
    expect(live.session).toMatchObject({ status: "LIVE", topic: "Lesson 1 — Alif to Tha" });
    const join = ok(await request(app).post(`/api/v1/enrollments/${enrollment.id}/live/join`).set("Authorization", student).send({ platform: "ZOOM" }));
    expect(join.joinUrl).toBe("https://zoom.us/j/1234567890");

    const roster = ok(await request(app).get(`/api/v1/teacher/sessions/${session.id}/attendance`).set("Authorization", teacherAuth));
    const ayesha = roster.students[0];
    expect(ayesha).toMatchObject({ fullName: "Ayesha Khan", joinedVia: "ZOOM" });
    ok(
      await request(app)
        .put(`/api/v1/teacher/sessions/${session.id}/attendance`)
        .set("Authorization", teacherAuth)
        .send({ records: [{ studentId: ayesha.studentId, status: "PRESENT" }] }),
    );
    ok(await request(app).post(`/api/v1/teacher/sessions/${session.id}/end`).set("Authorization", teacherAuth));
    ok(
      await request(app)
        .post("/api/v1/teacher/feedback")
        .set("Authorization", teacherAuth)
        .field("enrollmentId", enrollment.id)
        .field("text", "MashaAllah, beautiful recitation today."),
      201,
    );

    // ── The student sees her progress ───────────────────────────
    const attendance = ok(await request(app).get(`/api/v1/enrollments/${enrollment.id}/attendance`).set("Authorization", student));
    expect(attendance.summary).toMatchObject({ classes: 1, present: 1, attendanceRate: 100 });
    const feedback = ok(await request(app).get("/api/v1/feedback/mine").set("Authorization", student));
    expect(feedback).toMatchObject({ unreadCount: 1, feedback: [expect.objectContaining({ text: "MashaAllah, beautiful recitation today." })] });

    // ── Course completed: certificate ───────────────────────────
    ok(await request(app).post(`/api/v1/admin/enrollments/${enrollment.id}/complete`).set("Authorization", admin).send({}));
    const { certificate } = ok(await request(app).post("/api/v1/admin/certificates").set("Authorization", admin).send({ enrollmentId: enrollment.id }), 201);
    expect(certificate.certificateNumber).toMatch(/^STJ-\d{4}-00001-[A-Z0-9]{4}$/);

    const verified = ok(await request(app).get(`/api/v1/certificates/verify/${certificate.certificateNumber}`));
    expect(verified.certificate).toMatchObject({ studentName: "Ayesha Khan", courseTitle: "Noorani Qaida" });

    const pdf = await request(app).get(`/api/v1/certificates/${certificate.certificateNumber}/pdf`).set("Authorization", student);
    expect([pdf.status, pdf.headers["content-type"]]).toEqual([200, "application/pdf"]);

    // Finished: she can enroll in the same course again later (e.g. a revision batch).
    ok(await request(app).post("/api/v1/enrollments").set("Authorization", student).send({ courseId: course.id }), 201);
  });
});
