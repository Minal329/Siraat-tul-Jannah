// Live classes ("sessions") and attendance.
//
// Teachers schedule classes for their own class groups and mark who attended.
// Admins can do the same for any group. Students see their upcoming classes and
// their own attendance record.
import { Prisma } from "../../../generated/prisma/client.ts";
import type { Role } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { zoomJoinLink } from "../../lib/zoom.ts";
import { AppError } from "../../utils/AppError.ts";
import { getStudentId, getTeacherId } from "../users/users.service.ts";
import type { AttendanceInput, CreateSessionInput, JoinLiveInput, StartSessionInput, UpdateLiveInput, UpdateSessionInput } from "./sessions.schemas.ts";

type Auth = { userId: string; role: Role };

const groupNotFound = () => new AppError(404, "NOT_FOUND", "Class group not found.");
const sessionNotFound = () => new AppError(404, "NOT_FOUND", "Class not found.");

// Students who belong to a group's roster: currently studying, or finished the course
// (so old attendance can still be corrected after someone completes).
const ROSTER_STATUSES = ["APPROVED", "COMPLETED"] as const;

const HOUR = 60 * 60 * 1000;
// A class may be started up to an hour before its scheduled time.
const EARLIEST_START = HOUR;
// A class left "live" (the teacher forgot to press End) stops showing as live to
// students after this long.
const LIVE_FOR_AT_MOST = 6 * HOUR;

type SessionRow = {
  id: string;
  topic: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  livePlatform: string | null;
  liveNote: string | null;
};

export function isLiveNow(session: Pick<SessionRow, "status" | "startedAt">, now = Date.now()) {
  return session.status === "LIVE" && session.startedAt !== null && now - session.startedAt.getTime() < LIVE_FOR_AT_MOST;
}

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
  const { session: current } = await loadSessionFor(auth, sessionId);
  if (changes.status && current.status === "LIVE") {
    throw new AppError(409, "SESSION_LIVE", "This class is live right now. End it first.");
  }
  const session = await prisma.classSession.update({ where: { id: sessionId }, data: changes });
  return { session: toSession(session) };
}

// ── Live classes ──────────────────────────────────────────────────
// SCHEDULED ──start──▶ LIVE ──end──▶ COMPLETED. While live, the teacher can switch
// between Zoom and WhatsApp (the low-bandwidth fallback) and leave students a note.

export async function startSession(auth: Auth, sessionId: string, input: StartSessionInput) {
  const { session, group } = await loadSessionFor(auth, sessionId);
  if (session.status === "LIVE") return { session: toSession(session) }; // pressed twice
  if (session.status !== "SCHEDULED") {
    throw new AppError(409, "SESSION_NOT_STARTABLE", "Only a scheduled class can be started.");
  }
  if (!group.isActive) throw new AppError(409, "GROUP_INACTIVE", "This class group is no longer active.");
  if (session.scheduledAt.getTime() - Date.now() > EARLIEST_START) {
    throw new AppError(409, "TOO_EARLY", "A class can be started up to an hour before its scheduled time.");
  }

  const now = new Date();
  try {
    const [, started] = await prisma.$transaction([
      // If an earlier class in this group was never ended, end it now.
      prisma.classSession.updateMany({
        where: { classGroupId: group.id, status: "LIVE", id: { not: sessionId } },
        data: { status: "COMPLETED", endedAt: now },
      }),
      prisma.classSession.update({
        where: { id: sessionId },
        data: { status: "LIVE", startedAt: now, endedAt: null, livePlatform: input.platform, liveNote: input.note ?? null },
      }),
    ]);
    return { session: toSession(started) };
  } catch (err) {
    // Two classes of the same group started at the same moment: the database's
    // one-live-class-per-group index lets only one through.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "ANOTHER_CLASS_LIVE", "Another class in this group was started at the same moment. Refresh and try again.");
    }
    throw err;
  }
}

export async function updateLive(auth: Auth, sessionId: string, changes: UpdateLiveInput) {
  const { session } = await loadSessionFor(auth, sessionId);
  if (session.status !== "LIVE") throw new AppError(409, "SESSION_NOT_LIVE", "This class isn't live.");
  const updated = await prisma.classSession.update({
    where: { id: sessionId },
    data: {
      ...(changes.platform ? { livePlatform: changes.platform } : {}),
      ...(changes.note !== undefined ? { liveNote: changes.note } : {}),
    },
  });
  return { session: toSession(updated) };
}

