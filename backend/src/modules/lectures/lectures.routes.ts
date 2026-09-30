// GET   /api/v1/lectures               — students: published lectures for my courses
// GET   /api/v1/teacher/lectures       — teachers: lectures for courses I teach (admins: all)
// POST  /api/v1/teacher/lectures       — add { courseId, classGroupId?, title, videoUrl, description?,
//                                          durationSeconds?, sortOrder?, published? }
// PATCH /api/v1/teacher/lectures/:id   — edit, or { "published": true/false }
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createLectureSchema, teacherLecturesQuery, updateLectureSchema } from "./lectures.schemas.ts";
import * as lecturesService from "./lectures.service.ts";

export const lecturesRouter = Router();
lecturesRouter.use(requireAuth, requireRole("STUDENT"));

lecturesRouter.get("/", async (req, res) => {
  res.json({ data: await lecturesService.listForStudent(req.auth!.userId) });
});

export const teacherLecturesRouter = Router();
teacherLecturesRouter.use(requireAuth, requireRole("TEACHER", "ADMIN"));

teacherLecturesRouter.get("/", async (req, res) => {
  const { courseId } = teacherLecturesQuery.parse(req.query);
  res.json({ data: await lecturesService.listForTeacher(req.auth!, courseId) });
});

teacherLecturesRouter.post("/", async (req, res) => {
  const input = createLectureSchema.parse(req.body);
  res.status(201).json({ data: await lecturesService.createLecture(req.auth!, input) });
});

teacherLecturesRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Lecture");
  const changes = updateLectureSchema.parse(req.body);
  res.json({ data: await lecturesService.updateLecture(req.auth!, id, changes) });
});
