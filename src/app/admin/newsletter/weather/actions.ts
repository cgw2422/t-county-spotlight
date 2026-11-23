"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getCurrentForecast } from "@/lib/weather/forecast";
import type { ActionState } from "@/components/ui/form-message";

/** Fetch the forecast from the National Weather Service now (instead of waiting up to 30 minutes). */
export async function refreshWeatherAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  await requireAdmin();
  const f = await getCurrentForecast({ force: true });
  revalidatePath("/admin/newsletter/weather/");
  if (!f) return { error: "The National Weather Service didn't respond and there's no saved forecast yet. Try again in a few minutes." };
  if (f.stale) return { error: `The National Weather Service didn't respond (${f.error}). The feed keeps serving the last forecast.` };
  return { ok: true, message: "Forecast refreshed." };
}
