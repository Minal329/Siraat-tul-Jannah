// Fee payments: a student sends money by Easypaisa/JazzCash, uploads a screenshot
// as proof, and an admin verifies or rejects it.
//
// Verifying a payment does NOT approve the enrollment — approving and assigning a
// class group is a separate admin decision (roadmap step 8).
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { PaymentStatus } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../lib/prisma.ts";
import { locateFile, saveFile, type StoredFileType } from "../../lib/storage.ts";
import { AppError } from "../../utils/AppError.ts";
import { getAdminId, getStudentId } from "../users/users.service.ts";
import type { SubmitPaymentInput } from "./payments.schemas.ts";

const paymentNotFound = () => new AppError(404, "NOT_FOUND", "Payment not found.");

type PaymentRow = Prisma.PaymentGetPayload<object>;

// The proof itself is never linked directly; this URL checks who is asking first.
const proofUrl = (paymentId: string) => `/api/v1/payments/${paymentId}/proof`;

export function toPaymentSummary(payment: PaymentRow) {
  return {
    id: payment.id,
    method: payment.method,
    amountPkr: payment.amountPkr,
    transactionId: payment.transactionId,
    status: payment.status,
    reviewNote: payment.reviewNote,
    submittedAt: payment.createdAt,
    reviewedAt: payment.reviewedAt,
    proofUrl: proofUrl(payment.id),
  };
}

export async function submitPayment(
  userId: string,
  enrollmentId: string,
  input: SubmitPaymentInput,
  proof: { data: Buffer; type: StoredFileType },
) {
  const studentId = await getStudentId(userId);
  const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, studentId } });
  if (!enrollment) throw new AppError(404, "NOT_FOUND", "Enrollment not found.");

  // Fees are paid while applying (PENDING) or during the course (APPROVED, e.g. monthly).
  if (enrollment.status !== "PENDING" && enrollment.status !== "APPROVED") {
    throw new AppError(409, "ENROLLMENT_CLOSED", "Payments can't be added to a closed enrollment.");
  }

  // One screenshot waiting for review at a time keeps the admin queue clean.
  const waiting = await prisma.payment.findFirst({ where: { enrollmentId, status: "PENDING" }, select: { id: true } });
  if (waiting) {
    throw new AppError(409, "PAYMENT_PENDING", "Your previous payment is still being checked. Please wait for the academy.");
  }

  const proofImageUrl = await saveFile("payments", proof.data, proof.type);
  const payment = await prisma.payment.create({ data: { enrollmentId, ...input, proofImageUrl } });
  return { payment: toPaymentSummary(payment) };
}

export async function listMyPayments(userId: string, enrollmentId: string) {
  const studentId = await getStudentId(userId);
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, studentId },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!enrollment) throw new AppError(404, "NOT_FOUND", "Enrollment not found.");
  return { payments: enrollment.payments.map(toPaymentSummary) };
}

// Only the student who paid, or an admin, may see a payment screenshot.
// Everyone else gets 404, exactly as if it didn't exist.
export async function findProofFile(auth: { userId: string; role: string }, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { proofImageUrl: true, enrollment: { select: { student: { select: { userId: true } } } } },
  });
  if (!payment) throw paymentNotFound();

  const isOwner = payment.enrollment.student.userId === auth.userId;
  if (!isOwner && auth.role !== "ADMIN") throw paymentNotFound();

  const file = locateFile(payment.proofImageUrl);
  if (!file) throw new AppError(404, "NOT_FOUND", "The screenshot for this payment is missing.");
  return file;
}

export async function listPaymentsForReview(status: PaymentStatus | undefined) {
  const payments = await prisma.payment.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "asc" }, // oldest first: first come, first served
    include: {
      enrollment: {
        select: {
          id: true,
          status: true,
          course: { select: { title: true, feePkr: true } },
          student: { select: { fullName: true, whatsappNumber: true } },
        },
      },
    },
  });
  return {
    payments: payments.map((payment) => ({
      ...toPaymentSummary(payment),
      enrollment: {
        id: payment.enrollment.id,
        status: payment.enrollment.status,
        courseTitle: payment.enrollment.course.title,
        courseFeePkr: payment.enrollment.course.feePkr,
      },
      student: payment.enrollment.student,
    })),
  };
}

export async function reviewPayment(userId: string, paymentId: string, decision: "VERIFIED" | "REJECTED", note?: string) {
  const adminId = await getAdminId(userId);

  // Only a PENDING payment changes, so two admins clicking at once can't both review it.
  const { count } = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: decision, reviewedById: adminId, reviewedAt: new Date(), reviewNote: note ?? null },
  });

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw paymentNotFound();
  if (count === 0) {
    throw new AppError(409, "ALREADY_REVIEWED", `This payment was already ${payment.status.toLowerCase()}.`);
  }
  return { payment: toPaymentSummary(payment) };
}
