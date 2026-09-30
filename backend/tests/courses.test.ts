import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { slugify } from "../src/modules/courses/courses.schemas.ts";
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

describe("public catalog: GET /courses", () => {
  it("lists only published courses, without logging in", async () => {
    await createCourse({ title: "Tajweed", slug: "tajweed" });
    await createCourse({ title: "Draft course", slug: "draft", isPublished: false });

    const res = await request(app).get("/api/v1/courses");

    expect(res.status).toBe(200);
    expect(res.body.data.courses.map((c: { slug: string }) => c.slug)).toEqual(["tajweed"]);
    expect(res.body.data.courses[0]).not.toHaveProperty("isPublished");
  });

  it("shows a course page with its active batches and teacher, but no Zoom or WhatsApp details", async () => {
    const course = await createCourse({ slug: "noorani-qaida" });
    const teacher = await createUser({ role: "TEACHER", fullName: "Ustadha Maryam" });
    const teacherProfile = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacher.id } });
    await prisma.classGroup.create({
      data: {
        courseId: course.id, teacherId: teacherProfile.id, name: "Batch 1", scheduleText: "Mon/Wed 8pm",
        zoomMeetingId: "123", zoomPasscode: "secret", whatsappGroupLink: "https://chat.whatsapp.com/abc",
      },
    });
    await prisma.classGroup.create({ data: { courseId: course.id, name: "Old batch", isActive: false } });

    const res = await request(app).get("/api/v1/courses/noorani-qaida");

    expect(res.status).toBe(200);
    expect(res.body.data.course.classGroups).toEqual([
      expect.objectContaining({ name: "Batch 1", scheduleText: "Mon/Wed 8pm", teacherName: "Ustadha Maryam" }),
    ]);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("secret");
    expect(body).not.toContain("chat.whatsapp.com");
  });

  it("hides unpublished and unknown courses", async () => {
    await createCourse({ slug: "draft", isPublished: false });

    expect((await request(app).get("/api/v1/courses/draft")).status).toBe(404);
    expect((await request(app).get("/api/v1/courses/nope")).status).toBe(404);
  });
});

describe("admin: /admin/courses", () => {
  async function adminAuth() {
    return bearer(app, await createUser({ role: "ADMIN" }));
  }

  it("creates a course, making the slug from the title and starting unpublished", async () => {
    const res = await request(app)
      .post("/api/v1/admin/courses")
      .set("Authorization", await adminAuth())
      .send({ title: "Tajweed ul Quran", description: "Rules of Tajweed for beginners.", feePkr: 3000 });

    expect(res.status).toBe(201);
    expect(res.body.data.course).toMatchObject({ slug: "tajweed-ul-quran", feePkr: 3000, isPublished: false });
    expect((await request(app).get("/api/v1/courses")).body.data.courses).toHaveLength(0);
  });

  it("publishes, edits and unpublishes a course without touching other fields", async () => {
    const auth = await adminAuth();
    const course = await createCourse({ slug: "hifz", isPublished: false, feePkr: 5000 });

    const published = await request(app)
      .patch(`/api/v1/admin/courses/${course.id}`)
      .set("Authorization", auth)
      .send({ isPublished: true, feePkr: 4500 });
    expect(published.status).toBe(200);
    expect(published.body.data.course).toMatchObject({ isPublished: true, feePkr: 4500, slug: "hifz" });
    expect((await request(app).get("/api/v1/courses/hifz")).status).toBe(200);

    await request(app).patch(`/api/v1/admin/courses/${course.id}`).set("Authorization", auth).send({ isPublished: false });
    expect((await request(app).get("/api/v1/courses/hifz")).status).toBe(404);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).feePkr).toBe(4500);
  });

  it("lists drafts too", async () => {
    await createCourse({ slug: "live" });
    await createCourse({ slug: "draft", isPublished: false });

    const res = await request(app).get("/api/v1/admin/courses").set("Authorization", await adminAuth());

    expect(res.body.data.courses.map((c: { slug: string }) => c.slug).sort()).toEqual(["draft", "live"]);
  });

  it("rejects a duplicate slug", async () => {
    await createCourse({ slug: "tajweed" });

    const res = await request(app)
      .post("/api/v1/admin/courses")
      .set("Authorization", await adminAuth())
      .send({ title: "Tajweed", description: "Another Tajweed course.", feePkr: 1000 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
  });

  it("validates fees and asks for a slug when the title has no Latin letters", async () => {
    const auth = await adminAuth();

    const badFee = await request(app)
      .post("/api/v1/admin/courses")
      .set("Authorization", auth)
      .send({ title: "Nazra", description: "Reading the Quran fluently.", feePkr: 2500.5 });
    const urduTitle = await request(app)
      .post("/api/v1/admin/courses")
      .set("Authorization", auth)
      .send({ title: "ناظرہ قرآن", description: "Reading the Quran fluently.", feePkr: 2500 });

    expect(badFee.status).toBe(400);
    expect(badFee.body.error.details).toContainEqual(expect.objectContaining({ field: "feePkr" }));
    expect(urduTitle.status).toBe(400);
    expect(urduTitle.body.error.details).toContainEqual(expect.objectContaining({ field: "slug" }));
  });

  it("returns 404 for unknown or malformed course IDs", async () => {
    const auth = await adminAuth();

    for (const id of [crypto.randomUUID(), "not-a-uuid"]) {
      const res = await request(app).patch(`/api/v1/admin/courses/${id}`).set("Authorization", auth).send({ feePkr: 1 });
      expect(res.status).toBe(404);
    }
  });

  it("is off-limits to students and teachers", async () => {
    for (const role of ["STUDENT", "TEACHER"] as const) {
      const auth = await bearer(app, await createUser({ role }));
      const res = await request(app)
        .post("/api/v1/admin/courses")
        .set("Authorization", auth)
        .send({ title: "Sneaky", description: "Should not be created.", feePkr: 0 });
      expect(res.status).toBe(403);
    }
    expect(await prisma.course.count()).toBe(0);
  });
});

describe("slugify", () => {
  it("turns titles into web-address names", () => {
    expect(slugify("Tajweed ul Quran")).toBe("tajweed-ul-quran");
    expect(slugify("  Hifz — Level 2! ")).toBe("hifz-level-2");
    expect(slugify("ناظرہ")).toBe("");
  });
});
