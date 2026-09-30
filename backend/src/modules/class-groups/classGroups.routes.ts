// /api/v1/admin/class-groups — admins manage batches:
//   GET    /?courseId=…   list (with student counts)
//   GET    /:id           one group and its roster
//   POST   /              create
//   PATCH  /:id           edit (teacher, schedule, capacity, Zoom/WhatsApp, isActive)
// Groups are deactivated ({ "isActive": false }), never deleted.
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createClassGroupSchema, listClassGroupsQuery, updateClassGroupSchema } from "./classGroups.schemas.ts";
import * as classGroupsService from "./classGroups.service.ts";

export const adminClassGroupsRouter = Router();
adminClassGroupsRouter.use(requireAuth, requireRole("ADMIN"));

adminClassGroupsRouter.get("/", async (req, res) => {
  const { courseId } = listClassGroupsQuery.parse(req.query);
  res.json({ data: await classGroupsService.listClassGroups(courseId) });
});

adminClassGroupsRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  res.json({ data: await classGroupsService.getClassGroup(id) });
});

adminClassGroupsRouter.post("/", async (req, res) => {
  const input = createClassGroupSchema.parse(req.body);
  res.status(201).json({ data: await classGroupsService.createClassGroup(input) });
});

adminClassGroupsRouter.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  const changes = updateClassGroupSchema.parse(req.body);
  res.json({ data: await classGroupsService.updateClassGroup(id, changes) });
});
