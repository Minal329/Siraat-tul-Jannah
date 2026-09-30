import { z } from "zod";
import { PaymentMethod } from "../../../generated/prisma/enums.ts";

// Form fields arrive as text in a file upload, so numbers are converted ("coerced").
export const submitPaymentSchema = z.object({
  method: z.enum(PaymentMethod, "Choose how you paid."),
  amountPkr: z.coerce.number().int("Amount must be whole rupees.").min(1, "Enter the amount you paid.").max(1_000_000),
  transactionId: z.string().trim().max(50).optional(),
});

export const verifySchema = z.object({ note: z.string().trim().max(500).optional() });
export const rejectSchema = z.object({ note: z.string().trim().min(3, "Tell the student why it was rejected.").max(500) });

export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
