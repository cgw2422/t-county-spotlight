import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Building2, Clock, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { jobHref } from "@/lib/links";
import { formatDate, stripHtml, truncate } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { Pagination } from "@/components/public/pagination";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import { openJobWhere } from "./data";

export const dynamic = "force-dynamic";
const PER_PAGE = 20;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const page = pageParam(await searchParams);
  return buildMetadata({
    title: "Local Jobs in Tuscarawas County",
    description: "Job openings at local businesses and organizations across Tuscarawas County, Ohio.",
    path: `/jobs/${qs({ page: page > 1 ? page : undefined })}`,
  });
}

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = pageParam(sp);
  const q = param(sp, "q").slice(0, 100);
  const where = openJobWhere(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { employerName: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] } : {});
  const [settings, total, jobs] = await Promise.all([
    getSettings(),
    db.job.count({ where }),
    db.job.findMany({
      where,
      orderBy: [{ isSponsored: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { business: { select: { name: true, logoUrl: true, city: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Work local" title="Jobs" subtitle="Openings at businesses and organizations around Tuscarawas County." crumbs={[{ label: "Jobs" }]}>
        <Link href="/list-your-business/" className="btn-secondary">Post a job</Link>
      </PageHeader>
      <div className="container-page py-8 sm:py-10">
        {jobs.length === 0 ? (
          <EmptyState icon={Briefcase} title={q ? "No jobs match that search" : "No job openings posted right now"}>
            {q ? <><Link href="/jobs/" className="font-semibold text-brand-700">See all jobs</Link>.</> : <>Hiring in Tuscarawas County? <Link href="/list-your-business/" className="font-semibold text-brand-700">Post a job</Link> by listing your business with us.</>}
          </EmptyState>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600"><span className="font-semibold text-slate-900">{total}</span> open {total === 1 ? "position" : "positions"}</p>
            <ul className="grid grid-cols-1 gap-3">
              {jobs.map((j) => {
                const employer = j.business?.name || j.employerName;
                return (
                  <li key={j.id}>
                    <Link href={jobHref(j)} className="card card-hover group flex gap-4 p-4 sm:p-5">
                      <div className="relative hidden h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block">
                        {j.business?.logoUrl ? <SmartImage src={j.business.logoUrl} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-slate-400"><Building2 className="h-6 w-6" aria-hidden /></span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-navy-900 group-hover:text-brand-700">{j.title}</h2>
                          {j.isSponsored && <span className="badge-sponsored">{settings.sponsoredLabel}</span>}
                        </div>
                        {employer && <p className="text-sm text-slate-600">{employer}</p>}
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          {(j.location || j.business?.city) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{j.location || j.business?.city}</span>}
                          {j.employmentType && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{j.employmentType}</span>}
                          {j.payRange && <span>{j.payRange}</span>}
                          <span>Posted {formatDate(j.createdAt, { month: "short", day: "numeric" })}</span>
                        </p>
                        {j.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{truncate(stripHtml(j.description), 200)}</p>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} hrefFor={(p) => `/jobs/${qs({ q: q || undefined, page: p > 1 ? p : undefined })}`} />
      </div>
    </>
  );
}
