import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { Card } from "@/components/admin/page-header";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { HoursEditor } from "@/components/admin/hours-editor";
import { CitySelect } from "@/components/admin/city-select";
import { ContentEditor } from "@/components/editor/content-editor";
import type { Business } from "@/generated/prisma/client";
import { saveBusiness } from "./actions";

const SOCIALS = [
  { key: "facebook", label: "Facebook" }, { key: "instagram", label: "Instagram" }, { key: "x", label: "X (Twitter)" },
  { key: "tiktok", label: "TikTok" }, { key: "youtube", label: "YouTube" }, { key: "linkedin", label: "LinkedIn" },
];

export const BUSINESS_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft — not visible" },
  { value: "PENDING", label: "Pending review" },
  { value: "PUBLISHED", label: "Published" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "ARCHIVED", label: "Archived" },
];

export function BusinessForm({ b, categories, selectedCategoryIds = [] }: {
  b: (Business & { categoryIds?: string[] }) | null; categories: { id: string; name: string }[]; selectedCategoryIds?: string[];
}) {
  const socials = (b?.socials ?? {}) as Record<string, string>;
  const imported = !!b?.wpId;
  return (
    <ActionForm action={saveBusiness} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Basics">
          <div className="space-y-4">
            <TextField name="name" label="Business name" required defaultValue={b?.name} maxLength={200} />
            <FormGrid>
              <TextField name="slug" label="Slug" defaultValue={b?.slug} help={b ? `Public URL: /business/${b.slug}/` : "Leave blank to generate from the name."} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
              <TextField name="tagline" label="Tagline" defaultValue={b?.tagline ?? ""} maxLength={200} placeholder="Family-owned bakery since 1952" />
            </FormGrid>
          </div>
        </Card>
        <Card title="Logo & cover">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <MediaField name="logoUrl" label="Logo" defaultValue={b?.logoUrl} aspect="aspect-square" />
            <MediaField name="coverUrl" label="Cover photo" defaultValue={b?.coverUrl} aspect="aspect-[16/9]" />
          </div>
        </Card>
        <Card title="Description" description="Shown on the business page.">
          <ContentEditor name="description" modeName="descriptionMode" label="About" defaultValue={b?.description} defaultMode={imported ? "html" : "visual"} imported={imported} />
          <div className="mt-6">
            <ContentEditor name="story" modeName="storyMode" label="Our story (optional)" defaultValue={b?.story} defaultMode={imported && b?.story ? "html" : "visual"} imported={imported && !!b?.story} />
          </div>
        </Card>
        <Card title="Location & contact">
          <div className="space-y-4">
            <TextField name="address" label="Street address" defaultValue={b?.address ?? ""} maxLength={300} />
            <FormGrid>
              <CitySelect defaultValue={b?.city} />
              <TextField name="zip" label="ZIP" defaultValue={b?.zip ?? ""} inputMode="numeric" maxLength={10} />
              <TextField name="phone" label="Phone" type="tel" defaultValue={b?.phone ?? ""} maxLength={40} />
              <TextField name="website" label="Website" type="url" defaultValue={b?.website ?? ""} placeholder="https://" />
              <TextField name="email" label="Email" type="email" defaultValue={b?.email ?? ""} />
              <div className="sm:pt-7"><Checkbox name="emailPublic" label="Show email publicly" defaultChecked={b?.emailPublic} help="Otherwise it's only used for admin contact." /></div>
            </FormGrid>
          </div>
        </Card>
        <Card title="Social links">
          <FormGrid>
            {SOCIALS.map((s) => <TextField key={s.key} name={`social_${s.key}`} label={s.label} defaultValue={socials[s.key] ?? ""} placeholder="https://" />)}
          </FormGrid>
        </Card>
        <Card title="Hours">
          <HoursEditor name="hours" defaultValue={Array.isArray(b?.hours) ? (b!.hours as { day: string; open: string; close: string; closed: boolean }[]) : null} />
        </Card>
        <Card title="SEO">
          <div className="space-y-4">
            <TextField name="seoTitle" label="SEO title" defaultValue={b?.seoTitle ?? ""} maxLength={200} placeholder="Defaults to the business name" />
            <TextArea name="seoDescription" label="Meta description" defaultValue={b?.seoDescription ?? ""} maxLength={400} rows={2} placeholder="Defaults to the tagline" />
          </div>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Visibility">
          <div className="space-y-2">
            <SelectField name="status" label="Status" defaultValue={b?.status ?? "PUBLISHED"} options={BUSINESS_STATUS_OPTIONS} />
            <Checkbox name="isFeatured" label="Featured business" defaultChecked={b?.isFeatured} help="Eligible for featured directory spots." />
            <Checkbox name="isSpotlighted" label="Editorial spotlight — never sold" defaultChecked={b?.isSpotlighted} help="Chosen by the editorial team only. Payment never grants this." />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
            <Submit pendingText="Saving…" className="btn-primary w-full">{b ? "Save changes" : "Create business"}</Submit>
            <div className="text-center"><DirtyIndicator /></div>
          </div>
        </Card>
        <Card title="Categories">
          {categories.length ? (
            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {categories.map((c) => (
                <label key={c.id} className="flex min-h-10 items-center gap-2.5 rounded px-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" name="categories" value={c.id} defaultChecked={selectedCategoryIds.includes(c.id)} className="h-4 w-4 accent-brand-600" />
                  {c.name}
                </label>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No categories yet.</p>}
        </Card>
      </aside>
    </ActionForm>
  );
}
