"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };

export function toast(message: string, tone: Toast["tone"] = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tcs-toast", { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<Toast, "id">;
      const id = ++n + Date.now();
      setItems((x) => [...x.slice(-3), { ...d, id }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), d.tone === "error" ? 7000 : 3500);
    };
    window.addEventListener("tcs-toast", on);
    return () => window.removeEventListener("tcs-toast", on);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pb-safe sm:bottom-6 sm:items-end sm:px-6">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${t.tone === "error" ? "bg-red-50 text-red-800 ring-red-200" : "bg-navy-900 text-white ring-navy-800"}`}>
          {t.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Dismiss" className="-mr-1 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
