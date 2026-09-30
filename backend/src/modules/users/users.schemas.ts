import { z } from "zod";
import { registerSchema } from "../auth/auth.schemas.ts";

// Same rules as signup, but the password is generated for the teacher.
export const createTeacherSchema = registerSchema.omit({ password: true });

export const setStatusSchema = z.object({ isActive: z.boolean() });

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
