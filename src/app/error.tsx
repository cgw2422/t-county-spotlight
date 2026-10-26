"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy-900">We hit a snag loading this page</h1>
      <p className="mt-3 text-slate-600">Please try again in a moment. If the problem continues, the site may be undergoing maintenance.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Go home</Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-slate-400">Reference: {error.digest}</p>}
    </main>
  );
}
