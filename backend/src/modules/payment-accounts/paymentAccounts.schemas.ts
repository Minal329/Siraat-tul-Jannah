import { z } from "zod";
import { PaymentMethod } from "../../../generated/prisma/enums.ts";

const accountFields = {
  method: z.enum(PaymentMethod),
  accountTitle: z.string().trim().min(2, "Enter the name on the account.").max(100),
  accountNumber: z.string().trim().min(4, "Enter the account or phone number.").max(50),
  instructions: z.string().trim().max(1000).nullable(),
  isActive: z.boolean(),
};

export const createAccountSchema = z.object({
  ...accountFields,
  instructions: accountFields.instructions.optional(),
  isActive: accountFields.isActive.optional(),
});

// No defaults: an edit that leaves a field out must leave it unchanged.
export const updateAccountSchema = z
  .object(accountFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Send at least one field to change.");

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
