/** "jane.doe@example.com" → "j•••e@example.com" (shown on token pages so people know which address a link is for). */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "your address";
  const shown = user.length <= 2 ? `${user[0] ?? ""}•••` : `${user[0]}•••${user[user.length - 1]}`;
  return `${shown}@${domain}`;
}
