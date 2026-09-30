// Live classes ("sessions") and attendance.
//
// Teachers schedule classes for their own class groups and mark who attended.
// Admins can do the same for any group. Students see their upcoming classes and
// their own attendance record.
import type { Role } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { getStudentId, getTeacherId } from "../users/users.service.ts";
import type { AttendanceInput, CreateSessionInput, UpdateSessionInput } from "./sessions.schemas.ts";

type Auth = { userId: string; role: Role };

const groupNotFound = () => new AppError(404, "NOT_FOUND", "Class group not found.");
const sessionNotFound = () => new AppError(404, "NOT_FOUND", "Class not found.");

// Students who belong to a group's roster: currently studying, or finished the course
// (so old attendance can still be corrected after someone completes).
const ROSTER_STATUSES = ["APPROVED", "COMPLETED"] as const;

// Who's asking? Admins may act on any group; teachers only on their own.
// Another teacher's group answers 404, exactly as if it didn't exist.
async function teacherScope(auth: Auth) {
  if (auth.role === "ADMIN") return { teacherId: null, isAdmin: true };
  return { teacherId: await getTeacherId(auth.userId), isAdmin: false };
}

export async function loadGroupFor(auth: Auth, classGroupId: string) {
  const scope = await teacherScope(auth);
  const group = await prisma.classGroup.findUnique({
    where: { id: classGroupId },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!group || (!scope.isAdmin && group.teacherId !== scope.teacherId)) throw groupNotFound();
  return { group, scope };
}

async function loadSessionFor(auth: Auth, sessionId: string) {
  const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
  if (!session) throw sessionNotFound();
  try {
    const { group, scope } = await loadGroupFor(auth, session.classGroupId);
    return { session, group, scope };
  } catch {
    throw sessionNotFound();
  }
}

async function roster(classGroupId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { classGroupId, status: { in: [...ROSTER_STATUSES] } },
    include: { student: { select: { id: true, fullName: true } } },
    orderBy: { student: { fullName: "asc" } },
  });
  return enrollments.map((e) => ({
    studentId: e.student.id,
    enrollmentId: e.id,
    fullName: e.student.fullName,
    enrollmentStatus: e.status,
  }));
}

// ── Teachers (and admins) ─────────────────────────────────────────

export async function listMyGroups(auth: Auth) {
  const scope = await teacherScope(auth);
  const groups = await prisma.classGroup.findMany({
    where: { isActive: true, ...(scope.isAdmin ? {} : { teacherId: scope.teacherId }) },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { enrollments: { where: { status: "APPROVED" } } } },
    },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
  });
  return {
    classGroups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      scheduleText: g.scheduleText,
      startDate: g.startDate,
      endDate: g.endDate,
      course: g.course,
      studentCount: g._count.enrollments,
    })),
  };
}

export async function getGroupForTeacher(auth: Auth, classGroupId: string) {
  const { group } = await loadGroupFor(auth, classGroupId);
  return {
    classGroup: {
      id: group.id,
      name: group.name,
      scheduleText: group.scheduleText,
      startDate: group.startDate,
      endDate: group.endDate,
      whatsappGroupLink: group.whatsappGroupLink,
      zoomMeetingId: group.zoomMeetingId,
      zoomPasscode: group.zoomPasscode,
      course: group.course,
      students: await roster(group.id),
    },
  };
}

export async function listSessions(auth: Auth, classGroupId: string) {
  await loadGroupFor(auth, classGroupId);
  const sessions = await prisma.classSession.findMany({
    where: { classGroupId },
    orderBy: { scheduledAt: "desc" },
    include: { attendance: { select: { status: true } } },
  });
  return {
    sessions: sessions.map((s) => ({
      ...toSession(s),
      attendanceMarked: s.attendance.length,
      present: s.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length,
    })),
  };
}

export async function scheduleSession(auth: Auth, classGroupId: string, input: CreateSessionInput) {
  const { group } = await loadGroupFor(auth, classGroupId);
  if (!group.isActive) throw new AppError(409, "GROUP_INACTIVE", "This class group is no longer active.");

  const session = await prisma.classSession.create({ data: { classGroupId, ...input } });
  return { session: toSession(session) };
}

export async function updateSession(auth: Auth, sessionId: string, changes: UpdateSessionInput) {
  await loadSessionFor(auth, sessionId);
  const session = await prisma.classSession.update({ where: { id: sessionId }, data: changes });
  return { session: toSession(session) };
}

