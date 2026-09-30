// Certificates of completion.
//
// An admin issues one for a COMPLETED enrollment. Numbers look like
// STJ-2026-00042-K7PX: a running number people can read out, plus four random
// characters so nobody can list every graduate by trying 1, 2, 3… on the
// public verification page.
import { randomInt } from "node:crypto";
import type { Role } from "../../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { renderCertificatePdf } from "../../lib/certificatePdf.ts";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { getAdminId } from "../users/users.service.ts";

type Auth = { userId: string; role: Role };

// No 0/O or 1/I/L, so a code read over the phone can't be misheard.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const NUMBER_PATTERN = /^STJ-\d{4}-\d{5}-[A-Z2-9]{4}$/;

const certificateNotFound = () => new AppError(404, "NOT_FOUND", "No certificate with this number.");

export const verifyUrl = (certificateNumber: string) => `${env.PUBLIC_WEB_URL}/verify/${certificateNumber}`;
export const downloadUrl = (certificateNumber: string) => `/api/v1/certificates/${certificateNumber}/pdf`;

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export async function issueCertificate(adminUserId: string, enrollmentId: string) {
  const adminId = await getAdminId(adminUserId);

  const certificate = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId }, include: { certificate: true } });
    if (!enrollment) throw new AppError(404, "NOT_FOUND", "Enrollment not found.");
    if (enrollment.status !== "COMPLETED") {
      throw new AppError(409, "NOT_COMPLETED", "Mark the course as completed before issuing a certificate.");
    }
    if (enrollment.certificate) throw new AppError(409, "ALREADY_ISSUED", "A certificate was already issued for this enrollment.");

    // Only one certificate is numbered at a time, so two admins can't get the same
    // running number. The lock is released automatically when the transaction ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('certificate-number'))`;
    const year = new Date().getUTCFullYear();
    const issuedThisYear = await tx.certificate.count({ where: { certificateNumber: { startsWith: `STJ-${year}-` } } });
    const certificateNumber = `STJ-${year}-${String(issuedThisYear + 1).padStart(5, "0")}-${randomCode()}`;

    return tx.certificate.create({ data: { enrollmentId, certificateNumber, issuedById: adminId } });
  });

  return {
    certificate: {
      certificateNumber: certificate.certificateNumber,
      issuedAt: certificate.issuedAt,
      verifyUrl: verifyUrl(certificate.certificateNumber),
      downloadUrl: downloadUrl(certificate.certificateNumber),
    },
  };
}

async function findByNumber(rawNumber: string) {
  const certificateNumber = rawNumber.trim().toUpperCase();
  if (!NUMBER_PATTERN.test(certificateNumber)) throw certificateNotFound();
  const certificate = await prisma.certificate.findUnique({
    where: { certificateNumber },
    include: {
      enrollment: {
        select: {
          completedAt: true,
          course: { select: { title: true } },
          student: { select: { fullName: true, userId: true } },
        },
      },
    },
  });
  if (!certificate) throw certificateNotFound();
  return certificate;
}

// Public: anyone holding the number (e.g. another school) can check it's genuine.
// Shows only what's printed on the certificate itself.
export async function verifyCertificate(rawNumber: string) {
  const certificate = await findByNumber(rawNumber);
  return {
    certificate: {
      certificateNumber: certificate.certificateNumber,
      studentName: certificate.enrollment.student.fullName,
      courseTitle: certificate.enrollment.course.title,
      issuedAt: certificate.issuedAt,
    },
  };
}

// The PDF: for the student it belongs to, or an admin.
export async function certificatePdf(auth: Auth, rawNumber: string) {
  const certificate = await findByNumber(rawNumber);
  if (auth.role !== "ADMIN" && certificate.enrollment.student.userId !== auth.userId) throw certificateNotFound();

  const pdf = await renderCertificatePdf({
    studentName: certificate.enrollment.student.fullName,
    courseTitle: certificate.enrollment.course.title,
    certificateNumber: certificate.certificateNumber,
    issuedAt: certificate.issuedAt,
    verifyUrl: verifyUrl(certificate.certificateNumber),
  });
  return { pdf, fileName: `Siraat-tul-Jannah-certificate-${certificate.certificateNumber}.pdf` };
}
