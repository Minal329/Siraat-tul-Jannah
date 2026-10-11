// /api/v1/courses        — public catalog (published courses only, no login needed)
// /api/v1/admin/courses  — admins create, edit, publish and unpublish courses
// /api/v1/admin/courses/:id/certificate-template — admins: PUT (field "image") / GET / DELETE
//   the background image certificates of this course are drawn on
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { imageUpload } from "../../middleware/upload.ts";
import { parseId } from "../../utils/parseId.ts";
import * as designs from "../certificates/certificateDesigns.service.ts";
import { createCourseSchema, updateCourseSchema } from "./courses.schemas.ts";
import * as coursesService from "./courses.service.ts";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res) => {
  res.json({ data: await coursesService.listPublishedCourses() });
});

coursesRouter.get("/:slug", async (req, res) => {
  res.json({ data: await coursesService.getPublishedCourse(req.params.slug) });
});

export const adminCoursesRouter = Router();
adminCoursesRouter.use(requireAuth, requireRole("ADMIN"));

adminCoursesRouter.get("/", async (_req, res) => {
  res.json({ data: await coursesService.listAllCourses() });
});

adminCoursesRouter.post("/", async (req, res) => {
  const input = createCourseSchema.parse(req.body);
  res.status(201).json({ data: await coursesService.createCourse(input) });
});

// Courses are never deleted — send { "isPublished": false } to hide one.
// Deleting would erase students' enrollment and certificate history.
adminCoursesRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Course");
  const changes = updateCourseSchema.parse(req.body);
  res.json({ data: await coursesService.updateCourse(id, changes) });
});

// Replacing or removing the template doesn't change certificates already issued:
// each keeps the template it was issued with (see certificateDesigns.service.ts).
adminCoursesRouter.put("/:id/certificate-template", imageUpload("image"), async (req, res) => {
  const id = parseId(req.params.id, "Course");
  const image = designs.requireCertificateImage(req.file);
  res.json({ data: await designs.setCourseTemplate(id, image) });
});

adminCoursesRouter.get("/:id/certificate-template", async (req, res) => {
  const file = await designs.findCourseTemplateFile(parseId(req.params.id, "Course"));
  res.set("Cache-Control", "private, no-store");
  res.type(file.contentType).sendFile(file.fullPath);
});

adminCoursesRouter.delete("/:id/certificate-template", async (req, res) => {
  res.json({ data: await designs.removeCourseTemplate(parseId(req.params.id, "Course")) });
});
