import { z } from "zod";

// Videos live on a video service (YouTube unlisted, Vimeo, Bunny Stream…); we store the link.
const videoUrl = z.url().refine((url) => url.startsWith("https://"), "Paste the video's https:// link.");

const lectureFields = {
  title: z.string().trim().min(2, "Give the lecture a title.").max(150),
  description: z.string().trim().max(2000).nullable(),
  videoUrl,
  durationSeconds: z.number().int().min(1).max(6 * 60 * 60).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  published: z.boolean(),
};

export const createLectureSchema = z
  .object(lectureFields)
  .partial()
  .extend({
    courseId: z.uuid("Choose a course."),
    // Leave out to share with every group of the course; set to limit it to one group.
    classGroupId: z.uuid().optional(),
    title: lectureFields.title,
    videoUrl: lectureFields.videoUrl,
  });

// The course and group can't change after creation; everything else can.
export const updateLectureSchema = z
  .object(lectureFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export const teacherLecturesQuery = z.object({ courseId: z.uuid().optional() });

export type CreateLectureInput = z.infer<typeof createLectureSchema>;
export type UpdateLectureInput = z.infer<typeof updateLectureSchema>;
