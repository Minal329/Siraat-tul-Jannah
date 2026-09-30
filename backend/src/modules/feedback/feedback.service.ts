// Teacher → student feedback: a written note, a voice note, or both
// (e.g. correcting a student's recitation out loud).
//
// Only the teacher of the student's class group can send it. Voice notes are
// private: the student, the teacher who recorded it, and admins can play them.
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { Role } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { type AudioFileType, locateFile, saveFile } from "../../lib/storage.ts";
import { AppError } from "../../utils/AppError.ts";
import { loadGroupFor } from "../sessions/sessions.service.ts";
import { getStudentId, getTeacherId } from "../users/users.service.ts";
import type { SendFeedbackInput } from "./feedback.schemas.ts";

type Auth = { userId: string; role: Role };

const feedbackNotFound = () => new AppError(404, "NOT_FOUND", "Feedback not found.");

const feedbackDetails = {
  teacher: { select: { fullName: true } },
  student: { select: { fullName: true } },
  enrollment: { select: { id: true, course: { select: { title: true } } } },
} as const;
type FeedbackWithDetails = Prisma.FeedbackGetPayload<{ include: typeof feedbackDetails }>;

function toFeedback(feedback: FeedbackWithDetails) {
  return {
    id: feedback.id,
    type: feedback.type,
    text: feedback.textContent,
    // The file itself is never linked directly; this URL checks who is asking first.
    voiceUrl: feedback.voiceUrl ? `/api/v1/feedback/${feedback.id}/voice` : null,
    voiceDurationSeconds: feedback.voiceDurationSeconds,
    readAt: feedback.readAt,
    sentAt: feedback.createdAt,
    teacherName: feedback.teacher.fullName,
    studentName: feedback.student.fullName,
    enrollmentId: feedback.enrollment?.id ?? null,
    courseTitle: feedback.enrollment?.course.title ?? null,
  };
}

// ── Teachers ──────────────────────────────────────────────────────

export async function sendFeedback(auth: Auth, input: SendFeedbackInput, voice?: { data: Buffer; type: AudioFileType }) {
  if (!voice && !input.text) {
    throw new AppError(400, "FEEDBACK_EMPTY", "Write a message or attach a voice note.");
  }

  const teacherId = await getTeacherId(auth.userId);
  const enrollment = await prisma.enrollment.findUnique({ where: { id: input.enrollmentId } });

  // Only students currently in (or who finished) one of this teacher's groups.
  const notInMyClasses = () => new AppError(404, "NOT_FOUND", "Student not found in your classes.");
  if (!enrollment || !enrollment.classGroupId) throw notInMyClasses();
  if (enrollment.status !== "APPROVED" && enrollment.status !== "COMPLETED") throw notInMyClasses();
  await loadGroupFor(auth, enrollment.classGroupId).catch(() => {
    throw notInMyClasses();
  });

  const voiceUrl = voice ? await saveFile("feedback", voice.data, voice.type) : null;
  const feedback = await prisma.feedback.create({
    data: {
      studentId: enrollment.studentId,
      teacherId,
      enrollmentId: enrollment.id,
      type: voice ? "VOICE" : "TEXT",
      textContent: input.text ?? null,
      voiceUrl,
      voiceDurationSeconds: voice ? (input.durationSeconds ?? null) : null,
    },
    include: feedbackDetails,
  });
  return { feedback: toFeedback(feedback) };
}

export async function listSentFeedback(auth: Auth, enrollmentId?: string) {
  const teacherId = await getTeacherId(auth.userId);
  const feedback = await prisma.feedback.findMany({
    where: { teacherId, ...(enrollmentId ? { enrollmentId } : {}) },
    include: feedbackDetails,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { feedback: feedback.map(toFeedback) };
}

// ── Students ──────────────────────────────────────────────────────

export async function listMyFeedback(userId: string) {
  const studentId = await getStudentId(userId);
  const feedback = await prisma.feedback.findMany({
    where: { studentId },
    include: feedbackDetails,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    unreadCount: feedback.filter((f) => !f.readAt).length,
    feedback: feedback.map(toFeedback),
  };
}

export async function markRead(userId: string, feedbackId: string) {
  const studentId = await getStudentId(userId);
  // Only the student it was sent to; reading twice keeps the first time.
  await prisma.feedback.updateMany({ where: { id: feedbackId, studentId, readAt: null }, data: { readAt: new Date() } });
  const feedback = await prisma.feedback.findFirst({ where: { id: feedbackId, studentId }, include: feedbackDetails });
  if (!feedback) throw feedbackNotFound();
  return { feedback: toFeedback(feedback) };
}

// ── Voice note file ───────────────────────────────────────────────

// The student it was sent to, the teacher who recorded it, or an admin.
// Everyone else gets 404, exactly as if it didn't exist.
export async function findVoiceFile(auth: Auth, feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { voiceUrl: true, student: { select: { userId: true } }, teacher: { select: { userId: true } } },
  });
  if (!feedback?.voiceUrl) throw feedbackNotFound();

  const allowed =
    auth.role === "ADMIN" || feedback.student.userId === auth.userId || feedback.teacher.userId === auth.userId;
  if (!allowed) throw feedbackNotFound();

  const file = locateFile(feedback.voiceUrl);
  if (!file) throw new AppError(404, "NOT_FOUND", "The voice note file is missing.");
  return file;
}
