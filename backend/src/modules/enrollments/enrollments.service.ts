// Students applying for courses.
//
// The key rule: a student may hold only ONE pending/approved enrollment per course.
// Checked here first (friendly message), and guaranteed by the database's partial
// unique index enrollments_one_active_per_student_course (e.g. for a double-tap
// that sends two requests at the same moment).
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";

const ACTIVE_STATUSES = ["PENDING", "APPROVED"] as const;

const enrollmentExists = () =>
  new AppError(409, "ENROLLMENT_EXISTS", "You already have an active enrollment in this course.");
const enrollmentNotFound = () => new AppError(404, "NOT_FOUND", "Enrollment not found.");

const enrollmentDetails = {
  course: { select: { id: true, title: true, slug: true, feePkr: true } },
  classGroup: { include: { teacher: { select: { fullName: true } } } },
  certificate: { select: { certificateNumber: true, issuedAt: true } },
} as const;
type EnrollmentWithDetails = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentDetails }>;

function toStudentEnrollment(enrollment: EnrollmentWithDetails) {
  const group = enrollment.classGroup;
  return {
    id: enrollment.id,
    status: enrollment.status,
    appliedAt: enrollment.createdAt,
    approvedAt: enrollment.approvedAt,
    completedAt: enrollment.completedAt,
    rejectionReason: enrollment.rejectionReason,
    course: enrollment.course,
    classGroup: group
      ? {
          id: group.id,
          name: group.name,
          scheduleText: group.scheduleText,
          startDate: group.startDate,
          endDate: group.endDate,
          teacherName: group.teacher?.fullName ?? null,
        }
      : null,
    certificate: enrollment.certificate,
  };
}

// Students are identified by their login (users.id); enrollments point at students.id.
export async function getStudentId(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw new AppError(403, "FORBIDDEN", "Only students can do this.");
  return student.id;
}

export async function enroll(userId: string, courseId: string) {
  const studentId = await getStudentId(userId);

  const course = await prisma.course.findFirst({ where: { id: courseId, isPublished: true }, select: { id: true } });
  if (!course) throw new AppError(404, "NOT_FOUND", "Course not found.");

  const existing = await prisma.enrollment.findFirst({
    where: { studentId, courseId, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true },
  });
  if (existing) throw enrollmentExists();

  try {
    const enrollment = await prisma.enrollment.create({
      data: { studentId, courseId, status: "PENDING" },
      include: enrollmentDetails,
    });
    return { enrollment: toStudentEnrollment(enrollment) };
  } catch (err) {
    // Two requests raced past the check above; the database index stopped the second.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw enrollmentExists();
    throw err;
  }
}

export async function listMyEnrollments(userId: string) {
  const studentId = await getStudentId(userId);
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: enrollmentDetails,
    orderBy: { createdAt: "desc" },
  });
  return { enrollments: enrollments.map(toStudentEnrollment) };
}

// A student can withdraw an application that hasn't been approved yet.
export async function cancelMyEnrollment(userId: string, enrollmentId: string) {
  const studentId = await getStudentId(userId);

  // Only this student's PENDING enrollment changes — never someone else's.
  const { count } = await prisma.enrollment.updateMany({
    where: { id: enrollmentId, studentId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  if (count === 0) {
    const mine = await prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId }, select: { status: true } });
    // Someone else's enrollment looks exactly like a missing one, so IDs can't be probed.
    if (!mine) throw enrollmentNotFound();
    throw new AppError(409, "CANNOT_CANCEL", "Only pending applications can be cancelled. Please contact the academy.");
  }

  const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: enrollmentDetails });
  return { enrollment: toStudentEnrollment(enrollment) };
}
