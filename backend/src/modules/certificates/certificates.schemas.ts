import { z } from "zod";

export const issueCertificateSchema = z.object({ enrollmentId: z.uuid("Choose an enrollment.") });
