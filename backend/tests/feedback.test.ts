import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { detectAudioType } from "../src/middleware/upload.ts";
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

// Real audio headers followed by filler bytes.
const OGG = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(200, 7)]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(200, 3)]);

async function classroom() {
  const course = await createCourse({ title: "Tajweed" });
  const teacherUser = await createUser({ role: "TEACHER", fullName: "Ustadha Fatima" });
  const teacher = await prisma.teacher.findUniqueOrThrow({ where: { userId: teacherUser.id } });
  const group = await prisma.classGroup.create({ data: { courseId: course.id, teacherId: teacher.id, name: "Tajweed — Batch 1" } });

  const studentUser = await createUser({ role: "STUDENT", fullName: "Hira Malik" });
  const student = await prisma.student.findUniqueOrThrow({ where: { userId: studentUser.id } });
  const enrollment = await prisma.enrollment.create({
    data: { studentId: student.id, courseId: course.id, classGroupId: group.id, status: "APPROVED" },
  });

  return {
    enrollment,
    studentUser,
    teacherAuth: await bearer(app, teacherUser),
    studentAuth: await bearer(app, studentUser),
  };
}

const sendText = (auth: string, enrollmentId: string, text = "MashaAllah, good progress on Madd.") =>
  request(app).post("/api/v1/teacher/feedback").set("Authorization", auth).send({ enrollmentId, text });

const sendVoice = (auth: string, enrollmentId: string, file: Buffer = OGG, filename = "note.ogg") =>
  request(app)
    .post("/api/v1/teacher/feedback")
    .set("Authorization", auth)
    .field("enrollmentId", enrollmentId)
    .field("durationSeconds", "42")
    .field("text", "Listen to how I read ayah 3.")
    .attach("voice", file, { filename, contentType: "audio/ogg" });

describe("teacher sends feedback", () => {
  it("sends a written note to a student in their group", async () => {
    const { enrollment, teacherAuth } = await classroom();

    const res = await sendText(teacherAuth, enrollment.id);

    expect(res.status).toBe(201);
    expect(res.body.data.feedback).toMatchObject({
      type: "TEXT",
      text: "MashaAllah, good progress on Madd.",
      voiceUrl: null,
      teacherName: "Ustadha Fatima",
      studentName: "Hira Malik",
      courseTitle: "Tajweed",
      readAt: null,
    });
  });

  it("sends a voice note (with an optional written caption)", async () => {
    const { enrollment, teacherAuth } = await classroom();

    const res = await sendVoice(teacherAuth, enrollment.id);

    expect(res.status).toBe(201);
    expect(res.body.data.feedback).toMatchObject({
      type: "VOICE",
      text: "Listen to how I read ayah 3.",
      voiceDurationSeconds: 42,
      voiceUrl: `/api/v1/feedback/${res.body.data.feedback.id}/voice`,
    });
    const row = await prisma.feedback.findUniqueOrThrow({ where: { id: res.body.data.feedback.id } });
    expect(row.voiceUrl).toMatch(/^feedback\/[0-9a-f-]{36}\.ogg$/);
  });

  it("accepts iPhone-style M4A recordings", async () => {
    const { enrollment, teacherAuth } = await classroom();

    const res = await sendVoice(teacherAuth, enrollment.id, M4A, "note.m4a");

    expect(res.status).toBe(201);
  });

  it("rejects empty feedback and files that aren't audio", async () => {
    const { enrollment, teacherAuth } = await classroom();

    const empty = await request(app).post("/api/v1/teacher/feedback").set("Authorization", teacherAuth).send({ enrollmentId: enrollment.id });
    const notAudio = await sendVoice(teacherAuth, enrollment.id, Buffer.from("<html>not audio</html>"));

    expect(empty.body.error.code).toBe("FEEDBACK_EMPTY");
    expect(notAudio.body.error.code).toBe("INVALID_FILE");
    expect(await prisma.feedback.count()).toBe(0);
  });

  it("rejects voice notes over 10 MB", async () => {
    const { enrollment, teacherAuth } = await classroom();

    const res = await sendVoice(teacherAuth, enrollment.id, Buffer.concat([OGG, Buffer.alloc(10 * 1024 * 1024)]));

    expect(res.status).toBe(413);
  });

  it("can't send feedback to students outside the teacher's groups, or to pending applicants", async () => {
    const { enrollment } = await classroom();
    const otherTeacherAuth = await bearer(app, await createUser({ role: "TEACHER" }));
    const mine = await classroom();
    await prisma.enrollment.update({ where: { id: mine.enrollment.id }, data: { status: "PENDING" } });

    expect((await sendText(otherTeacherAuth, enrollment.id)).status).toBe(404);
    expect((await sendText(mine.teacherAuth, mine.enrollment.id)).status).toBe(404);
    expect(await prisma.feedback.count()).toBe(0);
  });

  it("is for teachers only", async () => {
    const { enrollment, studentAuth } = await classroom();
    const adminAuth = await bearer(app, await createUser({ role: "ADMIN" }));

    expect((await sendText(studentAuth, enrollment.id)).status).toBe(403);
    expect((await sendText(adminAuth, enrollment.id)).status).toBe(403);
  });

  it("lists what the teacher has sent", async () => {
    const { enrollment, teacherAuth } = await classroom();
    await sendText(teacherAuth, enrollment.id, "First");
    await sendText(teacherAuth, enrollment.id, "Second");

    const res = await request(app).get(`/api/v1/teacher/feedback?enrollmentId=${enrollment.id}`).set("Authorization", teacherAuth);

    expect(res.body.data.feedback.map((f: { text: string }) => f.text)).toEqual(["Second", "First"]);
  });
});

