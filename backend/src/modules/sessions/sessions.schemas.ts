import { z } from "zod";
import { AttendanceStatus, LivePlatform } from "../../../generated/prisma/enums.ts";

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
    // Starting and ending a class have their own endpoints (/start, /end).
    status: z.enum(["SCHEDULED", "CANCELLED"]),
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

const liveNote = z.string().trim().max(300).nullable();

export const startSessionSchema = z.object({
  platform: z.enum(LivePlatform).default("ZOOM"),
  note: liveNote.optional(),
});

// While a class is live: switch to WhatsApp (or back to Zoom) and tell students why.
export const updateLiveSchema = z
  .object({ platform: z.enum(LivePlatform), note: liveNote })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export const joinLiveSchema = z.object({ platform: z.enum(LivePlatform) });

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type UpdateLiveInput = z.infer<typeof updateLiveSchema>;
export type JoinLiveInput = z.infer<typeof joinLiveSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
