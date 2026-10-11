// Certificate designs: what a certificate looks like.
//
// Certificates are A4 landscape images, 1600 × 1131 px. An admin can give them
// a design in two ways, both uploaded from the app:
//   - a per-course TEMPLATE: a background image; the app writes the student's
//     name, the course, the date and the certificate number on top of it.
//   - a per-student FINISHED image: a complete certificate made elsewhere
//     (name and date already on it); the app shows it as is.
//
// What a student sees, highest priority first (certificateDesign below):
//   1. the finished image uploaded for that certificate
//   2. the template the course had WHEN THE CERTIFICATE WAS ISSUED
//   3. the app's built-in design
//
// Replacing or removing a course's template never changes a certificate that was
// already issued: issuing copies the template's key onto the certificate, every
// upload is saved as a new file, and template files are never deleted or overwritten.
import { imageSize } from "image-size";
import { prisma } from "../../lib/prisma.ts";
import { locateFile, saveFile } from "../../lib/storage.ts";
import { requireImage } from "../../middleware/upload.ts";
import { AppError } from "../../utils/AppError.ts";

export const CERTIFICATE_WIDTH = 1600;
export const CERTIFICATE_HEIGHT = 1131;
const RATIO = CERTIFICATE_WIDTH / CERTIFICATE_HEIGHT; // ≈ 1.414, the shape of A4
// 1% leeway accepts the usual A4 exports (3508 × 2480, 1754 × 1240, 842 × 595).
const RATIO_TOLERANCE = 0.01;
// Smaller than this looks blurry once saved at 1600 px wide.
const MIN_WIDTH = 800;

const SIZE_HINT = `Use a landscape image of ${CERTIFICATE_WIDTH} × ${CERTIFICATE_HEIGHT} px (A4 landscape), or larger in the same shape.`;

export type CertificateDesignKind = "FINISHED" | "TEMPLATE" | "DEFAULT";
type DesignKeys = { certificateNumber: string; finishedImageKey: string | null; templateKey: string | null };

/** Checks an uploaded certificate image: real JPG/PNG/WebP bytes, A4 landscape shape. */
export function requireCertificateImage(file: Express.Multer.File | undefined) {
  const image = requireImage(file, {
    missing: "Please choose the certificate image.",
    invalid: "The certificate must be a JPG, PNG or WebP image.",
  });

  let width: number;
  let height: number;
  try {
    const size = imageSize(image.data);
    // Phone photos can be stored sideways with an "orientation" note (EXIF 5–8 = turned 90°).
    const turned = size.orientation !== undefined && size.orientation >= 5;
    width = turned ? size.height : size.width;
    height = turned ? size.width : size.height;
  } catch {
    throw new AppError(400, "INVALID_FILE", "This image couldn't be read. Please export it again as PNG or JPG.");
  }

  if (width < height) {
    throw new AppError(400, "WRONG_SIZE", `This image is portrait (${width} × ${height} px). ${SIZE_HINT}`);
  }
  if (Math.abs(width / height - RATIO) / RATIO > RATIO_TOLERANCE) {
    throw new AppError(400, "WRONG_SIZE", `This image is ${width} × ${height} px, which isn't the A4 landscape shape. ${SIZE_HINT}`);
  }
  if (width < MIN_WIDTH) {
    throw new AppError(400, "WRONG_SIZE", `This image is only ${width} × ${height} px and would look blurry. ${SIZE_HINT}`);
  }
  return image;
}

// A short piece of the file's random name, added to image URLs so the phone
// doesn't keep showing an old picture after a replacement.
const version = (key: string) => key.slice(key.indexOf("/") + 1, key.indexOf("/") + 9);

export const templateUrl = (courseId: string, key: string | null) =>
  key ? `/api/v1/admin/courses/${courseId}/certificate-template?v=${version(key)}` : null;

