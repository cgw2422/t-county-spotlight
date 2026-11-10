"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { sendTrack } from "@/components/public/track";
import { setCommunityAction } from "@/app/(site)/my-t-county/actions";

/** "Set as my community" — reuses the My T County setter (account field or device cookie). */
export function SetCommunityButton({ slug, name, isCurrent }: { slug: string; name: string; isCurrent: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(isCurrent);
  if (done) {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-hillside-50 px-3 text-sm font-semibold text-hillside-700 ring-1 ring-hillside-200" data-testid="community-is-mine">
        <Check className="h-4 w-4" aria-hidden /> {name} is your community
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      data-testid="set-community"
      onClick={() => start(async () => {
        const r = await setCommunityAction(slug);
        if (r.ok) {
          setDone(true);
          sendTrack({ type: "set_community", targetType: "COMMUNITY", targetId: slug });
          router.refresh();
        }
      })}
      className="btn-secondary min-h-11"
    >
      <MapPin className="h-4 w-4" aria-hidden /> {pending ? "Saving…" : "Set as my community"}
    </button>
  );
}