describe("student reads feedback", () => {
  it("lists my feedback newest first with an unread count, and marks it read once", async () => {
    const { enrollment, teacherAuth, studentAuth } = await classroom();
    const first = (await sendText(teacherAuth, enrollment.id, "First")).body.data.feedback;
    await sendText(teacherAuth, enrollment.id, "Second");

    const before = await request(app).get("/api/v1/feedback/mine").set("Authorization", studentAuth);
    const read = await request(app).post(`/api/v1/feedback/${first.id}/read`).set("Authorization", studentAuth);
    const readAgain = await request(app).post(`/api/v1/feedback/${first.id}/read`).set("Authorization", studentAuth);
    const after = await request(app).get("/api/v1/feedback/mine").set("Authorization", studentAuth);

    expect(before.body.data.unreadCount).toBe(2);
    expect(before.body.data.feedback.map((f: { text: string }) => f.text)).toEqual(["Second", "First"]);
    expect(read.body.data.feedback.readAt).not.toBeNull();
    expect(readAgain.body.data.feedback.readAt).toBe(read.body.data.feedback.readAt);
    expect(after.body.data.unreadCount).toBe(1);
  });

  it("can't read or mark another student's feedback", async () => {
    const { enrollment, teacherAuth } = await classroom();
    const { id } = (await sendText(teacherAuth, enrollment.id)).body.data.feedback;
    const otherStudent = await bearer(app, await createUser({ role: "STUDENT" }));

    const list = await request(app).get("/api/v1/feedback/mine").set("Authorization", otherStudent);
    const mark = await request(app).post(`/api/v1/feedback/${id}/read`).set("Authorization", otherStudent);

    expect(list.body.data.feedback).toEqual([]);
    expect(mark.status).toBe(404);
  });
});

describe("playing a voice note", () => {
  async function voiceNote() {
    const c = await classroom();
    const { id } = (await sendVoice(c.teacherAuth, c.enrollment.id)).body.data.feedback;
    return { ...c, url: `/api/v1/feedback/${id}/voice` };
  }

  it("plays for the student and the teacher who recorded it, privately", async () => {
    const { url, studentAuth, teacherAuth } = await voiceNote();

    const student = await request(app).get(url).set("Authorization", studentAuth).buffer(true);
    const teacher = await request(app).get(url).set("Authorization", teacherAuth);

    expect(student.status).toBe(200);
    expect(student.headers["content-type"]).toBe("audio/ogg");
    expect(student.headers["cache-control"]).toBe("private, no-store");
    expect(Buffer.compare(student.body, OGG)).toBe(0);
    expect(teacher.status).toBe(200);
  });

  it("supports skipping ahead (Range requests), which phone players need", async () => {
    const { url, studentAuth } = await voiceNote();

    const res = await request(app).get(url).set("Authorization", studentAuth).set("Range", "bytes=0-3").buffer(true);

    expect(res.status).toBe(206);
    expect(res.body.toString()).toBe("OggS");
  });

  it("is hidden from other students and other teachers; admins can listen", async () => {
    const { url } = await voiceNote();
    const otherStudent = await bearer(app, await createUser({ role: "STUDENT" }));
    const otherTeacher = await bearer(app, await createUser({ role: "TEACHER" }));
    const admin = await bearer(app, await createUser({ role: "ADMIN" }));

    expect((await request(app).get(url).set("Authorization", otherStudent)).status).toBe(404);
    expect((await request(app).get(url).set("Authorization", otherTeacher)).status).toBe(404);
    expect((await request(app).get(url).set("Authorization", admin)).status).toBe(200);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe("detectAudioType", () => {
  it("recognises common voice-note formats by their bytes", () => {
    expect(detectAudioType(OGG)).toBe("ogg");
    expect(detectAudioType(M4A)).toBe("m4a");
    expect(detectAudioType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("webm");
    expect(detectAudioType(Buffer.from("ID3\u0004\u0000"))).toBe("mp3");
    expect(detectAudioType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]))).toBe("wav");
    expect(detectAudioType(Buffer.from("%PDF-1.7"))).toBeNull();
  });
});
