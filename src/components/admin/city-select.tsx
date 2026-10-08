"use client";
import { useState } from "react";
import { TUSCARAWAS_CITIES } from "@/lib/utils";

/** City select (Tuscarawas County list) with a free-text "Other" option. */
export function CitySelect({ name = "city", otherName = "cityOther", defaultValue, label = "City" }: { name?: string; otherName?: string; defaultValue?: string | null; label?: string }) {
  const known = !defaultValue || TUSCARAWAS_CITIES.includes(defaultValue);
  const [val, setVal] = useState(known ? defaultValue ?? "" : "__other");
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}</label>
      <select id={`f-${name}`} name={name} className="input" value={val} onChange={(e) => setVal(e.target.value)}>
        <option value="">Select a city…</option>
        {TUSCARAWAS_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__other">Other…</option>
      </select>
      {val === "__other" && <input name={otherName} className="input mt-2" defaultValue={known ? "" : defaultValue ?? ""} placeholder="City name" aria-label="Other city" maxLength={100} />}
    </div>
  );
}