/** Which design a certificate uses (see the order at the top of this file). */
export function certificateDesign(certificate: DesignKeys): { design: CertificateDesignKind; imageUrl: string | null } {
  const key = certificate.finishedImageKey ?? certificate.templateKey;
  return {
    design: certificate.finishedImageKey ? "FINISHED" : certificate.templateKey ? "TEMPLATE" : "DEFAULT",
    imageUrl: key ? `/api/v1/certificates/${certificate.certificateNumber}/image?v=${version(key)}` : null,
  };
}

/** The certificate fields students and admins get in their enrollment lists. */
export function toCertificateSummary(certificate: DesignKeys & { issuedAt: Date }) {
  return { certificateNumber: certificate.certificateNumber, issuedAt: certificate.issuedAt, ...certificateDesign(certificate) };
}

export const certificateSummarySelect = {
  select: { certificateNumber: true, issuedAt: true, finishedImageKey: true, templateKey: true },
} as const;

// ---- Course templates (admins) ----

const courseNotFound = () => new AppError(404, "NOT_FOUND", "Course not found.");

async function requireCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, certificateTemplateKey: true } });
  if (!course) throw courseNotFound();
  return course;
}

export async function setCourseTemplate(courseId: string, image: ReturnType<typeof requireCertificateImage>) {
  await requireCourse(courseId);
  const key = await saveFile("certificate-templates", image.data, image.type);
  await prisma.course.update({ where: { id: courseId }, data: { certificateTemplateKey: key } });
  return { certificateTemplateUrl: templateUrl(courseId, key) };
}

// The file stays on disk: certificates issued with this template still use it.
export async function removeCourseTemplate(courseId: string) {
  await requireCourse(courseId);
  await prisma.course.update({ where: { id: courseId }, data: { certificateTemplateKey: null } });
  return { certificateTemplateUrl: null };
}

export async function findCourseTemplateFile(courseId: string) {
  const course = await requireCourse(courseId);
  const file = course.certificateTemplateKey ? locateFile(course.certificateTemplateKey) : null;
  if (!file) throw new AppError(404, "NOT_FOUND", "This course has no certificate template.");
  return file;
}

// ---- Issued certificates ----

// STJ-2026-00042-K7PX. Anything else is answered with 404 before touching the database.
const NUMBER_PATTERN = /^STJ-\d{4}-\d{5,}-[A-Z0-9]{4}$/;
const certificateNotFound = () => new AppError(404, "NOT_FOUND", "Certificate not found.");

async function requireCertificate(certificateNumber: string) {
  if (!NUMBER_PATTERN.test(certificateNumber)) throw certificateNotFound();
  const certificate = await prisma.certificate.findUnique({
    where: { certificateNumber },
    include: { enrollment: { select: { student: { select: { userId: true } } } } },
  });
  if (!certificate) throw certificateNotFound();
  return certificate;
}

export async function setFinishedImage(certificateNumber: string, image: ReturnType<typeof requireCertificateImage>) {
  await requireCertificate(certificateNumber);
  const finishedImageKey = await saveFile("certificates", image.data, image.type);
  const certificate = await prisma.certificate.update({ where: { certificateNumber }, data: { finishedImageKey } });
  return { certificate: toCertificateSummary(certificate) };
}

// Back to the template the certificate was issued with (or the built-in design).
export async function removeFinishedImage(certificateNumber: string) {
  await requireCertificate(certificateNumber);
  const certificate = await prisma.certificate.update({ where: { certificateNumber }, data: { finishedImageKey: null } });
  return { certificate: toCertificateSummary(certificate) };
}

// The certificate's image (finished image, else its template). Only the student it
// belongs to and admins may see it; everyone else gets 404, as if it didn't exist.
export async function findCertificateImageFile(auth: { userId: string; role: string }, certificateNumber: string) {
  const certificate = await requireCertificate(certificateNumber);
  const isOwner = certificate.enrollment.student.userId === auth.userId;
  if (!isOwner && auth.role !== "ADMIN") throw certificateNotFound();

  const key = certificate.finishedImageKey ?? certificate.templateKey;
  const file = key ? locateFile(key) : null;
  if (!file) throw new AppError(404, "NOT_FOUND", "This certificate uses the app's built-in design.");
  return file;
}
