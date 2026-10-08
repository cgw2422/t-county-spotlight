"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Send, CalendarClock, EyeOff, Save, Rocket, ChevronDown } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import { TokenInput } from "@/components/admin/token-input";
import { StatusBadge } from "@/components/admin/status-badge";
import { ContentEditor } from "@/components/editor/content-editor";
import type { LookupItem } from "@/app/admin/_actions/common";
import { slugify } from "@/lib/utils";
import { autosaveArticle, saveArticle } from "./actions";

export type ArticleFormData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  kind: string;
  status: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  ogImageUrl: string;
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  isFeatured: boolean;
  publishAtInput: string;
  publishedLabel: string;
  categoryIds: string[];
  tagNames: string[];
  businesses: LookupItem[];
  imported: boolean;
  legacyPath: string;
};

const KIND_OPTIONS = [
  { value: "SPOTLIGHT", label: "Business Spotlight" },
  { value: "NEWS", label: "News" },
  { value: "ANNOUNCEMENT", label: "Announcement" },
  { value: "THINGS_TO_DO", label: "Things to Do" },
  { value: "GENERAL", label: "General" },
];

export function ArticleForm({ article, categories, tagSuggestions }: {
  article: ArticleFormData | null;
  categories: { id: string; name: string }[];
  tagSuggestions: string[];
}) {
  const a = article;
  const status = a?.status ?? "DRAFT";
  const formRef = useRef<HTMLFormElement>(null);
  const changed = useRef(false);
  const [autosaved, setAutosaved] = useState<string | null>(null);
  const [autosaveErr, setAutosaveErr] = useState<string | null>(null);
  const [title, setTitle] = useState(a?.title ?? "");
  const [slugTouched, setSlugTouched] = useState(!!a?.slug);
  const [slug, setSlug] = useState(a?.slug ?? "");
  const [seoOpen, setSeoOpen] = useState(false);

  // Autosave drafts every 20s when there are unsaved edits.
  useEffect(() => {
    if (!a?.id || status !== "DRAFT") return;
    const t = setInterval(async () => {
      if (!changed.current || !formRef.current) return;
      const fd = new FormData(formRef.current);
      const t = String(fd.get("title") ?? "").trim();
      if (!t) return;
      changed.current = false;
      try {
        const r = await autosaveArticle(a.id, { title: t, excerpt: String(fd.get("excerpt") ?? ""), content: String(fd.get("content") ?? "") });
        if (r.ok && r.savedAt) { setAutosaved(new Date(r.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })); setAutosaveErr(null); }
        else { setAutosaveErr(r.error ?? "Autosave failed"); changed.current = true; }
      } catch {
        setAutosaveErr("Autosave failed — check your connection"); changed.current = true;
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [a?.id, status]);

  const isLive = status === "PUBLISHED";
  const isScheduled = status === "SCHEDULED";

  return (
    <div onInput={() => { changed.current = true; }} onChange={() => { changed.current = true; }}>
      <ActionForm action={saveArticle} formRef={formRef} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {a && <input type="hidden" name="id" value={a.id} />}

        {/* Sticky action bar */}
        <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:col-span-2 lg:-mx-8 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <StatusBadge status={status} />
            <DirtyIndicator />
            {autosaved && <span className="hidden text-xs text-slate-500 sm:inline">Autosaved {autosaved}</span>}
            {autosaveErr && <span className="text-xs text-red-600">{autosaveErr}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {a && <Link href={`/admin/articles/${a.id}/preview/`} target="_blank" className="btn-ghost btn-sm"><Eye className="h-4 w-4" /> Preview</Link>}
            {isLive || isScheduled ? (
              <Submit name="intent" value="update" className="btn-primary btn-sm" pendingText="Saving…"><Save className="h-4 w-4" /> Update</Submit>
            ) : (
              <>
                <Submit name="intent" value="draft" className="btn-secondary btn-sm" pendingText="Saving…"><Save className="h-4 w-4" /> Save draft</Submit>
                <Submit name="intent" value="publish" className="btn-primary btn-sm" pendingText="Publishing…"><Rocket className="h-4 w-4" /> Publish</Submit>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="card space-y-4 p-4 sm:p-5">
            <div>
              <label htmlFor="f-title" className="label">Title <span className="text-red-600">*</span></label>
              <input
                id="f-title" name="title" required maxLength={300} value={title}
                onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
                className="input text-lg font-semibold sm:text-lg" placeholder="Article title"
              />
            </div>
            <div>
              <label htmlFor="f-slug" className="label">Slug</label>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
                <span className="hidden items-center bg-slate-50 px-3 text-sm text-slate-500 sm:flex">/articles/</span>
                <input id="f-slug" name="slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }} className="min-h-11 w-full min-w-0 border-0 px-3 text-base focus:outline-none focus:ring-0 sm:text-sm" placeholder="auto-generated-from-title" />
              </div>
              <p className="help">{a?.legacyPath ? <>Imported from WordPress — the public URL stays <code className="rounded bg-slate-100 px-1">{a.legacyPath}</code>.</> : "Lowercase letters, numbers and dashes. Must be unique."}</p>
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <ContentEditor name="content" defaultValue={a?.content} defaultMode={a?.imported ? "html" : "visual"} imported={a?.imported} stickyClass="top-[7.5rem]" />
          </div>

          <div className="card p-4 sm:p-5">
            <label htmlFor="f-excerpt" className="label">Excerpt</label>
            <textarea id="f-excerpt" name="excerpt" rows={3} maxLength={1000} defaultValue={a?.excerpt} className="input" placeholder="A one or two sentence summary shown on cards and search results." />
          </div>

          <div className="card">
            <button type="button" onClick={() => setSeoOpen(!seoOpen)} className="flex min-h-12 w-full items-center justify-between px-4 text-left sm:px-5" aria-expanded={seoOpen}>
              <span className="font-semibold text-slate-900">SEO & social sharing</span>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition ${seoOpen ? "rotate-180" : ""}`} />
            </button>
            <div className={seoOpen ? "space-y-4 border-t border-slate-100 p-4 sm:p-5" : "hidden"}>
              <div>
                <label htmlFor="f-seoTitle" className="label">SEO title</label>
                <input id="f-seoTitle" name="seoTitle" maxLength={200} defaultValue={a?.seoTitle} className="input" placeholder={title || "Defaults to the article title"} />
              </div>
              <div>
                <label htmlFor="f-seoDescription" className="label">Meta description</label>
                <textarea id="f-seoDescription" name="seoDescription" rows={2} maxLength={400} defaultValue={a?.seoDescription} className="input" placeholder="Defaults to the excerpt" />
                <p className="help">About 150–160 characters works best.</p>
              </div>
              <MediaField name="ogImageUrl" label="Social share image (Open Graph)" defaultValue={a?.ogImageUrl} help="Defaults to the featured image." aspect="aspect-[1200/630]" className="max-w-md" />
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-5">
          <div className="card p-4 sm:p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Publishing</h2>
            <dl className="mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Status</dt><dd><StatusBadge status={status} /></dd></div>
              {a?.publishedLabel && <div className="flex justify-between gap-2"><dt className="text-slate-500">{isScheduled ? "Goes live" : "Published"}</dt><dd className="text-right text-slate-800">{a.publishedLabel}</dd></div>}
            </dl>
            <label htmlFor="f-publishAt" className="label">{isLive ? "Publish date" : "Schedule for"}</label>
            <input id="f-publishAt" type="datetime-local" name="publishAt" defaultValue={a?.publishAtInput} className="input" />
            <p className="help">Eastern Time (America/New_York).</p>
            <div className="mt-3 grid gap-2">
              {!isLive && <Submit name="intent" value="schedule" className="btn-secondary w-full" pendingText="Scheduling…"><CalendarClock className="h-4 w-4" /> {isScheduled ? "Reschedule" : "Schedule"}</Submit>}
              {isScheduled && <Submit name="intent" value="publish" className="btn-secondary w-full"><Rocket className="h-4 w-4" /> Publish now</Submit>}
              {(status === "DRAFT" || status === "UNPUBLISHED") && <Submit name="intent" value="submit" className="btn-ghost w-full"><Send className="h-4 w-4" /> Submit for review</Submit>}
              {isLive && <Submit name="intent" value="unpublish" className="btn-secondary w-full"><EyeOff className="h-4 w-4" /> Unpublish</Submit>}
              {isScheduled && <Submit name="intent" value="draft" className="btn-ghost w-full">Cancel schedule (back to draft)</Submit>}
              {status === "PENDING" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Submitted for review. Publish or save as draft to change status.</p>}
            </div>
            <label className="mt-4 flex min-h-11 items-center gap-3 border-t border-slate-100 pt-3">
              <input type="checkbox" name="isFeatured" defaultChecked={a?.isFeatured} className="h-5 w-5 rounded accent-brand-600" />
              <span className="text-sm font-medium text-slate-800">Featured article</span>
            </label>
          </div>

          <div className="card space-y-4 p-4 sm:p-5">
            <div>
              <label htmlFor="f-kind" className="label">Article type</label>
              <select id="f-kind" name="kind" defaultValue={a?.kind ?? "GENERAL"} className="input">
                {KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="label">Categories</legend>
              {categories.length ? (
                <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {categories.map((c) => (
                    <label key={c.id} className="flex min-h-9 items-center gap-2.5 rounded px-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" name="categories" value={c.id} defaultChecked={a?.categoryIds.includes(c.id)} className="h-4 w-4 accent-brand-600" />
                      {c.name}
                    </label>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No categories yet.</p>}
              <div className="mt-2"><TokenInput name="newCategories" placeholder="Add new category…" /></div>
            </fieldset>
            <TokenInput name="tags" label="Tags" defaultValue={a?.tagNames} suggestions={tagSuggestions} placeholder="Add tags, press Enter" />
          </div>

          <div className="card p-4 sm:p-5">
            <MediaField name="featuredImageUrl" altName="featuredImageAlt" label="Featured image" defaultValue={a?.featuredImageUrl} defaultAlt={a?.featuredImageAlt} />
          </div>

          <div className="card space-y-4 p-4 sm:p-5">
            <SearchSelect name="businesses" type="business" label="Associated businesses" initial={a?.businesses} placeholder="Search businesses…" help="Shown as related businesses on the article." />
            <div>
              <label htmlFor="f-authorName" className="label">Author name</label>
              <input id="f-authorName" name="authorName" maxLength={120} defaultValue={a?.authorName} className="input" placeholder="Byline shown on the article" />
            </div>
          </div>
        </aside>
      </ActionForm>
    </div>
  );
}
