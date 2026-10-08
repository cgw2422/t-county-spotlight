export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null;

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>;
  return null;
}
