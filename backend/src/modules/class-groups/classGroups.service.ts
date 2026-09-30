// Class groups: one teacher teaching one batch of a course on a schedule,
// e.g. "Tajweed — Batch 3 — Evening". Admins create and edit them; approved
// students are placed into them (see enrollments.admin.service.ts).
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { createRecurringMeeting, zoomConfigured } from "../../lib/zoom.ts";
import { AppError } from "../../utils/AppError.ts";
import type { CreateClassGroupInput, UpdateClassGroupInput } from "./classGroups.schemas.ts";

const groupNotFound = () => new AppError(404, "NOT_FOUND", "Class group not found.");

const groupDetails = {
  course: { select: { id: true, title: true } },
  teacher: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: { where: { status: "APPROVED" } } } },
} as const;
type GroupWithDetails = Prisma.ClassGroupGetPayload<{ include: typeof groupDetails }>;

// Admins see everything, including Zoom and WhatsApp details.
function toAdminGroup(group: GroupWithDetails) {
  return {
    id: group.id,
    name: group.name,
    batchLabel: group.batchLabel,
    scheduleText: group.scheduleText,
    startDate: group.startDate,
    endDate: group.endDate,
    maxStudents: group.maxStudents,
    studentCount: group._count.enrollments,
    zoomMeetingId: group.zoomMeetingId,
    zoomPasscode: group.zoomPasscode,
    zoomJoinUrl: group.zoomJoinUrl,
    whatsappGroupLink: group.whatsappGroupLink,
    isActive: group.isActive,
    course: group.course,
    teacher: group.teacher,
  };
}

async function assertTeacherExists(teacherId: string | null | undefined) {
  if (!teacherId) return;
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { user: { select: { isActive: true } } } });
  if (!teacher) throw new AppError(400, "INVALID_TEACHER", "That teacher doesn't exist.");
  if (!teacher.user.isActive) throw new AppError(400, "INVALID_TEACHER", "That teacher's account is disabled.");
}

export async function listClassGroups(courseId?: string) {
  const groups = await prisma.classGroup.findMany({
    where: courseId ? { courseId } : {},
    include: groupDetails,
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }, { name: "asc" }],
  });
  return { classGroups: groups.map(toAdminGroup) };
}

// One group plus its roster of approved students.
export async function getClassGroup(id: string) {
  const group = await prisma.classGroup.findUnique({
    where: { id },
    include: {
      ...groupDetails,
      enrollments: {
        where: { status: "APPROVED" },
        orderBy: { approvedAt: "asc" },
        include: { student: { select: { id: true, fullName: true, whatsappNumber: true } } },
      },
    },
  });
  if (!group) throw groupNotFound();
  return {
    classGroup: {
      ...toAdminGroup(group),
      students: group.enrollments.map((e) => ({ enrollmentId: e.id, approvedAt: e.approvedAt, ...e.student })),
    },
  };
}

export async function createClassGroup(input: CreateClassGroupInput) {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true } });
  if (!course) throw new AppError(400, "INVALID_COURSE", "That course doesn't exist.");
  await assertTeacherExists(input.teacherId);

  const group = await prisma.classGroup.create({ data: input, include: groupDetails });
  return { classGroup: toAdminGroup(group) };
}

export async function updateClassGroup(id: string, changes: UpdateClassGroupInput) {
  const current = await prisma.classGroup.findUnique({ where: { id }, include: groupDetails });
  if (!current) throw groupNotFound();
  await assertTeacherExists(changes.teacherId);

  // Check the dates as they'll be after the change, not just the fields sent.
  const startDate = changes.startDate !== undefined ? changes.startDate : current.startDate;
  const endDate = changes.endDate !== undefined ? changes.endDate : current.endDate;
  if (startDate && endDate && startDate > endDate) {
    throw new AppError(400, "INVALID_DATES", "The end date must be on or after the start date.");
  }

  if (changes.maxStudents != null && changes.maxStudents < current._count.enrollments) {
    throw new AppError(
      409,
      "GROUP_TOO_SMALL",
      `This group already has ${current._count.enrollments} students. Move some to another group first.`,
    );
  }

  // A meeting ID typed by hand replaces one created through Zoom, so its saved link no longer applies.
  const zoomEdited = changes.zoomMeetingId !== undefined || changes.zoomPasscode !== undefined;
  const group = await prisma.classGroup.update({
    where: { id },
    data: { ...changes, ...(zoomEdited ? { zoomJoinUrl: null } : {}) },
    include: groupDetails,
  });
  return { classGroup: toAdminGroup(group) };
}

// Create a Zoom meeting for this group through the Zoom API and save its details.
// Replaces any meeting ID that was there before.
export async function createZoomMeeting(id: string) {
  const current = await prisma.classGroup.findUnique({ where: { id }, include: groupDetails });
  if (!current) throw groupNotFound();
  const meeting = await createRecurringMeeting(`${current.course.title} — ${current.name}`);
  const group = await prisma.classGroup.update({
    where: { id },
    data: { zoomMeetingId: meeting.meetingId, zoomPasscode: meeting.passcode, zoomJoinUrl: meeting.joinUrl },
    include: groupDetails,
  });
  return { classGroup: toAdminGroup(group) };
}

export function zoomStatus() {
  return { zoomConfigured: zoomConfigured() };
}
