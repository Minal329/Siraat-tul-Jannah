// GET  /api/v1/payments/:id/proof           — the screenshot (the student who paid, or an admin)
// GET  /api/v1/admin/payments?status=PENDING — admins: the review queue
// POST /api/v1/admin/payments/:id/verify     — admins: { note? }
// POST /api/v1/admin/payments/:id/reject     — admins: { note } (required — tells the student why)
//
// Students submit payments through their enrollment: see enrollments.routes.ts.
import { Router } from "express";
import { z } from "zod";
import { PaymentStatus } from "../../../generated/prisma/enums.ts";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { parseId } from "../../utils/parseId.ts";
import { rejectSchema, verifySchema } from "./payments.schemas.ts";
import * as paymentsService from "./payments.service.ts";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get("/:id/proof", async (req, res) => {
  const id = parseId(req.params.id, "Payment");
  const file = await paymentsService.findProofFile(req.auth!, id);
  // Private financial data: don't let browsers or proxies keep a copy.
  res.set("Cache-Control", "private, no-store");
  res.type(file.contentType).sendFile(file.fullPath);
});

export const adminPaymentsRouter = Router();
adminPaymentsRouter.use(requireAuth, requireRole("ADMIN"));

const listQuery = z.object({ status: z.enum(PaymentStatus).optional() });

adminPaymentsRouter.get("/", async (req, res) => {
  const { status } = listQuery.parse(req.query);
  res.json({ data: await paymentsService.listPaymentsForReview(status) });
});

adminPaymentsRouter.post("/:id/verify", async (req, res) => {
  const id = parseId(req.params.id, "Payment");
  const { note } = verifySchema.parse(req.body ?? {});
  res.json({ data: await paymentsService.reviewPayment(req.auth!.userId, id, "VERIFIED", note) });
});

adminPaymentsRouter.post("/:id/reject", async (req, res) => {
  const id = parseId(req.params.id, "Payment");
  const { note } = rejectSchema.parse(req.body ?? {});
  res.json({ data: await paymentsService.reviewPayment(req.auth!.userId, id, "REJECTED", note) });
});
