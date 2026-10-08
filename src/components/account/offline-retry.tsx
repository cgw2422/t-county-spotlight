"use client";
import { RefreshCw } from "lucide-react";

export function OfflineRetry() {
  return (
    <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
      <RefreshCw className="h-4 w-4" aria-hidden /> Try again
    </button>
  );
}
