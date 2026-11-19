import { z } from "zod";
import { passwordProblem } from "./password-rules";

/**
 * Field rules for creating a normal account (/register/ and "Create a Free Account" on /list-your-business/).
 * Pure — no database or request access (see src/lib/accounts.ts for createAccount).
 */
const nameField = (label: string) => z.string().trim().min(1, `Please enter your ${label}.`).max(60, `Please keep your ${label} under 60 characters.`).refine((v) => !/[<>{}\u0000-\u001f]/.test(v), `Please check your ${label}.`);

export const accountFieldsSchema = z.object({
  firstName: nameField("first name"),
  lastName: nameField("last name"),
  email: z.string().trim().toLowerCase().max(254, "Please enter a valid email address.").pipe(z.email("Please enter a valid email address.")),
  password: z.string().max(200),
});
export type AccountFields = z.infer<typeof accountFieldsSchema>;

/** Password policy + confirmation check (null = fine). */
export function newPasswordProblem(password: string, confirm: string): { error: string; fieldErrors: Record<string, string> } | null {
  const pwErr = passwordProblem(password);
  if (pwErr) return { error: pwErr, fieldErrors: { password: pwErr } };
  if (password !== confirm) return { error: "The two passwords don't match.", fieldErrors: { confirm: "Passwords don't match." } };
  return null;
}

