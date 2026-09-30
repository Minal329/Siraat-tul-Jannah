// /api/v1/enrollments        — students apply for courses, track them, and pay fees.
// /api/v1/admin/enrollments  — admins review, approve (into a class group), reject,
//                              move between groups, and mark courses completed.
import { Router } from "express";
import { imageUpload, requireImage } from "../../middleware/imageUpload.ts";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import {
  adminListQuery,
  approveSchema,
  createEnrollmentSchema,
  moveSchema,
  rejectEnrollmentSchema,
} from "./enrollments.schemas.ts";
import * as adminService from "./enrollments.admin.service.ts";
import { submitPaymentSchema } from "../payments/payments.schemas.ts";
import * as paymentsService from "../payments/payments.service.ts";
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

// Upload proof of a fee payment: a form with fields method, amountPkr, transactionId
// and the screenshot in a file field called "proof".
enrollmentsRouter.post("/:id/payments", imageUpload("proof"), async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  const input = submitPaymentSchema.parse(req.body ?? {});
  const proof = requireImage(req.file);
  res.status(201).json({ data: await paymentsService.submitPayment(req.auth!.userId, id, input, proof) });
});

enrollmentsRouter.get("/:id/payments", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  res.json({ data: await paymentsService.listMyPayments(req.auth!.userId, id) });
});

export const adminEnrollmentsRouter = Router();
adminEnrollmentsRouter.use(requireAuth, requireRole("ADMIN"));

// e.g. GET /admin/enrollments?status=PENDING — the approval queue
adminEnrollmentsRouter.get("/", async (req, res) => {
  res.json({ data: await adminService.listEnrollments(adminListQuery.parse(req.query)) });
});

adminEnrollmentsRouter.post("/:id/approve", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  const options = approveSchema.parse(req.body);
  res.json({ data: await adminService.approveEnrollment(req.auth!.userId, id, options) });
});

adminEnrollmentsRouter.post("/:id/reject", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  const { reason } = rejectEnrollmentSchema.parse(req.body);
  res.json({ data: await adminService.rejectEnrollment(id, reason) });
});

adminEnrollmentsRouter.post("/:id/move", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  const { classGroupId } = moveSchema.parse(req.body);
  res.json({ data: await adminService.moveEnrollment(id, classGroupId) });
});

adminEnrollmentsRouter.post("/:id/complete", async (req, res) => {
  const id = parseId(req.params.id, "Enrollment");
  res.json({ data: await adminService.completeEnrollment(id) });
});
