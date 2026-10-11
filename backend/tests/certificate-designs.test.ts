// Certificate designs: per-course templates and per-student finished images.
import { rm } from "node:fs/promises";
import { crc32 } from "node:zlib";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { certificateDesign } from "../src/modules/certificates/certificateDesigns.service.ts";
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

// A real PNG header of the given size (plus a marker byte so files can be told apart).
function png(width: number, height: number, marker = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const type = Buffer.from("IHDR");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, ihdr])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, type, ihdr, crc, Buffer.alloc(32, marker)]);
}

const A4 = (marker = 0) => png(1600, 1131, marker);

async function setup() {
  const course = await createCourse({ title: "Tajweed" });
  const adminAuth = await bearer(app, await createUser({ role: "ADMIN" }));
  const teacherAuth = await bearer(app, await createUser({ role: "TEACHER" }));

  async function student(name: string) {
    const user = await createUser({ role: "STUDENT", fullName: name });
    const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
    const enrollment = await prisma.enrollment.create({ data: { studentId: profile.id, courseId: course.id, status: "COMPLETED" } });
    return { enrollment, auth: await bearer(app, user) };
  }

  return { course, adminAuth, teacherAuth, hira: await student("Hira Khan"), sana: await student("Sana Malik") };
}

const uploadTemplate = (auth: string, courseId: string, file: Buffer | null, filename = "template.png") => {
  const req = request(app).put(`/api/v1/admin/courses/${courseId}/certificate-template`).set("Authorization", auth);
  return file ? req.attach("image", file, { filename, contentType: "image/png" }) : req;
};

const uploadFinished = (auth: string, number: string, file: Buffer | null) => {
  const req = request(app).put(`/api/v1/admin/certificates/${number}/image`).set("Authorization", auth);
  return file ? req.attach("image", file, { filename: "certificate.png", contentType: "image/png" }) : req;
};

async function issue(adminAuth: string, enrollmentId: string) {
  const res = await request(app).post("/api/v1/admin/certificates").set("Authorization", adminAuth).send({ enrollmentId });
  expect(res.status).toBe(201);
  return res.body.data.certificate as { certificateNumber: string; design: string; imageUrl: string | null };
}

const image = (auth: string, number: string) =>
  request(app).get(`/api/v1/certificates/${number}/image`).set("Authorization", auth).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => done(null, Buffer.concat(chunks)));
  });

async function myCertificate(auth: string) {
  const res = await request(app).get("/api/v1/enrollments/mine").set("Authorization", auth);
  return res.body.data.enrollments[0].certificate;
}

