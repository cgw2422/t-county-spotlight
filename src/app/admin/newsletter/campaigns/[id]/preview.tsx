"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

/** Rendered email in a sandboxed iframe (srcdoc), desktop / mobile width. */
export function EmailPreview({ html, text }: { html: string; text: string }) {
  const [mode, setMode] = useState<"desktop" | "mobile" | "text">("desktop");
  return (
    <div>
      <div role="tablist" aria-label="Preview width" className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {([["desktop", "Desktop", Monitor], ["mobile", "Mobile", Smartphone], ["text", "Plain text", null]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", mode === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
            {Icon && <Icon className="h-4 w-4" aria-hidden />} {label}
          </button>
        ))}
      </div>
      {mode === "text" ? (
        <pre className="max-h-[900px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700">{text}</pre>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-4">
          <iframe title="Email preview" srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox"
            className={cn("mx-auto block h-[900px] rounded-lg bg-white transition-[width]", mode === "mobile" ? "w-[375px]" : "w-full min-w-[620px]")} />
        </div>
      )}
    </div>
  );
}

/** Refreshes server data while a campaign is sending. */
export function AutoRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
