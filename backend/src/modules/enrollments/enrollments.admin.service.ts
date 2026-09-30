// The admin side of enrollments: review applications, approve them into a class
// group, reject them with a reason, move students between groups, and mark a
// course completed.
//
// Enrollment lifecycle:  PENDING ──approve──▶ APPROVED ──complete──▶ COMPLETED
//                           │                    └──move (same course, other group)
//                           └──reject──▶ REJECTED
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { EnrollmentStatus } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { toPaymentSummary } from "../payments/payments.service.ts";
import { getAdminId } from "../users/users.service.ts";

const enrollmentNotFound = () => new AppError(404, "NOT_FOUND", "Enrollment not found.");

const adminDetails = {
  student: { select: { id: true, fullName: true, whatsappNumber: true, user: { select: { email: true } } } },
  course: { select: { id: true, title: true, feePkr: true } },
  classGroup: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: "desc" } },
  certificate: { select: { certificateNumber: true, issuedAt: true } },
} as const;
type AdminEnrollment = Prisma.EnrollmentGetPayload<{ include: typeof adminDetails }>;

function toAdminEnrollment(enrollment: AdminEnrollment) {
  return {
    id: enrollment.id,
    status: enrollment.status,
    appliedAt: enrollment.createdAt,
    approvedAt: enrollment.approvedAt,
    completedAt: enrollment.completedAt,
    rejectionReason: enrollment.rejectionReason,
    student: {
      id: enrollment.student.id,
      fullName: enrollment.student.fullName,
      whatsappNumber: enrollment.student.whatsappNumber,
      email: enrollment.student.user.email,
    },
    course: enrollment.course,
    classGroup: enrollment.classGroup,
    certificate: enrollment.certificate,
    hasVerifiedPayment: enrollment.payments.some((p) => p.status === "VERIFIED"),
    payments: enrollment.payments.map(toPaymentSummary),
  };
}

async function loadForAdmin(id: string) {
  return toAdminEnrollment(await prisma.enrollment.findUniqueOrThrow({ where: { id }, include: adminDetails }));
}

export async function listEnrollments(filter: { status?: EnrollmentStatus; courseId?: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: filter,
    include: adminDetails,
    orderBy: { createdAt: "asc" }, // oldest first: first come, first served
  });
  return { enrollments: enrollments.map(toAdminEnrollment) };
}

// Inside a transaction: lock the group's row, then check it can take one more student.
// The lock (SELECT … FOR UPDATE) makes a second approval into the same group wait
// until this one finishes, so two admins can't both fill the last seat.
async function lockGroupWithRoom(tx: Prisma.TransactionClient, classGroupId: string, courseId: string) {
  await tx.$queryRaw`SELECT id FROM class_groups WHERE id = ${classGroupId}::uuid FOR UPDATE`;
  const group = await tx.classGroup.findUnique({ where: { id: classGroupId } });

  if (!group) throw new AppError(400, "INVALID_CLASS_GROUP", "That class group doesn't exist.");
  if (group.courseId !== courseId) {
    throw new AppError(400, "INVALID_CLASS_GROUP", "That class group belongs to a different course.");
  }
  if (!group.isActive) throw new AppError(400, "INVALID_CLASS_GROUP", "That class group is no longer active.");

  if (group.maxStudents !== null) {
    const taken = await tx.enrollment.count({ where: { classGroupId, status: "APPROVED" } });
    if (taken >= group.maxStudents) {
      throw new AppError(409, "GROUP_FULL", `${group.name} is full (${group.maxStudents} students). Choose another group.`);
    }
  }
}

export async function approveEnrollment(
  adminUserId: string,
  id: string,
  options: { classGroupId: string; approveWithoutPayment?: boolean },
) {
  const adminId = await getAdminId(adminUserId);

  await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id },
      include: { payments: { where: { status: "VERIFIED" }, select: { id: true } } },
    });
    if (!enrollment) throw enrollmentNotFound();
    if (enrollment.status !== "PENDING") {
      throw new AppError(409, "NOT_PENDING", `This enrollment is already ${enrollment.status.toLowerCase()}.`);
    }
    if (enrollment.payments.length === 0 && !options.approveWithoutPayment) {
      throw new AppError(
        409,
        "PAYMENT_NOT_VERIFIED",
        "This student has no verified payment yet. Approve anyway only if that's intended (e.g. a scholarship).",
      );
    }

    await lockGroupWithRoom(tx, options.classGroupId, enrollment.courseId);

    // Only a still-PENDING enrollment changes, in case another admin just acted on it.
    const { count } = await tx.enrollment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", classGroupId: options.classGroupId, approvedById: adminId, approvedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, "NOT_PENDING", "Another admin has just updated this enrollment.");
  });

  return { enrollment: await loadForAdmin(id) };
}

export async function rejectEnrollment(id: string, reason: string) {
  const { count } = await prisma.enrollment.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: reason },
  });
  if (count === 0) await explainNoChange(id, "PENDING");
  return { enrollment: await loadForAdmin(id) };
}

// Move an approved student to another group of the same course (e.g. a better time slot).
export async function moveEnrollment(id: string, classGroupId: string) {
  await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id } });
    if (!enrollment) throw enrollmentNotFound();
    if (enrollment.status !== "APPROVED") {
      throw new AppError(409, "NOT_APPROVED", "Only approved students can be moved between groups.");
    }
    if (enrollment.classGroupId === classGroupId) {
      throw new AppError(400, "INVALID_CLASS_GROUP", "The student is already in this group.");
    }

    await lockGroupWithRoom(tx, classGroupId, enrollment.courseId);
    await tx.enrollment.update({ where: { id }, data: { classGroupId } });
  });

  return { enrollment: await loadForAdmin(id) };
}

// The student finished the course. They may now enroll in the same course again
// (a new batch), and a certificate can be issued (step 11).
export async function completeEnrollment(id: string) {
  const { count } = await prisma.enrollment.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (count === 0) await explainNoChange(id, "APPROVED");
  return { enrollment: await loadForAdmin(id) };
}

async function explainNoChange(id: string, expected: EnrollmentStatus) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id }, select: { status: true } });
  if (!enrollment) throw enrollmentNotFound();
  throw new AppError(
    409,
    expected === "PENDING" ? "NOT_PENDING" : "NOT_APPROVED",
    `This enrollment is ${enrollment.status.toLowerCase()}, so it can't be changed this way.`,
  );
}
