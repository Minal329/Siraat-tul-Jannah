// /api/v1/courses        — public catalog (published courses only, no login needed)
// /api/v1/admin/courses  — admins create, edit, publish and unpublish courses
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
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
