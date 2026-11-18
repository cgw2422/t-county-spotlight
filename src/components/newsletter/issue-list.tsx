import Link from "next/link";
import { Mail } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { cn, formatDate } from "@/lib/utils";

type Issue = { id: string; slug: string; title: string; subtitle: string | null; thumbnailUrl: string | null; publishedAt: Date };

/** "Past editions" list on /newsletter/ (beehiiv-synced issues). */
export function IssueList({ issues, className }: { issues: Issue[]; className?: string }) {
  return (
    <ul className={cn("grid gap-4", className)} data-testid="issue-list">
      {issues.map((i) => (
        <li key={i.id}>
          <Link href={`/newsletter/${i.slug}/`} className="card card-hover flex min-h-11 items-stretch gap-4 overflow-hidden p-3 sm:p-4">
            <span className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block">
              {i.thumbnailUrl ? <SmartImage src={i.thumbnailUrl} alt="" fill sizes="112px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-slate-400"><Mail className="h-6 w-6" aria-hidden /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <time dateTime={i.publishedAt.toISOString()} className="block text-xs font-semibold uppercase tracking-wide text-hillside-700">{formatDate(i.publishedAt)}</time>
              <span className="mt-1 block font-display text-lg font-semibold leading-snug text-navy-900 break-words">{i.title}</span>
              {i.subtitle && <span className="mt-1 block text-sm text-slate-600 line-clamp-2">{i.subtitle}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
