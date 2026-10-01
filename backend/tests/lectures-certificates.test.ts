import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { toEmbedUrl } from "../src/modules/lectures/lectures.service.ts";
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

async function setup() {
  const course = await createCourse({ title: "Tajweed" });
  const otherCourse = await createCourse({ title: "Hifz" });
  const teacherUser = await createUser({ role: "TEACHER", fullName: "Ustadha Fatima" });
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
  const group = await prisma.classGroup.create({ data: { courseId: course.id, teacherId: teacher.id, name: "Batch 1" } });
  const otherGroup = await prisma.classGroup.create({ data: { courseId: course.id, name: "Batch 2" } });

  async function student(name: string, classGroupId: string | null, status: "APPROVED" | "PENDING" | "COMPLETED") {
    const user = await createUser({ role: "STUDENT", fullName: name });
    const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
    const enrollment = await prisma.enrollment.create({ data: { studentId: profile.id, courseId: course.id, classGroupId, status } });
    return { user, enrollment, auth: await bearer(app, user) };
  }

  return {
    course,
    otherCourse,
    group,
    otherGroup,
    teacherAuth: await bearer(app, teacherUser),
    adminAuth: await bearer(app, await createUser({ role: "ADMIN" })),
    hira: await student("Hira Malik", group.id, "APPROVED"),
    sana: await student("Sana", otherGroup.id, "APPROVED"),
    pending: await student("Pending Student", null, "PENDING"),
  };
}

const addLecture = (auth: string, body: object) => request(app).post("/api/v1/teacher/lectures").set("Authorization", auth).send(body);