// The roster for a class, each student with their mark (or null if not marked yet).
export async function getAttendance(auth: Auth, sessionId: string) {
  const { session, group } = await loadSessionFor(auth, sessionId);
  const marks = await prisma.attendance.findMany({ where: { classSessionId: sessionId } });
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  return {
    session: toSession(session),
    students: (await roster(group.id)).map((student) => ({
      ...student,
      status: byStudent.get(student.studentId)?.status ?? null,
      note: byStudent.get(student.studentId)?.note ?? null,
    })),
  };
}

// Mark (or correct) attendance. Only students in this group's roster can be marked,
// and only for a class that has started and wasn't cancelled.
export async function markAttendance(auth: Auth, sessionId: string, input: AttendanceInput) {
  const { session, group, scope } = await loadSessionFor(auth, sessionId);

  if (session.status === "CANCELLED") {
    throw new AppError(409, "SESSION_CANCELLED", "This class was cancelled, so attendance can't be marked.");
  }
  if (session.scheduledAt > new Date()) {
    throw new AppError(409, "SESSION_NOT_STARTED", "Attendance can be marked once the class has started.");
  }

  const allowed = new Set((await roster(group.id)).map((s) => s.studentId));
  const outsiders = input.records.filter((r) => !allowed.has(r.studentId)).map((r) => r.studentId);
  if (outsiders.length > 0) {
    throw new AppError(400, "NOT_IN_GROUP", "Some students aren't in this class group.", { studentIds: outsiders });
  }

  await prisma.$transaction(
    input.records.map((record) =>
      prisma.attendance.upsert({
        where: { classSessionId_studentId: { classSessionId: sessionId, studentId: record.studentId } },
        create: { classSessionId: sessionId, studentId: record.studentId, status: record.status, note: record.note, markedById: scope.teacherId },
        update: { status: record.status, note: record.note ?? null, markedById: scope.teacherId },
      }),
    ),
  );
  return getAttendance(auth, sessionId);
}

function toSession(session: { id: string; topic: string | null; scheduledAt: Date; durationMinutes: number; status: string }) {
  return {
    id: session.id,
    topic: session.topic,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    status: session.status,
  };
}

// ── Students ──────────────────────────────────────────────────────

// Upcoming classes (including one that's happening now) for all my current courses.
export async function mySchedule(userId: string) {
  const studentId = await getStudentId(userId);
  const groups = await prisma.enrollment.findMany({
    where: { studentId, status: "APPROVED", classGroupId: { not: null } },
    select: { classGroupId: true },
  });
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000); // classes are at most 4 hours long

  const sessions = await prisma.classSession.findMany({
    where: {
      classGroupId: { in: groups.map((g) => g.classGroupId!) },
      status: { in: ["SCHEDULED", "LIVE"] },
      scheduledAt: { gte: since },
    },
    include: { classGroup: { select: { id: true, name: true, course: { select: { title: true } } } } },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  const now = Date.now();
  return {
    sessions: sessions
      .filter((s) => s.scheduledAt.getTime() + s.durationMinutes * 60_000 > now) // drop ones already over
      .map((s) => ({
        ...toSession(s),
        classGroup: { id: s.classGroup.id, name: s.classGroup.name },
        courseTitle: s.classGroup.course.title,
      })),
  };
}

// My attendance for one enrollment: every class so far, and a summary.
export async function myAttendance(userId: string, enrollmentId: string) {
  const studentId = await getStudentId(userId);
  const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId } });
  if (!enrollment) throw new AppError(404, "NOT_FOUND", "Enrollment not found.");
  if (!enrollment.classGroupId) {
    return { sessions: [], summary: summarise([]) };
  }

  const sessions = await prisma.classSession.findMany({
    where: { classGroupId: enrollment.classGroupId, status: { not: "CANCELLED" }, scheduledAt: { lte: new Date() } },
    include: { attendance: { where: { studentId } } },
    orderBy: { scheduledAt: "desc" },
  });

  const rows = sessions.map((s) => ({ ...toSession(s), attendance: s.attendance[0]?.status ?? null }));
  return { sessions: rows, summary: summarise(rows.map((r) => r.attendance)) };
}

function summarise(marks: (string | null)[]) {
  const count = (status: string) => marks.filter((m) => m === status).length;
  const present = count("PRESENT");
  const late = count("LATE");
  const marked = marks.filter((m) => m !== null).length;
  return {
    classes: marks.length,
    present,
    late,
    absent: count("ABSENT"),
    excused: count("EXCUSED"),
    notMarked: marks.length - marked,
    // Late still counts as attending. Excused classes don't count against the student.
    attendanceRate: marked - count("EXCUSED") > 0 ? Math.round(((present + late) / (marked - count("EXCUSED"))) * 100) : null,
  };
}
