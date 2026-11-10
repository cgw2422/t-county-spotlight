/**
 * Community Pulse rank colors — one rule everywhere:
 * first place is Hillside Green (#387D14, white number, 5.1:1 contrast);
 * every other position is Sunrise Orange (#FF8508, navy number, 7.6:1 contrast).
 */
export const rankBadgeClass = (i: number) => (i === 0 ? "bg-hillside-600 text-white" : "bg-sunset-500 text-navy-950");
export const rankBarClass = (i: number) => (i === 0 ? "bg-hillside-600" : "bg-sunset-500");
