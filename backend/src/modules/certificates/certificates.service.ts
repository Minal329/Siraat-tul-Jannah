// Certificates of completion.
//
// An admin issues one for a COMPLETED enrollment. Numbers look like
// STJ-2026-00042-K7PX: a running number people can read out, plus four random
// characters so numbers can't simply be guessed. The certificate itself is drawn
// as an image inside the mobile app (mobile/src/components/CertificateCard.tsx).
import { randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma.ts";
import { AppError } from "../../utils/AppError.ts";
import { getAdminId } from "../users/users.service.ts";

// No 0/O or 1/I/L, so a code read over the phone can't be misheard.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

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
    },
  };
}
