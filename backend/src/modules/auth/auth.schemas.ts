// What a valid request body looks like for each auth endpoint. Anything not
// listed (e.g. a sneaky "role": "ADMIN") is silently dropped by zod.
import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));

// bcrypt only looks at the first 72 bytes of a password, so longer ones would be
// silently truncated. Reject them instead of pretending they're stronger.
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long (max 72 bytes).");

export const registerSchema = z.object({
  email,
  password: newPassword,
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "Enter a WhatsApp number with country code, e.g. +923001234567.")
    .optional(),
});

export const loginSchema = z.object({
  email,
  // No strength rules here: login must accept whatever was set at signup.
  password: z.string().min(1, "Enter your password."),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
