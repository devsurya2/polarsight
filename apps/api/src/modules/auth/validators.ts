import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
    password: z.string().min(1, "Password is required").max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(12, "Must be at least 12 characters").max(200),
  })
  .strict();

/** Six digits from an authenticator, or a recovery code. */
const mfaCode = z.string().trim().min(6).max(20);

export const mfaVerifySchema = z
  .object({
    challenge: z.string().min(20).max(2_000),
    code: mfaCode,
  })
  .strict();

export const mfaConfirmSchema = z.object({ code: mfaCode }).strict();

export const mfaDisableSchema = z
  .object({ password: z.string().min(1).max(200), code: mfaCode })
  .strict();

export const reauthSchema = z
  .object({ password: z.string().min(1).max(200), code: mfaCode.optional() })
  .strict();
