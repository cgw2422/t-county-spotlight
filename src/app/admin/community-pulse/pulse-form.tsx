"use client";
import { useState } from "react";
import Link from "next/link";
import { Archive, ChevronDown, Eye, EyeOff, Rocket, Save, Settings2 } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { MediaField } from "@/components/admin/media-picker";
import { StatusBadge } from "@/components/admin/status-badge";
import { ContentEditor } from "@/components/editor/content-editor";
import { slugify } from "@/lib/utils";
import { savePulse } from "./actions";

export type PulseFormData = {
  id: string;
  title: string;
  slug: string;
  status: string;
  description: string;
  intro: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  categoryId: string;
  sourceType: string;
  sourceUrl: string;
  sourceLabel: string;
  methodology: string;
  discussionDate: string;
  publishedAt: string;
  displayMode: string;
  sortMode: string;
  homepageLimit: number;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
  wasPublished: boolean;
};

const SOURCE_OPTIONS = [
  { value: "FACEBOOK", label: "Facebook discussion" },
  { value: "COMMUNITY_SUBMISSION", label: "Community submission" },
  { value: "SURVEY", label: "Survey" },
  { value: "EDITORIAL", label: "Editorial feature" },
  { value: "OTHER", label: "Other" },
];
const DISPLAY_OPTIONS = [
  { value: "RANKED_LIST", label: "Ranked list", help: "Numbered 1, 2, 3… with mention counts" },
  { value: "BARS", label: "Comparison bars", help: "Bars sized relative to the top result" },
  { value: "EDITORIAL_LIST", label: "Editorial list (no counts)", help: "A curated list without numbers" },
];

