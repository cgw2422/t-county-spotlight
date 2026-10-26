"use client";
import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";
import { testLookup, type TestLookupState } from "./actions";

export function TestLookupForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(testLookup, null as TestLookupState);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="test-place-id" className="sr-only">Place ID</label>
        <input id="test-place-id" name="placeId" required maxLength={300} placeholder="ChIJ…" spellCheck={false} autoComplete="off" className="input min-w-0 flex-1 font-mono text-sm" />
        <button type="submit" className="btn-secondary shrink-0" disabled={pending || disabled}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Test lookup
        </button>
      </form>
      {disabled && <p className="help">Set GOOGLE_PLACES_API_KEY on the server to run live lookups.</p>}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.result && (
        <dl role="status" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <dt className="font-medium">Name</dt><dd>{state.result.name ?? "—"}</dd>
          <dt className="font-medium">Place ID</dt><dd className="break-all font-mono text-xs">{state.result.id}</dd>
          <dt className="font-medium">Rating</dt><dd>{state.result.rating != null ? `${state.result.rating.toFixed(1)} (${state.result.userRatingCount ?? 0} ratings)` : "No rating"}</dd>
          <dt className="font-medium">Reviews returned</dt><dd>{state.result.reviews}</dd>
          <dt className="font-medium">Attributions</dt><dd>{state.result.attributions}</dd>
          {state.result.googleMapsUri && <><dt className="font-medium">Maps link</dt><dd className="break-all"><a href={state.result.googleMapsUri} target="_blank" rel="noopener noreferrer" className="underline">{state.result.googleMapsUri}</a></dd></>}
        </dl>
      )}
    </div>
  );
}
