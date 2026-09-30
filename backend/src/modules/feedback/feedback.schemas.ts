import { z } from "zod";

// Sent as JSON for text feedback, or as a form (multipart) when a voice note is
// attached — so numbers may arrive as text and are converted ("coerced").
export const sendFeedbackSchema = z.object({
  enrollmentId: z.uuid("Choose which student's course this feedback is about."),
  text: z.string().trim().min(1).max(2000).optional(),
  durationSeconds: z.coerce.number().int().min(1).max(900).optional(),
});

export const teacherFeedbackQuery = z.object({ enrollmentId: z.uuid().optional() });

export type SendFeedbackInput = z.infer<typeof sendFeedbackSchema>;