export function PulseForm({ pulse, categories }: { pulse: PulseFormData | null; categories: { id: string; name: string }[] }) {
  const p = pulse;
  const status = p?.status ?? "DRAFT";
  const [title, setTitle] = useState(p?.title ?? "");
  const [slugTouched, setSlugTouched] = useState(!!p?.slug);
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [sourceType, setSourceType] = useState(p?.sourceType ?? "FACEBOOK");
  const [seoOpen, setSeoOpen] = useState(false);
  const isLive = status === "PUBLISHED";
  const slugChanged = !!p?.wasPublished && slug !== p.slug && !!slug;

  return (
    <ActionForm action={savePulse} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {p && <input type="hidden" name="id" value={p.id} />}

      <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:col-span-2 lg:-mx-8 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <StatusBadge status={status} />
          <DirtyIndicator />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p && <Link href={`/admin/community-pulse/${p.id}/preview/`} target="_blank" className="btn-ghost btn-sm"><Eye className="h-4 w-4" /> Preview</Link>}
          <Submit name="intent" value="save" className="btn-secondary btn-sm" pendingText="Saving…"><Save className="h-4 w-4" /> {isLive ? "Save changes" : "Save draft"}</Submit>
          {!isLive && <Submit name="intent" value="publish" className="btn-primary btn-sm" pendingText="Publishing…"><Rocket className="h-4 w-4" /> Publish now</Submit>}
        </div>
      </div>

      <div className="min-w-0 space-y-5">
        <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="basic-h">
          <h2 id="basic-h" className="font-semibold text-slate-900">Basic info</h2>
          <div>
            <label htmlFor="f-title" className="label">Title / question <span className="text-red-600">*</span></label>
            <input
              id="f-title" name="title" required maxLength={300} value={title}
              onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
              className="input text-lg font-semibold" placeholder="Who do locals recommend for auto repair in T County?"
            />
          </div>
          <div>
            <label htmlFor="f-slug" className="label">Slug</label>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
              <span className="hidden items-center bg-slate-50 px-3 text-sm text-slate-500 sm:flex">/community-pulse/</span>
              <input id="f-slug" name="slug" value={slug} maxLength={120} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }} className="min-h-11 w-full min-w-0 border-0 px-3 text-base focus:outline-none focus:ring-0 sm:text-sm" placeholder="auto-generated-from-title" />
            </div>
            <p className="help">{slugChanged ? <span className="text-amber-700">This entry has been public — saving creates a redirect from the old URL.</span> : "Lowercase letters, numbers and dashes. Must be unique."}</p>
          </div>
          <div>
            <label htmlFor="f-description" className="label">Short description</label>
            <textarea id="f-description" name="description" rows={2} maxLength={600} defaultValue={p?.description} className="input" placeholder="One or two sentences shown on cards and in search results." />
          </div>
          <div>
            <ContentEditor name="intro" label="Introduction (optional)" defaultValue={p?.intro} stickyClass="top-[7.5rem]" />
          </div>
        </section>

        <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="source-h">
          <h2 id="source-h" className="font-semibold text-slate-900">Source</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="f-sourceType" className="label">Source type</label>
              <select id="f-sourceType" name="sourceType" value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="input">
                {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-sourceLabel" className="label">Source label (optional)</label>
              <input id="f-sourceLabel" name="sourceLabel" maxLength={160} defaultValue={p?.sourceLabel} className="input" placeholder="e.g. T County Connect Facebook group" />
            </div>
          </div>
          <div>
            <label htmlFor="f-sourceUrl" className="label">{sourceType === "FACEBOOK" ? "Original Facebook post URL" : "Source URL"} (optional)</label>
            <input id="f-sourceUrl" name="sourceUrl" type="url" inputMode="url" maxLength={2000} defaultValue={p?.sourceUrl} className="input" placeholder="https://" />
            <p className="help">Must start with http:// or https://. Shown as a “View the original discussion” link.</p>
          </div>
          <div>
            <label htmlFor="f-methodology" className="label">Methodology note (optional)</label>
            <textarea id="f-methodology" name="methodology" rows={3} maxLength={2000} defaultValue={p?.methodology} className="input" placeholder="e.g. Counted one mention per commenter; duplicate spellings combined; compiled on Nov 5." />
            <p className="help">Plain text. Shown under the disclosure on the public page.</p>
          </div>
          <div>
            <label htmlFor="f-discussionDate" className="label">Discussion date</label>
            <input id="f-discussionDate" name="discussionDate" type="date" defaultValue={p?.discussionDate} className="input sm:max-w-xs" />
            <p className="help">When the conversation happened (Eastern Time). “Results last updated” is set with the results below.</p>
          </div>
        </section>

        <div className="card">
          <button type="button" onClick={() => setSeoOpen(!seoOpen)} className="flex min-h-12 w-full items-center justify-between px-4 text-left sm:px-5" aria-expanded={seoOpen}>
            <span className="font-semibold text-slate-900">SEO & social sharing</span>
            <ChevronDown className={`h-5 w-5 text-slate-400 transition ${seoOpen ? "rotate-180" : ""}`} />
          </button>
          <div className={seoOpen ? "space-y-4 border-t border-slate-100 p-4 sm:p-5" : "hidden"}>
            <div>
              <label htmlFor="f-seoTitle" className="label">SEO title</label>
              <input id="f-seoTitle" name="seoTitle" maxLength={200} defaultValue={p?.seoTitle} className="input" placeholder={title || "Defaults to the title"} />
            </div>
            <div>
              <label htmlFor="f-seoDescription" className="label">Meta description</label>
              <textarea id="f-seoDescription" name="seoDescription" rows={2} maxLength={400} defaultValue={p?.seoDescription} className="input" placeholder="Defaults to the short description" />
            </div>
            <MediaField name="ogImageUrl" label="Social share image (Open Graph)" defaultValue={p?.ogImageUrl} help="Defaults to the featured image." aspect="aspect-[1200/630]" className="max-w-md" />
          </div>
        </div>
      </div>

      <aside className="min-w-0 space-y-5">
        <div className="card p-4 sm:p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Publishing</h2>
          <label htmlFor="f-publishedAt" className="label">Publication date</label>
          <input id="f-publishedAt" type="datetime-local" name="publishedAt" defaultValue={p?.publishedAt} className="input" />
          <p className="help">Eastern Time. Left empty, it is set when you publish. A future date keeps the entry hidden until then.</p>
          <div className="mt-3 grid gap-2">
            {isLive && <Submit name="intent" value="unpublish" className="btn-secondary w-full"><EyeOff className="h-4 w-4" /> Unpublish</Submit>}
            {status !== "ARCHIVED" && p && <Submit name="intent" value="archive" className="btn-ghost w-full"><Archive className="h-4 w-4" /> Archive</Submit>}
            {status === "ARCHIVED" && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Archived entries stay reachable at their URL (marked “Archived”) but leave recent lists. Publish to restore.</p>}
          </div>
        </div>

        <div className="card space-y-4 p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="f-categoryId" className="label">Category</label>
              <Link href="/admin/community-pulse/categories/" className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"><Settings2 className="h-3.5 w-3.5" /> Manage</Link>
            </div>
            <select id="f-categoryId" name="categoryId" defaultValue={p?.categoryId ?? ""} className="input">
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <fieldset>
            <legend className="label">Display mode</legend>
            <div className="space-y-1.5">
              {DISPLAY_OPTIONS.map((o) => (
                <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-2.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                  <input type="radio" name="displayMode" value={o.value} defaultChecked={(p?.displayMode ?? "RANKED_LIST") === o.value} className="mt-0.5 h-4 w-4 accent-brand-600" />
                  <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{o.label}</span><span className="block text-xs text-slate-500">{o.help}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="f-sortMode" className="label">Sort results by</label>
            <select id="f-sortMode" name="sortMode" defaultValue={p?.sortMode ?? "MENTIONS_DESC"} className="input">
              <option value="MENTIONS_DESC">Highest mentions</option>
              <option value="MANUAL">Manual order</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-homepageLimit" className="label">Results shown on the homepage</label>
            <input id="f-homepageLimit" name="homepageLimit" type="number" min={1} max={10} step={1} required defaultValue={p?.homepageLimit ?? 3} className="input sm:max-w-[8rem]" />
            <p className="help">1–10, used when this entry is featured.</p>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <MediaField name="featuredImageUrl" altName="featuredImageAlt" label="Featured image" defaultValue={p?.featuredImageUrl} defaultAlt={p?.featuredImageAlt} />
        </div>
      </aside>
    </ActionForm>
  );
}
