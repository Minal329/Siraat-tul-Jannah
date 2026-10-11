// POST   /api/v1/admin/certificates               — admins: issue { enrollmentId } (course must be completed)
// PUT    /api/v1/admin/certificates/:number/image — admins: upload a finished certificate image (field "image")
// DELETE /api/v1/admin/certificates/:number/image — admins: remove it (back to the template / built-in design)
// GET    /api/v1/certificates/:number/image       — the certificate's image (its student, or an admin)
//
// Students see their certificates in GET /enrollments/mine; the app draws and saves the image.
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { imageUpload } from "../../middleware/upload.ts";
import * as designs from "./certificateDesigns.service.ts";
import { issueCertificateSchema } from "./certificates.schemas.ts";
import * as certificatesService from "./certificates.service.ts";

export const certificatesRouter = Router();
certificatesRouter.use(requireAuth);

certificatesRouter.get("/:number/image", async (req, res) => {
  const file = await designs.findCertificateImageFile(req.auth!, String(req.params.number));
  // A student's personal document: don't let browsers or proxies keep a copy.
  res.set("Cache-Control", "private, no-store");
  res.type(file.contentType).sendFile(file.fullPath);
});

export const adminCertificatesRouter = Router();
adminCertificatesRouter.use(requireAuth, requireRole("ADMIN"));

adminCertificatesRouter.post("/", async (req, res) => {
  const { enrollmentId } = issueCertificateSchema.parse(req.body);
  res.status(201).json({ data: await certificatesService.issueCertificate(req.auth!.userId, enrollmentId) });
});

adminCertificatesRouter.put("/:number/image", imageUpload("image"), async (req, res) => {
  const image = designs.requireCertificateImage(req.file);
  res.json({ data: await designs.setFinishedImage(String(req.params.number), image) });
});

adminCertificatesRouter.delete("/:number/image", async (req, res) => {
  res.json({ data: await designs.removeFinishedImage(String(req.params.number)) });
});
