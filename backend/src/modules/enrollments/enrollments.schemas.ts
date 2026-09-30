import { z } from "zod";

export const createEnrollmentSchema = z.object({
  courseId: z.uuid("Choose a course."),
});
