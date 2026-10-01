// /api/v1/admin/class-groups — admins manage batches:
//   GET    /?courseId=…   list (with student counts)
//   GET    /:id           one group and its roster
//   POST   /              create
//   PATCH  /:id           edit (teacher, schedule, capacity, Zoom/WhatsApp, isActive)
//   GET    /zoom-status   is the Zoom API connected? (so the dashboard knows whether to offer it)
//   POST   /:id/zoom-meeting   create a Zoom meeting through the Zoom API and save it on the group
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

adminClassGroupsRouter.get("/zoom-status", (_req, res) => {
  res.json({ data: classGroupsService.zoomStatus() });
});

adminClassGroupsRouter.post("/:id/zoom-meeting", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  res.json({ data: await classGroupsService.createZoomMeeting(id) });
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
