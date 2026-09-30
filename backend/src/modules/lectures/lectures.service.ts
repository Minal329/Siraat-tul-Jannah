// Recorded lectures: links to videos hosted on a video service, shared with a
// whole course or with one class group. Teachers add them for courses they
// teach; admins for any course. Students see the published ones for their courses.
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { Role } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { loadGroupFor } from "../sessions/sessions.service.ts";
import { getStudentId, getTeacherId } from "../users/users.service.ts";
import type { CreateLectureInput, UpdateLectureInput } from "./lectures.schemas.ts";

type Auth = { userId: string; role: Role };

const lectureNotFound = () => new AppError(404, "NOT_FOUND", "Lecture not found.");

// Turns a YouTube or Vimeo link into the address used to play it inside the app.
// Other services return null and the apps simply open the link.
export function toEmbedUrl(videoUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const youtubeId =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : host === "youtube.com"
        ? (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? null)
        : null;
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) return `https://www.youtube-nocookie.com/embed/${youtubeId}`;

  const vimeoId = host === "vimeo.com" ? url.pathname.match(/^\/(\d+)/)?.[1] : null;
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
  return null;
}

const lectureDetails = {
  course: { select: { id: true, title: true } },
  classGroup: { select: { id: true, name: true } },
  uploadedBy: { select: { fullName: true } },
} as const;
type LectureWithDetails = Prisma.RecordedLectureGetPayload<{ include: typeof lectureDetails }>;

function toLecture(lecture: LectureWithDetails) {
  return {
    id: lecture.id,
    title: lecture.title,
    description: lecture.description,
    videoUrl: lecture.videoUrl,
    embedUrl: toEmbedUrl(lecture.videoUrl),
    durationSeconds: lecture.durationSeconds,
    sortOrder: lecture.sortOrder,
    published: lecture.publishedAt !== null,
    publishedAt: lecture.publishedAt,
    course: lecture.course,
    classGroup: lecture.classGroup,
    teacherName: lecture.uploadedBy?.fullName ?? null,
  };
}

// A teacher may add lectures to a course they teach (or to one of their own groups).
async function assertCanPublishTo(auth: Auth, courseId: string, classGroupId?: string) {
  if (classGroupId) {
    const { group } = await loadGroupFor(auth, classGroupId).catch(() => {
      throw new AppError(400, "INVALID_CLASS_GROUP", "That class group isn't one of yours.");
    });
    if (group.courseId !== courseId) {
      throw new AppError(400, "INVALID_CLASS_GROUP", "That class group belongs to a different course.");
    }
    return;
  }
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new AppError(400, "INVALID_COURSE", "That course doesn't exist.");
  if (auth.role === "ADMIN") return;

  const teacherId = await getTeacherId(auth.userId);
  const teaches = await prisma.classGroup.count({ where: { courseId, teacherId } });
  if (teaches === 0) throw new AppError(400, "INVALID_COURSE", "You don't teach this course.");
}

export async function createLecture(auth: Auth, input: CreateLectureInput) {
  await assertCanPublishTo(auth, input.courseId, input.classGroupId);
  const { published, ...fields } = input;
  const lecture = await prisma.recordedLecture.create({
    data: {
      ...fields,
      uploadedById: auth.role === "TEACHER" ? await getTeacherId(auth.userId) : null,
      publishedAt: published ? new Date() : null,
    },
    include: lectureDetails,
  });
  return { lecture: toLecture(lecture) };
}

// The teacher who added it, or an admin, can edit or (un)publish it.
export async function updateLecture(auth: Auth, id: string, changes: UpdateLectureInput) {
  const existing = await prisma.recordedLecture.findUnique({ where: { id } });
  if (!existing) throw lectureNotFound();
  if (auth.role !== "ADMIN" && existing.uploadedById !== (await getTeacherId(auth.userId))) throw lectureNotFound();

  const { published, ...fields } = changes;
  const lecture = await prisma.recordedLecture.update({
    where: { id },
    data: {
      ...fields,
      ...(published === undefined ? {} : { publishedAt: published ? (existing.publishedAt ?? new Date()) : null }),
    },
    include: lectureDetails,
  });
  return { lecture: toLecture(lecture) };
}

// Teachers: lectures for the courses they teach. Admins: all.
export async function listForTeacher(auth: Auth, courseId?: string) {
  let courseFilter: Prisma.RecordedLectureWhereInput = courseId ? { courseId } : {};
  if (auth.role !== "ADMIN") {
    const teacherId = await getTeacherId(auth.userId);
    const groups = await prisma.classGroup.findMany({ where: { teacherId }, select: { courseId: true } });
    const myCourses = [...new Set(groups.map((g) => g.courseId))];
    courseFilter = { courseId: courseId ? { in: myCourses.filter((id) => id === courseId) } : { in: myCourses } };
  }
  const lectures = await prisma.recordedLecture.findMany({
    where: courseFilter,
    include: lectureDetails,
    orderBy: [{ courseId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return { lectures: lectures.map(toLecture) };
}

// Students: published lectures for courses they're in (or finished), either shared
// with the whole course or with their own class group.
export async function listForStudent(userId: string) {
  const studentId = await getStudentId(userId);
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: { in: ["APPROVED", "COMPLETED"] } },
    select: { courseId: true, classGroupId: true },
  });
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const groupIds = enrollments.flatMap((e) => (e.classGroupId ? [e.classGroupId] : []));

  const lectures = await prisma.recordedLecture.findMany({
    where: {
      courseId: { in: courseIds },
      publishedAt: { not: null },
      OR: [{ classGroupId: null }, { classGroupId: { in: groupIds } }],
    },
    include: lectureDetails,
    orderBy: [{ courseId: "asc" }, { sortOrder: "asc" }, { publishedAt: "asc" }],
  });
  return { lectures: lectures.map(toLecture) };
}