describe("course certificate templates", () => {
  it("an admin uploads a template; the course shows it and the admin can view it", async () => {
    const { course, adminAuth } = await setup();

    const res = await uploadTemplate(adminAuth, course.id, A4(7));

    expect(res.status).toBe(200);
    expect(res.body.data.certificateTemplateUrl).toMatch(new RegExp(`^/api/v1/admin/courses/${course.id}/certificate-template\\?v=[0-9a-f]{8}$`));
    const list = await request(app).get("/api/v1/admin/courses").set("Authorization", adminAuth);
    expect(list.body.data.courses[0].certificateTemplateUrl).toBe(res.body.data.certificateTemplateUrl);

    const file = await request(app).get(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", adminAuth);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.compare(file.body, A4(7))).toBe(0);
  });

  it("accepts common A4 landscape exports and rejects other shapes with the required size", async () => {
    const { course, adminAuth } = await setup();

    for (const [w, h] of [[3508, 2480], [1754, 1240], [842, 595]]) {
      expect((await uploadTemplate(adminAuth, course.id, png(w, h))).status).toBe(200);
    }

    const wide = await uploadTemplate(adminAuth, course.id, png(1920, 1080));
    expect(wide.status).toBe(400);
    expect(wide.body.error).toMatchObject({ code: "WRONG_SIZE" });
    expect(wide.body.error.message).toContain("1920 × 1080");
    expect(wide.body.error.message).toContain("1600 × 1131 px");

    const portrait = await uploadTemplate(adminAuth, course.id, png(1131, 1600));
    expect(portrait.body.error.message).toMatch(/portrait/);

    const tiny = await uploadTemplate(adminAuth, course.id, png(400, 283));
    expect(tiny.body.error).toMatchObject({ code: "WRONG_SIZE", message: expect.stringContaining("blurry") });
  });

  it("checks the file's bytes, not its name or type label", async () => {
    const { course, adminAuth } = await setup();

    const fake = await uploadTemplate(adminAuth, course.id, Buffer.from("<script>alert(1)</script>".padEnd(200, " ")), "design.png");
    expect(fake.status).toBe(400);
    expect(fake.body.error).toMatchObject({ code: "INVALID_FILE", message: "The certificate must be a JPG, PNG or WebP image." });

    const missing = await uploadTemplate(adminAuth, course.id, null);
    expect(missing.body.error.code).toBe("FILE_REQUIRED");

    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).certificateTemplateKey).toBeNull();
  });

  it("only admins can upload, view or remove a template", async () => {
    const { course, adminAuth, teacherAuth, hira } = await setup();
    await uploadTemplate(adminAuth, course.id, A4());
    const before = (await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).certificateTemplateKey;

    for (const auth of [hira.auth, teacherAuth]) {
      expect((await uploadTemplate(auth, course.id, A4(1))).status).toBe(403);
      expect((await request(app).get(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", auth)).status).toBe(403);
      expect((await request(app).delete(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", auth)).status).toBe(403);
    }
    expect((await request(app).put(`/api/v1/admin/courses/${course.id}/certificate-template`).attach("image", A4(), "t.png")).status).toBe(401);

    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).certificateTemplateKey).toBe(before);
  });

  it("answers 404 for unknown courses", async () => {
    const { adminAuth } = await setup();
    expect((await uploadTemplate(adminAuth, "00000000-0000-4000-8000-000000000000", A4())).status).toBe(404);
    expect((await uploadTemplate(adminAuth, "not-a-uuid", A4())).status).toBe(404);
  });

  it("removing a template puts the course back on the built-in design", async () => {
    const { course, adminAuth } = await setup();
    await uploadTemplate(adminAuth, course.id, A4());

    const res = await request(app).delete(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", adminAuth);

    expect(res.body.data).toEqual({ certificateTemplateUrl: null });
    expect((await request(app).get(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", adminAuth)).status).toBe(404);
  });
});

describe("issued certificates keep the design they were issued with", () => {
  it("replacing or removing the course template doesn't change certificates already issued", async () => {
    const { course, adminAuth, hira, sana } = await setup();
    await uploadTemplate(adminAuth, course.id, A4(1));
    const first = await issue(adminAuth, hira.enrollment.id);
    expect(first.design).toBe("TEMPLATE");

    await uploadTemplate(adminAuth, course.id, A4(2)); // a new design for the course
    const second = await issue(adminAuth, sana.enrollment.id);

    expect(Buffer.compare((await image(hira.auth, first.certificateNumber)).body, A4(1))).toBe(0);
    expect(Buffer.compare((await image(sana.auth, second.certificateNumber)).body, A4(2))).toBe(0);

    await request(app).delete(`/api/v1/admin/courses/${course.id}/certificate-template`).set("Authorization", adminAuth);
    expect((await myCertificate(hira.auth)).design).toBe("TEMPLATE");
    expect(Buffer.compare((await image(hira.auth, first.certificateNumber)).body, A4(1))).toBe(0);
  });

  it("a certificate issued without a template stays on the built-in design", async () => {
    const { course, adminAuth, hira } = await setup();
    const cert = await issue(adminAuth, hira.enrollment.id);
    await uploadTemplate(adminAuth, course.id, A4());

    expect(await myCertificate(hira.auth)).toMatchObject({ design: "DEFAULT", imageUrl: null });
    expect((await image(hira.auth, cert.certificateNumber)).status).toBe(404);
  });
});

describe("finished certificate images", () => {
  it("fallback order: the student's finished image, then the course template, then the built-in design", async () => {
    const { course, adminAuth, hira } = await setup();
    await uploadTemplate(adminAuth, course.id, A4(1));
    const { certificateNumber } = await issue(adminAuth, hira.enrollment.id);
    expect((await myCertificate(hira.auth)).design).toBe("TEMPLATE");

    const up = await uploadFinished(adminAuth, certificateNumber, A4(9));
    expect(up.status).toBe(200);
    expect(up.body.data.certificate).toMatchObject({ certificateNumber, design: "FINISHED" });
    const mine = await myCertificate(hira.auth);
    expect(mine).toMatchObject({ design: "FINISHED", imageUrl: expect.stringMatching(new RegExp(`^/api/v1/certificates/${certificateNumber}/image\\?v=`)) });
    expect(Buffer.compare((await image(hira.auth, certificateNumber)).body, A4(9))).toBe(0);

    const removed = await request(app).delete(`/api/v1/admin/certificates/${certificateNumber}/image`).set("Authorization", adminAuth);
    expect(removed.body.data.certificate.design).toBe("TEMPLATE");
    expect(Buffer.compare((await image(hira.auth, certificateNumber)).body, A4(1))).toBe(0);
  });

  it("the order itself", () => {
    const n = "STJ-2026-00001-ABCD";
    const t = "certificate-templates/11111111-1111-4111-8111-111111111111.png";
    const f = "certificates/22222222-2222-4222-8222-222222222222.png";
    expect(certificateDesign({ certificateNumber: n, finishedImageKey: f, templateKey: t }).design).toBe("FINISHED");
    expect(certificateDesign({ certificateNumber: n, finishedImageKey: null, templateKey: t }).design).toBe("TEMPLATE");
    expect(certificateDesign({ certificateNumber: n, finishedImageKey: null, templateKey: null })).toEqual({ design: "DEFAULT", imageUrl: null });
  });

  it("only admins can upload one, and the same file checks apply", async () => {
    const { adminAuth, teacherAuth, hira } = await setup();
    const { certificateNumber } = await issue(adminAuth, hira.enrollment.id);

    expect((await uploadFinished(hira.auth, certificateNumber, A4())).status).toBe(403);
    expect((await uploadFinished(teacherAuth, certificateNumber, A4())).status).toBe(403);
    expect((await request(app).delete(`/api/v1/admin/certificates/${certificateNumber}/image`).set("Authorization", hira.auth)).status).toBe(403);

    expect((await uploadFinished(adminAuth, certificateNumber, Buffer.alloc(200, 0x41))).body.error.code).toBe("INVALID_FILE");
    expect((await uploadFinished(adminAuth, certificateNumber, png(1000, 1000))).body.error.code).toBe("WRONG_SIZE");
    expect((await uploadFinished(adminAuth, "STJ-2026-99999-ZZZZ", A4())).status).toBe(404);

    expect((await myCertificate(hira.auth)).design).toBe("DEFAULT");
  });
});

describe("who can open a certificate image", () => {
  it("its student and admins; another student or a teacher gets 404", async () => {
    const { adminAuth, teacherAuth, hira, sana } = await setup();
    const { certificateNumber } = await issue(adminAuth, hira.enrollment.id);
    await uploadFinished(adminAuth, certificateNumber, A4(3));

    expect((await image(hira.auth, certificateNumber)).status).toBe(200);
    expect((await image(adminAuth, certificateNumber)).status).toBe(200);
    expect((await image(sana.auth, certificateNumber)).status).toBe(404);
    expect((await image(teacherAuth, certificateNumber)).status).toBe(404);
    expect((await request(app).get(`/api/v1/certificates/${certificateNumber}/image`)).status).toBe(401);
    expect((await image(hira.auth, certificateNumber)).headers["cache-control"]).toBe("private, no-store");
  });

  it("odd certificate numbers can't reach other files", async () => {
    const { hira } = await setup();
    for (const number of ["..%2F..%2F.env", "STJ-2026-00001-AB%2F..", "STJ-2026-00001-ABCD", "x"]) {
      expect((await request(app).get(`/api/v1/certificates/${number}/image`).set("Authorization", hira.auth)).status).toBe(404);
    }
  });
});
