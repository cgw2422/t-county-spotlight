/**
 * Community Pulse result ordering — pure (no DB), shared by every public view
 * and covered by scripts/test-pulse-order.ts.
 *
 * FAIRNESS RULE: the order depends ONLY on the admin's sort mode, the
 * community-response count (`mentions`) and the admin's manual `sortOrder`.
 * Membership plans, sponsorships, featured/spotlight flags, claims or any other
 * paid or business-account status must never be read here — not as a sort key,
 * not as a tie-breaker. Callers must not re-sort results afterwards.
 */
export function orderResults<T extends { mentions: number | null; sortOrder: number }>(rows: T[], sortMode: string): T[] {
  const byManual = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sortMode === "MANUAL") return byManual;
  // Highest mentions first; editorial rows (null) last; ties keep the manual order (stable sort).
  return byManual.sort((a, b) => (b.mentions ?? -1) - (a.mentions ?? -1));
}
