/**
 * Password policy shared by the server (authoritative) and the client
 * checklist. Pure functions only — safe to import from client components.
 */
export const PASSWORD_MIN_LENGTH = 10;

// Small blocklist of passwords that satisfy the length/letter/number rule but
// are among the most commonly breached. Compared case-insensitively.
const COMMON = new Set([
  "password12", "password123", "password1234", "password12345", "passw0rd123", "qwerty12345", "qwerty123456", "abc1234567",
  "abcd123456", "iloveyou123", "welcome123", "welcome1234", "letmein123", "admin12345", "admin123456", "changeme123",
  "1234567890a", "a1234567890", "1q2w3e4r5t", "1qaz2wsx3edc", "zaq12wsx34", "football123", "baseball123", "monkey12345",
  "dragon12345", "sunshine123", "princess123", "trustno1234", "superman123", "starwars123", "master12345", "tcounty123",
  "tcountyconnect1", "tuscarawas1", "tuscarawas123", "newphila123", "dover12345", "ohio123456", "buckeyes123",
]);

export type PasswordCheck = { id: "length" | "letters" | "numbers"; label: string; ok: boolean };

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: pw.length >= PASSWORD_MIN_LENGTH },
    { id: "letters", label: "Includes a letter", ok: /[A-Za-z]/.test(pw) },
    { id: "numbers", label: "Includes a number", ok: /[0-9]/.test(pw) },
  ];
}

export function isCommonPassword(pw: string) {
  return COMMON.has(pw.toLowerCase());
}

/** Returns a user-facing problem with the password, or null when it's acceptable. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (pw.length > 200) return "Password must be 200 characters or fewer.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must include letters and numbers.";
  if (isCommonPassword(pw)) return "That password is too common. Please choose something harder to guess.";
  return null;
}
