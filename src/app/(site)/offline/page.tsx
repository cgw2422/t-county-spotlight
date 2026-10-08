import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { OfflineRetry } from "@/components/account/offline-retry";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className="container-page flex min-h-[60vh] max-w-md flex-col items-center justify-center py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-800 text-white"><WifiOff className="h-8 w-8" aria-hidden /></span>
      <h1 className="mt-5 font-display text-3xl font-semibold text-navy-900">You&apos;re offline</h1>
      <p className="mt-2 text-slate-600">It looks like you&apos;ve lost your connection. Check your Wi-Fi or mobile data and try again — Tuscarawas County will be right here.</p>
      <OfflineRetry />
    </div>
  );
}
