// /api/v1/teacher — the teacher's area (admins can use it too, for any group):
//   GET   /class-groups                  my active groups
//   GET   /class-groups/:id              one group with its roster and Zoom/WhatsApp details
//   GET   /class-groups/:id/sessions     its classes, newest first, with attendance counts
//   POST  /class-groups/:id/sessions     schedule a class { scheduledAt, durationMinutes?, topic? }
//   PATCH /sessions/:id                  reschedule, rename, or cancel ({ status: "CANCELLED" })
//   POST  /sessions/:id/start            go live { platform: ZOOM | WHATSAPP, note? }
//   PATCH /sessions/:id/live             while live: switch platform / change the note for students
//   POST  /sessions/:id/end              class finished
//   GET   /sessions/:id/attendance       roster with each student's mark
//   PUT   /sessions/:id/attendance       mark or correct: { records: [{ studentId, status, note? }] }
//
// Students' views (schedule, own attendance) live under /enrollments — see enrollments.routes.ts.
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { attendanceSchema, createSessionSchema, startSessionSchema, updateLiveSchema, updateSessionSchema } from "./sessions.schemas.ts";
import * as sessionsService from "./sessions.service.ts";

export const teacherSessionsRouter = Router();
teacherSessionsRouter.use(requireAuth, requireRole("TEACHER", "ADMIN"));

teacherSessionsRouter.get("/class-groups", async (req, res) => {
  res.json({ data: await sessionsService.listMyGroups(req.auth!) });
});

teacherSessionsRouter.get("/class-groups/:id", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  res.json({ data: await sessionsService.getGroupForTeacher(req.auth!, id) });
});

teacherSessionsRouter.get("/class-groups/:id/sessions", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  res.json({ data: await sessionsService.listSessions(req.auth!, id) });
});

teacherSessionsRouter.post("/class-groups/:id/sessions", async (req, res) => {
  const id = parseId(req.params.id, "Class group");
  const input = createSessionSchema.parse(req.body);
  res.status(201).json({ data: await sessionsService.scheduleSession(req.auth!, id, input) });
});

teacherSessionsRouter.patch("/sessions/:id", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  const changes = updateSessionSchema.parse(req.body);
  res.json({ data: await sessionsService.updateSession(req.auth!, id, changes) });
});

teacherSessionsRouter.post("/sessions/:id/start", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  const input = startSessionSchema.parse(req.body ?? {});
  res.json({ data: await sessionsService.startSession(req.auth!, id, input) });
});

teacherSessionsRouter.patch("/sessions/:id/live", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  const changes = updateLiveSchema.parse(req.body);
  res.json({ data: await sessionsService.updateLive(req.auth!, id, changes) });
});

teacherSessionsRouter.post("/sessions/:id/end", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  res.json({ data: await sessionsService.endSession(req.auth!, id) });
});

teacherSessionsRouter.get("/sessions/:id/attendance", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  res.json({ data: await sessionsService.getAttendance(req.auth!, id) });
});

teacherSessionsRouter.put("/sessions/:id/attendance", async (req, res) => {
  const id = parseId(req.params.id, "Class");
  const input = attendanceSchema.parse(req.body);
  res.json({ data: await sessionsService.markAttendance(req.auth!, id, input) });
});
