// POST /api/v1/admin/certificates — admins: issue { enrollmentId } (course must be completed).
// Students see their certificates in GET /enrollments/mine; the app draws and saves the image.
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { issueCertificateSchema } from "./certificates.schemas.ts";
import * as certificatesService from "./certificates.service.ts";

export const adminCertificatesRouter = Router();
adminCertificatesRouter.use(requireAuth, requireRole("ADMIN"));

adminCertificatesRouter.post("/", async (req, res) => {
  const { enrollmentId } = issueCertificateSchema.parse(req.body);
  res.status(201).json({ data: await certificatesService.issueCertificate(req.auth!.userId, enrollmentId) });
});
