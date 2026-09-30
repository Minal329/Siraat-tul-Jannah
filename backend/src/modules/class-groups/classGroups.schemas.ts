import { z } from "zod";

// Dates travel as "2027-01-15" and are stored as calendar dates (no time of day).
const date = z.iso.date("Use the format YYYY-MM-DD.").transform((value) => new Date(`${value}T00:00:00Z`));

const groupFields = {
  teacherId: z.uuid().nullable(),
  name: z.string().trim().min(2, "Give the group a name, e.g. \"Tajweed — Batch 3 — Evening\".").max(120),
  batchLabel: z.string().trim().max(60).nullable(),
  scheduleText: z.string().trim().max(200).nullable(),
  startDate: date.nullable(),
  endDate: date.nullable(),
  maxStudents: z.number().int().min(1).max(500).nullable(),
  zoomMeetingId: z.string().trim().max(30).nullable(),
  zoomPasscode: z.string().trim().max(30).nullable(),
  whatsappGroupLink: z
    .url()
    .refine((url) => url.startsWith("https://chat.whatsapp.com/"), "Paste a WhatsApp group invite link (https://chat.whatsapp.com/…).")
    .nullable(),
  isActive: z.boolean(),
};

const datesInOrder = (group: { startDate?: Date | null; endDate?: Date | null }) =>
  !group.startDate || !group.endDate || group.startDate <= group.endDate;

// Everything optional except the course and the name.
export const createClassGroupSchema = z
  .object(groupFields)
  .partial()
  .extend({ courseId: z.uuid("Choose a course."), name: groupFields.name })
  .refine(datesInOrder, { path: ["endDate"], message: "The end date must be on or after the start date." });

// A group can't move to another course — its students' enrollments belong to this one.
export const updateClassGroupSchema = z
  .object(groupFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export const listClassGroupsQuery = z.object({ courseId: z.uuid().optional() });

export type CreateClassGroupInput = z.infer<typeof createClassGroupSchema>;
export type UpdateClassGroupInput = z.infer<typeof updateClassGroupSchema>;
