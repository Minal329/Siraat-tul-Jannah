import { z } from "zod";
import { AttendanceStatus, ClassSessionStatus } from "../../../generated/prisma/enums.ts";

// Times travel with their timezone, e.g. "2027-01-15T20:00:00+05:00" (8 pm PKT).
const dateTime = z.iso.datetime({ offset: true, message: "Use a date and time like 2027-01-15T20:00:00+05:00." })
  .transform((value) => new Date(value));

export const createSessionSchema = z.object({
  scheduledAt: dateTime,
  durationMinutes: z.number().int().min(15).max(240).optional(),
  topic: z.string().trim().max(200).optional(),
});

export const updateSessionSchema = z
  .object({
    scheduledAt: dateTime,
    durationMinutes: z.number().int().min(15).max(240),
    topic: z.string().trim().max(200).nullable(),
    status: z.enum(ClassSessionStatus),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export const attendanceSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.uuid(),
        status: z.enum(AttendanceStatus),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, "Mark at least one student.")
    .max(500)
    .refine((records) => new Set(records.map((r) => r.studentId)).size === records.length, "Each student can only be marked once."),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
