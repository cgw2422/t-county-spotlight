/**
 * Community Pulse ordering tests (pure, no database).
 *
 *   npx tsx scripts/test-pulse-order.ts
 *
 * Results must be ordered only by the sort mode, mentions and manual order —
 * never by membership, sponsorship or any other business-account status.
 */
import assert from "node:assert/strict";
import { orderResults } from "../src/lib/pulse-order";

type Row = { name: string; mentions: number | null; sortOrder: number; plan?: string; isSponsored?: boolean; isSpotlighted?: boolean };

const rows: Row[] = [
  { name: "Premium member", mentions: 4, sortOrder: 0, plan: "PREMIUM", isSponsored: true, isSpotlighted: true },
  { name: "Free listing A", mentions: 9, sortOrder: 1, plan: "FREE" },
  { name: "No account", mentions: 4, sortOrder: 2 },
  { name: "Free listing B", mentions: null, sortOrder: 3, plan: "FREE" },
];

// Mentions: highest first, ties keep manual order, editorial (null) last.
assert.deepEqual(orderResults(rows, "MENTIONS_DESC").map((r) => r.name), ["Free listing A", "Premium member", "No account", "Free listing B"]);
// Manual: strictly sortOrder.
assert.deepEqual(orderResults(rows, "MANUAL").map((r) => r.name), ["Premium member", "Free listing A", "No account", "Free listing B"]);

// Flipping every membership/sponsor flag must not change the order.
const flipped = rows.map((r) => ({ ...r, plan: r.plan === "PREMIUM" ? "FREE" : "PREMIUM", isSponsored: !r.isSponsored, isSpotlighted: !r.isSpotlighted }));
for (const mode of ["MENTIONS_DESC", "MANUAL"]) {
  assert.deepEqual(orderResults(flipped, mode).map((r) => r.name), orderResults(rows, mode).map((r) => r.name), `membership changed order (${mode})`);
}
// Input order must not matter either (only sortOrder breaks ties).
assert.deepEqual(orderResults([...rows].reverse(), "MENTIONS_DESC").map((r) => r.name), orderResults(rows, "MENTIONS_DESC").map((r) => r.name));
// Does not mutate the input.
const copy = rows.map((r) => r.name);
orderResults(rows, "MENTIONS_DESC");
assert.deepEqual(rows.map((r) => r.name), copy);

console.log("pulse ordering: all tests passed");
