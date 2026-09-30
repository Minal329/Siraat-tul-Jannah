// /api/v1/enrollments — students apply for courses, track them, and pay fees.
// Approving, rejecting and assigning class groups is the admin workflow (step 8).
import { Router } from "express";
import { imageUpload, requireImage } from "../../middleware/imageUpload.ts";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { createEnrollmentSchema } from "./enrollments.schemas.ts";
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
