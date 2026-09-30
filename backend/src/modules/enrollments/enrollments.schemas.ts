import { z } from "zod";
import { EnrollmentStatus } from "../../../generated/prisma/enums.ts";

export const createEnrollmentSchema = z.object({
  courseId: z.uuid("Choose a course."),
});

// ── Admin workflow ──────────────────────────────────────────────

export const adminListQuery = z.object({
  status: z.enum(EnrollmentStatus).optional(),
  courseId: z.uuid().optional(),
});

export const approveSchema = z.object({
  classGroupId: z.uuid("Choose a class group."),
  // Approving without a verified payment (e.g. a scholarship) must be deliberate.
  approveWithoutPayment: z.boolean().optional(),
});

export const rejectEnrollmentSchema = z.object({
  reason: z.string().trim().min(3, "Tell the student why their application was rejected.").max(500),
});

export const moveSchema = z.object({ classGroupId: z.uuid("Choose a class group.") });