export async function endSession(auth: Auth, sessionId: string) {
  const { session } = await loadSessionFor(auth, sessionId);
  if (session.status !== "LIVE") throw new AppError(409, "SESSION_NOT_LIVE", "This class isn't live.");
  const ended = await prisma.classSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", endedAt: new Date() } });
  return { session: toSession(ended) };
}

// The roster for a class, each student with their mark (or null if not marked yet)
// and when they pressed "Join" during the live class (a hint for marking).
export async function getAttendance(auth: Auth, sessionId: string) {
  const { session, group } = await loadSessionFor(auth, sessionId);
  const [marks, joins] = await Promise.all([
    prisma.attendance.findMany({ where: { classSessionId: sessionId } }),
    prisma.sessionJoin.findMany({ where: { classSessionId: sessionId } }),
  ]);
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  const joined = new Map(joins.map((j) => [j.studentId, j]));
  return {
    session: toSession(session),
    students: (await roster(group.id)).map((student) => ({
      ...student,
      status: byStudent.get(student.studentId)?.status ?? null,
      note: byStudent.get(student.studentId)?.note ?? null,
      joinedAt: joined.get(student.studentId)?.joinedAt ?? null,
      joinedVia: joined.get(student.studentId)?.platform ?? null,
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
  if (session.status !== "LIVE" && session.scheduledAt > new Date()) {
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

function toSession(session: SessionRow) {
  return {
    id: session.id,
    topic: session.topic,
    scheduledAt: session.scheduledAt,
    durationMinutes: session.durationMinutes,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    livePlatform: session.livePlatform,
    liveNote: session.liveNote,
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
  const since = new Date(Date.now() - LIVE_FOR_AT_MOST - 4 * HOUR); // classes are at most 4 hours long

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
      // Drop ones already over — but a live class stays until the teacher ends it (or it's clearly abandoned).
      .filter((s) => (s.status === "LIVE" ? isLiveNow(s, now) : s.scheduledAt.getTime() + s.durationMinutes * 60_000 > now))
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
    where: {
      classGroupId: enrollment.classGroupId,
      status: { not: "CANCELLED" },
      // Classes that have happened: their time has come, or the teacher started them early.
      OR: [{ scheduledAt: { lte: new Date() } }, { startedAt: { not: null } }],
    },
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

// ── Students: joining a live class ────────────────────────────────

async function myCurrentGroup(userId: string, enrollmentId: string) {
  const studentId = await getStudentId(userId);
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, studentId },
    include: { classGroup: true },
  });
  if (!enrollment) throw new AppError(404, "NOT_FOUND", "Enrollment not found.");
  if (enrollment.status !== "APPROVED" || !enrollment.classGroup) {
    throw new AppError(409, "NOT_IN_CLASS", "Live classes open once you're approved and placed in a class group.");
  }
  return { studentId, group: enrollment.classGroup };
}

async function liveSessionOf(classGroupId: string) {
  const session = await prisma.classSession.findFirst({ where: { classGroupId, status: "LIVE" } });
  return session && isLiveNow(session) ? session : null;
}

// Is my class live right now? (Apps check this every half minute on the Live Class screen.)
export async function myLiveClass(userId: string, enrollmentId: string) {
  const { studentId, group } = await myCurrentGroup(userId, enrollmentId);
  const session = await liveSessionOf(group.id);
  const join = session
    ? await prisma.sessionJoin.findUnique({ where: { classSessionId_studentId: { classSessionId: session.id, studentId } } })
    : null;
  return { session: session ? toSession(session) : null, joinedAt: join?.joinedAt ?? null };
}

// "Join" pressed: remember the first time (a hint for the teacher's attendance)
// and hand back the link to open.
export async function joinLiveClass(userId: string, enrollmentId: string, input: JoinLiveInput) {
  const { studentId, group } = await myCurrentGroup(userId, enrollmentId);
  const session = await liveSessionOf(group.id);
  if (!session) throw new AppError(409, "SESSION_NOT_LIVE", "Your class isn't live right now.");

  const joinUrl = input.platform === "ZOOM" ? zoomJoinLink(group) : group.whatsappGroupLink;
  if (!joinUrl) {
    throw new AppError(
      409,
      "NO_JOIN_LINK",
      input.platform === "ZOOM" ? "Your teacher hasn't added a Zoom meeting yet." : "Your teacher hasn't added a WhatsApp group yet.",
    );
  }

  const join = await prisma.sessionJoin.upsert({
    where: { classSessionId_studentId: { classSessionId: session.id, studentId } },
    create: { classSessionId: session.id, studentId, platform: input.platform },
    update: {}, // keep the first join
  });
  return { joinUrl, joinedAt: join.joinedAt };
}
