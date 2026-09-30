// Request bodies for creating and editing courses (admin only).
import { z } from "zod";

// "Tajweed ul Quran" → "tajweed-ul-quran". Used in web addresses: /courses/tajweed-ul-quran
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes only, e.g. tajweed-basics.")
  .max(80);

// No .default()s here on purpose: an edit that leaves a field out must leave it unchanged.
const courseFields = {
  title: z.string().trim().min(2, "Enter a course title.").max(120),
  slug,
  description: z.string().trim().min(10, "Describe the course in at least 10 characters.").max(5000),
  level: z.string().trim().max(50).nullable(),
  durationWeeks: z.number().int().min(1).max(520).nullable(),
  feePkr: z.number().int("Fee must be whole rupees.").min(0).max(1_000_000),
  thumbnailUrl: z.url().nullable(),
  isPublished: z.boolean(),
};

export const createCourseSchema = z
  .object({
    ...courseFields,
    slug: slug.optional(),
    level: courseFields.level.optional(),
    durationWeeks: courseFields.durationWeeks.optional(),
    thumbnailUrl: courseFields.thumbnailUrl.optional(),
    isPublished: courseFields.isPublished.optional(),
  })
  .transform((course, ctx) => {
    const finalSlug = course.slug ?? slugify(course.title);
    if (!finalSlug) {
      // e.g. a title written only in Urdu script has no Latin letters to build a slug from.
      ctx.addIssue({ code: "custom", path: ["slug"], message: "Enter a slug (web address name) for this course." });
      return z.NEVER;
    }
    return { ...course, slug: finalSlug, isPublished: course.isPublished ?? false };
  });

export const updateCourseSchema = z
  .object(courseFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
