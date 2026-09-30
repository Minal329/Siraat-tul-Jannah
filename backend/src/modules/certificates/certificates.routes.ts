// GET  /api/v1/certificates/verify/:number — public: is this certificate genuine?
// GET  /api/v1/certificates/:number/pdf    — download the PDF (its student, or an admin)
// POST /api/v1/admin/certificates          — admins: issue { enrollmentId } (course must be completed)
import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/requireAuth.ts";
import { AppError } from "../../utils/AppError.ts";
import { issueCertificateSchema } from "./certificates.schemas.ts";
import * as certificatesService from "./certificates.service.ts";

export function createCertificatesRouter() {
  const router = Router();

  // Slows down anyone trying to guess certificate numbers.
  const verifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    handler: (_req, _res, next) => next(new AppError(429, "TOO_MANY_REQUESTS", "Too many checks. Please wait a minute.")),
  });

  router.get("/verify/:number", verifyLimiter, async (req, res) => {
    res.json({ data: await certificatesService.verifyCertificate(String(req.params.number)) });
  });

  router.get("/:number/pdf", requireAuth, async (req, res) => {
    const { pdf, fileName } = await certificatesService.certificatePdf(req.auth!, String(req.params.number));
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    });
    res.send(pdf);
  });

  return router;
}

export const adminCertificatesRouter = Router();
adminCertificatesRouter.use(requireAuth, requireRole("ADMIN"));

adminCertificatesRouter.post("/", async (req, res) => {
  const { enrollmentId } = issueCertificateSchema.parse(req.body);
  res.status(201).json({ data: await certificatesService.issueCertificate(req.auth!.userId, enrollmentId) });
});
