"use client";
import { useState } from "react";
import { CheckCircle2, CircleHelp, Loader2, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoogleListingValues = { placeId: string; mapsUrl: string; reviewsEnabled: boolean; verifiedAt: string | null };

type Result = { id: string; name: string; address: string | null; googleMapsUri: string | null };

/**
 * Google listing fields shared by the admin business editor and the owner dashboard.
 * Must be rendered inside the editor's <form>; the server action reads
 * googleListing / googlePlaceId / googleMapsUrl / googleReviewsEnabled.
 */
export function GoogleListingFields({ businessId, initial, searchAvailable, defaultQuery, errors }: {
  businessId?: string;
  initial: GoogleListingValues;
  searchAvailable: boolean;
  defaultQuery?: string;
  errors?: { googlePlaceId?: string; googleMapsUrl?: string };
}) {
  const [placeId, setPlaceId] = useState(initial.placeId);
  const [mapsUrl, setMapsUrl] = useState(initial.mapsUrl);
  const [query, setQuery] = useState(defaultQuery ?? "");
  const [results, setResults] = useState<Result[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const changed = placeId.trim() !== initial.placeId;
  const verified = !!initial.verifiedAt && !changed && !!placeId.trim();

  async function runSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const qs = new URLSearchParams({ q: query.trim(), ...(businessId ? { businessId } : {}) });
      const res = await fetch(`/api/google/places-search/?${qs}`, { headers: { accept: "application/json" } });
      const json = (await res.json()) as { results?: Result[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Search failed.");
      setResults(json.results ?? []);
    } catch (e) {
      setResults(null);
      setSearchError((e as Error).message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="googleListing" value="1" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Status:</span>
        {verified ? (
          <span className="badge-green"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Verified with Google</span>
        ) : (
          <span className="badge-gray"><CircleHelp className="h-3.5 w-3.5" aria-hidden /> Not verified</span>
        )}
        {changed && placeId.trim() && <span className="text-xs text-slate-500">{searchAvailable ? "Will be checked with Google when you save." : "Unsaved change."}</span>}
      </div>

      {searchAvailable && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="g-search" className="label">Find your business on Google</label>
          <div className="flex gap-2">
            <input
              id="g-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="Business name and address"
              className="input min-w-0 flex-1"
              maxLength={200}
            />
            <button type="button" onClick={runSearch} disabled={searching || query.trim().length < 2} className="btn-secondary shrink-0">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Search
            </button>
          </div>
          {searchError && <p role="alert" className="mt-2 text-sm text-red-600">{searchError}</p>}
          {results && (
            results.length ? (
              <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-live="polite">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => { setPlaceId(r.id); if (r.googleMapsUri) setMapsUrl(r.googleMapsUri); setResults(null); }}
                      className={cn("flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50", r.id === placeId && "bg-brand-50")}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0"><span className="block font-medium text-slate-900">{r.name}</span>{r.address && <span className="block text-slate-500">{r.address}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500" aria-live="polite">No matches. Try the exact name plus city, or paste a link below.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Results from Google. Pick yours to fill in the fields below.</p>
        </div>
      )}

      <div>
        <label htmlFor="f-googleMapsUrl" className="label">Google Maps link</label>
        <input id="f-googleMapsUrl" name="googleMapsUrl" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} inputMode="url" maxLength={2000}
          placeholder="https://maps.app.goo.gl/…" className={cn("input", errors?.googleMapsUrl && "border-red-400")} aria-invalid={!!errors?.googleMapsUrl || undefined} aria-describedby="f-googleMapsUrl-d" />
        <p id="f-googleMapsUrl-d" className={errors?.googleMapsUrl ? "mt-1 text-sm text-red-600" : "help"}>
          {errors?.googleMapsUrl || "In Google Maps, open your business, tap Share and copy the link. Only google.com/maps and maps.app.goo.gl links are accepted."}
        </p>
      </div>
      <div>
        <label htmlFor="f-googlePlaceId" className="label">Google Place ID</label>
        <input id="f-googlePlaceId" name="googlePlaceId" value={placeId} onChange={(e) => setPlaceId(e.target.value)} maxLength={300} autoComplete="off" spellCheck={false}
          placeholder="ChIJ…" className={cn("input font-mono text-sm", errors?.googlePlaceId && "border-red-400")} aria-invalid={!!errors?.googlePlaceId || undefined} aria-describedby="f-googlePlaceId-d" />
        <p id="f-googlePlaceId-d" className={errors?.googlePlaceId ? "mt-1 text-sm text-red-600" : "help"}>
          {errors?.googlePlaceId || <>Optional if you pasted a link. Find it with Google&rsquo;s <a href="https://developers.google.com/maps/documentation/places/web-service/place-id#find-id" target="_blank" rel="noopener noreferrer" className="underline">Place ID Finder</a>.</>}
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input type="checkbox" name="googleReviewsEnabled" defaultChecked={initial.reviewsEnabled} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600" />
        <span className="text-sm">
          <span className="block font-medium text-navy-900">Show Google reviews link on my profile</span>
          <span className="block text-slate-500">Adds a &ldquo;Reviews on Google&rdquo; card to the public listing. Reviews are shown exactly as Google provides them.</span>
        </span>
      </label>
    </div>
  );
}