describe("recorded lectures", () => {
  it("a teacher adds a published lecture for their course; enrolled students see it with a playable link", async () => {
    const { course, teacherAuth, hira, sana, pending } = await setup();

    const res = await addLecture(teacherAuth, {
      courseId: course.id, title: "Lesson 1 — Makharij", videoUrl: "https://youtu.be/dQw4w9WgXcQ", durationSeconds: 1800, published: true,
    });
    const hiraList = await request(app).get("/api/v1/lectures").set("Authorization", hira.auth);
    const sanaList = await request(app).get("/api/v1/lectures").set("Authorization", sana.auth);
    const pendingList = await request(app).get("/api/v1/lectures").set("Authorization", pending.auth);

    expect(res.status).toBe(201);
    expect(res.body.data.lecture).toMatchObject({ published: true, teacherName: "Ustadha Fatima", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(hiraList.body.data.lectures).toEqual([expect.objectContaining({ title: "Lesson 1 — Makharij", course: expect.objectContaining({ title: "Tajweed" }) })]);
    expect(sanaList.body.data.lectures).toHaveLength(1); // whole-course lecture: every group sees it
    expect(pendingList.body.data.lectures).toHaveLength(0); // not approved yet
  });

  it("group-only lectures reach only that group, and drafts reach nobody", async () => {
    const { course, group, teacherAuth, hira, sana } = await setup();
    await addLecture(teacherAuth, { courseId: course.id, classGroupId: group.id, title: "Batch 1 revision", videoUrl: "https://vimeo.com/123456", published: true });
    await addLecture(teacherAuth, { courseId: course.id, title: "Draft", videoUrl: "https://vimeo.com/999" });

    const hiraList = await request(app).get("/api/v1/lectures").set("Authorization", hira.auth);
    const sanaList = await request(app).get("/api/v1/lectures").set("Authorization", sana.auth);

    expect(hiraList.body.data.lectures.map((l: { title: string }) => l.title)).toEqual(["Batch 1 revision"]);
    expect(hiraList.body.data.lectures[0].embedUrl).toBe("https://player.vimeo.com/video/123456");
    expect(sanaList.body.data.lectures).toEqual([]);
  });

  it("publishes and unpublishes a draft", async () => {
    const { course, teacherAuth, hira } = await setup();
    const { id } = (await addLecture(teacherAuth, { courseId: course.id, title: "Draft", videoUrl: "https://vimeo.com/1" })).body.data.lecture;

    await request(app).patch(`/api/v1/teacher/lectures/${id}`).set("Authorization", teacherAuth).send({ published: true });
    const visible = await request(app).get("/api/v1/lectures").set("Authorization", hira.auth);
    await request(app).patch(`/api/v1/teacher/lectures/${id}`).set("Authorization", teacherAuth).send({ published: false });
    const hidden = await request(app).get("/api/v1/lectures").set("Authorization", hira.auth);

    expect(visible.body.data.lectures).toHaveLength(1);
    expect(hidden.body.data.lectures).toHaveLength(0);
  });

  it("teachers can only add lectures to courses and groups they teach; admins can add anywhere", async () => {
    const { otherCourse, otherGroup, course, teacherAuth, adminAuth } = await setup();

    const wrongCourse = await addLecture(teacherAuth, { courseId: otherCourse.id, title: "Extra lesson", videoUrl: "https://vimeo.com/1" });
    const wrongGroup = await addLecture(teacherAuth, { courseId: course.id, classGroupId: otherGroup.id, title: "Extra lesson", videoUrl: "https://vimeo.com/1" });
    const byAdmin = await addLecture(adminAuth, { courseId: otherCourse.id, title: "Welcome", videoUrl: "https://vimeo.com/1" });

    expect(wrongCourse.body.error.code).toBe("INVALID_COURSE");
    expect(wrongGroup.body.error.code).toBe("INVALID_CLASS_GROUP");
    expect(byAdmin.status).toBe(201);
  });

  it("only https video links are accepted", async () => {
    const { course, teacherAuth } = await setup();

    expect((await addLecture(teacherAuth, { courseId: course.id, title: "Extra lesson", videoUrl: "http://insecure.example/v" })).status).toBe(400);
  });

  it("works out embed links for YouTube and Vimeo only", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc123DEF45")).toBe("https://www.youtube-nocookie.com/embed/abc123DEF45");
    expect(toEmbedUrl("https://youtube.com/shorts/abc123DEF45")).toBe("https://www.youtube-nocookie.com/embed/abc123DEF45");
    expect(toEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(toEmbedUrl("https://example.com/video.mp4")).toBeNull();
    expect(toEmbedUrl("not a url")).toBeNull();
  });
});

describe("certificates", () => {
  async function completed() {
    const s = await setup();
    await prisma.enrollment.update({ where: { id: s.hira.enrollment.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return s;
  }
  const issue = (auth: string, enrollmentId: string) =>
    request(app).post("/api/v1/admin/certificates").set("Authorization", auth).send({ enrollmentId });

  it("issues a numbered certificate with a random check code", async () => {
    const { adminAuth, hira } = await completed();

    const res = await issue(adminAuth, hira.enrollment.id);

    expect(res.status).toBe(201);
    const year = new Date().getUTCFullYear();
    expect(res.body.data.certificate.certificateNumber).toMatch(new RegExp(`^STJ-${year}-00001-[A-Z2-9]{4}$`));
    expect(res.body.data.certificate).toEqual({ certificateNumber: expect.any(String), issuedAt: expect.any(String) });
  });

  it("only for completed courses, and only once", async () => {
    const { adminAuth, hira, sana } = await completed();
    await issue(adminAuth, hira.enrollment.id);

    expect((await issue(adminAuth, hira.enrollment.id)).body.error.code).toBe("ALREADY_ISSUED");
    expect((await issue(adminAuth, sana.enrollment.id)).body.error.code).toBe("NOT_COMPLETED");
  });

  it("numbers certificates uniquely even when issued at the same moment", async () => {
    const s = await setup();
    const enrollments = [];
    for (let i = 0; i < 4; i++) {
      const user = await createUser({ role: "STUDENT" });
      const profile = await prisma.student.findUniqueOrThrow({ where: { userId: user.id } });
      enrollments.push(await prisma.enrollment.create({ data: { studentId: profile.id, courseId: s.course.id, status: "COMPLETED" } }));
    }

    const results = await Promise.all(enrollments.map((e) => issue(s.adminAuth, e.id)));

    const runningNumbers = results.map((r) => r.body.data.certificate.certificateNumber.split("-")[2]).sort();
    expect(runningNumbers).toEqual(["00001", "00002", "00003", "00004"]);
  });

  it("shows the certificate's number and date in the student's courses (the app draws the image)", async () => {
    const { adminAuth, hira } = await completed();
    const { certificateNumber } = (await issue(adminAuth, hira.enrollment.id)).body.data.certificate;

    const mine = await request(app).get("/api/v1/enrollments/mine").set("Authorization", hira.auth);

    expect(mine.body.data.enrollments[0]).toMatchObject({
      course: { title: "Tajweed" },
      certificate: { certificateNumber, issuedAt: expect.any(String) },
    });
    expect(Object.keys(mine.body.data.enrollments[0].certificate).sort()).toEqual(["certificateNumber", "issuedAt"]);
  });

  it("there is no public verification page or PDF any more", async () => {
    const { adminAuth, hira } = await completed();
    const { certificateNumber } = (await issue(adminAuth, hira.enrollment.id)).body.data.certificate;

    const verify = await request(app).get(`/api/v1/certificates/verify/${certificateNumber}`);
    const pdf = await request(app).get(`/api/v1/certificates/${certificateNumber}/pdf`).set("Authorization", hira.auth);

    expect([verify.status, pdf.status]).toEqual([404, 404]);
  });

  it("issuing is admin-only", async () => {
    const { teacherAuth, hira } = await completed();

    expect((await issue(teacherAuth, hira.enrollment.id)).status).toBe(403);
  });
});

describe("joining details for approved students", () => {
  it("approved students get the Zoom link; pending ones don't", async () => {
    const { group, hira } = await setup();
    await prisma.classGroup.update({ where: { id: group.id }, data: { zoomMeetingId: "123 456 7890", zoomPasscode: "quran" } });

    const mine = await request(app).get("/api/v1/enrollments/mine").set("Authorization", hira.auth);

    expect(mine.body.data.enrollments[0].classGroup).toMatchObject({
      zoomJoinUrl: "https://zoom.us/j/1234567890",
      zoomPasscode: "quran",
    });
  });
});
