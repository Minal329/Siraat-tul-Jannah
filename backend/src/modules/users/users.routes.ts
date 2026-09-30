// GET   /api/v1/admin/teachers         — list teachers with their active group count
// POST  /api/v1/admin/teachers         — create a teacher; returns a temporary password ONCE
// PATCH /api/v1/admin/users/:id/status — { "isActive": false } disables any account
//                                        (logs them out everywhere); true re-enables it
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createTeacherSchema, setStatusSchema } from "./users.schemas.ts";
import * as usersService from "./users.service.ts";

export const adminTeachersRouter = Router();
adminTeachersRouter.use(requireAuth, requireRole("ADMIN"));

adminTeachersRouter.get("/", async (_req, res) => {
  res.json({ data: await usersService.listTeachers() });
});

adminTeachersRouter.post("/", async (req, res) => {
  const input = createTeacherSchema.parse(req.body);
  // Never cache a response that contains a password.
  res.set("Cache-Control", "no-store");
  res.status(201).json({ data: await usersService.createTeacher(input) });
});

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireRole("ADMIN"));

adminUsersRouter.patch("/:id/status", async (req, res) => {
  const id = parseId(req.params.id, "User");
  const { isActive } = setStatusSchema.parse(req.body);
  res.json({ data: await usersService.setUserActive(req.auth!.userId, id, isActive) });
});
