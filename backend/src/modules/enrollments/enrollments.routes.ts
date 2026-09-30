// /api/v1/enrollments — students apply for courses and track their applications.
// Approving, rejecting and assigning class groups is the admin workflow (step 8).
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createEnrollmentSchema } from "./enrollments.schemas.ts";
import * as enrollmentsService from "./enrollments.service.ts";

export const enrollmentsRouter = Router();
enrollmentsRouter.use(requireAuth, requireRole("STUDENT"));

enrollmentsRouter.post("/", async (req, res) => {
  const { courseId } = createEnrollmentSchema.parse(req.body);
  res.status(201).json({ data: await enrollmentsService.enroll(req.auth!.userId, courseId) });
});

enrollmentsRouter.get("/mine", async (req, res) => {
  res.json({ data: await enrollmentsService.listMyEnrollments(req.auth!.userId) });
});

enrollmentsRouter.post("/:id/cancel", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  res.json({ data: await enrollmentsService.cancelMyEnrollment(req.auth!.userId, id) });
});
