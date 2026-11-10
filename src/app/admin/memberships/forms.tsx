import { ActionForm, Submit } from "@/components/admin/action-form";
import { Card, Notice } from "@/components/admin/page-header";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { TokenInput } from "@/components/admin/token-input";
import type { MembershipPlan, SponsorshipProduct } from "@/generated/prisma/client";
import { FREE_ENTITLEMENTS, PREMIUM_ENTITLEMENTS, type Entitlements } from "@/lib/entitlements";
import { savePlan, saveProduct } from "./actions";

export function PlanForm({ p }: { p: MembershipPlan | null }) {
  const e = (p?.entitlements ?? {}) as Partial<Entitlements>;
  // Unset values fall back to the built-in defaults for the plan type (see src/lib/entitlements.ts).
  const d = p?.interval === "FREE" ? FREE_ENTITLEMENTS : p ? PREMIUM_ENTITLEMENTS : FREE_ENTITLEMENTS;
  return (
    <ActionForm action={savePlan} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Plan">
          <div className="space-y-4">
            <FormGrid>
              <TextField name="name" label="Name" required defaultValue={p?.name} />
              <TextField name="slug" label="Slug" defaultValue={p?.slug} />
              <TextField name="price" type="number" step="0.01" min={0} label="Price (USD)" defaultValue={p ? (p.priceCents / 100).toFixed(2) : ""} />
              <SelectField name="interval" label="Billing" defaultValue={p?.interval ?? "MONTH"} options={[{ value: "MONTH", label: "Monthly" }, { value: "YEAR", label: "Yearly" }, { value: "FREE", label: "Free" }]} />
            </FormGrid>
            <TextArea name="description" label="Description" defaultValue={p?.description ?? ""} rows={2} />
            <TokenInput name="features" label="Feature bullet points" defaultValue={p?.features} placeholder="Type a feature and press Enter" help="Shown on the public memberships page." />
          </div>
        </Card>
        <Card title="Entitlements" description="What this plan unlocks in the business dashboard. Granted only from verified subscription records.">
          <div className="grid gap-1 sm:grid-cols-2">
            <Checkbox name="promotions" label="Post specials" defaultChecked={e.promotions ?? d.promotions} />
            <Checkbox name="events" label="Post events" defaultChecked={e.events ?? true} />
            <Checkbox name="updates" label="Post business updates" defaultChecked={e.updates ?? d.updates} />
            <Checkbox name="analytics" label="Listing analytics" defaultChecked={e.analytics ?? d.analytics} />
            <Checkbox name="googleReviews" label="Google reviews integration" defaultChecked={e.googleReviews ?? d.googleReviews} />
            <Checkbox name="servicesMenus" label="Services & menus" defaultChecked={e.servicesMenus ?? d.servicesMenus} />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <TextField name="maxPhotos" type="number" min={0} max={200} label="Max gallery photos" defaultValue={e.maxPhotos ?? d.maxPhotos} help="Logo and cover don't count." />
            <TextField name="maxEvents" type="number" min={0} max={10000} label="Max events" defaultValue={"maxEvents" in e ? e.maxEvents ?? "" : d.maxEvents ?? ""} help="Leave blank for unlimited." />
            <TextField name="descriptionLimit" type="number" min={50} max={20000} label="Description limit" defaultValue={e.descriptionLimit ?? d.descriptionLimit} help="Characters (plain text)." />
          </div>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Availability">
          <div className="space-y-2">
            <Notice tone="warn">Plans stay <strong>inactive</strong> until you’ve approved the pricing and connected a Stripe price. Inactive plans can’t be purchased.</Notice>
            <TextField name="stripePriceId" label="Stripe price ID" defaultValue={p?.stripePriceId ?? ""} placeholder="price_…" />
            <Checkbox name="isActive" label="Active (available for purchase)" defaultChecked={p?.isActive} />
            <Checkbox name="isPublic" label="Show on public pricing page" defaultChecked={p ? p.isPublic : true} />
            <TextField name="sortOrder" type="number" min={0} label="Sort order" defaultValue={p?.sortOrder ?? 0} />
          </div>
          <Submit className="btn-primary mt-4 w-full" pendingText="Saving…">{p ? "Save plan" : "Create plan"}</Submit>
        </Card>
      </aside>
    </ActionForm>
  );
}

export const PRODUCT_TYPES = [
  { value: "featured_placement", label: "Featured placement" }, { value: "event_sponsorship", label: "Event sponsorship" },
  { value: "weekend_guide", label: "Weekend guide sponsor" }, { value: "job_listing", label: "Job listing" },
  { value: "category_sponsorship", label: "Category sponsorship" }, { value: "promotional_placement", label: "Promotional placement" },
];

export function ProductForm({ p }: { p: SponsorshipProduct | null }) {
  return (
    <Card className="max-w-2xl">
      <ActionForm action={saveProduct} className="space-y-4">
        {p && <input type="hidden" name="id" value={p.id} />}
        <FormGrid>
          <TextField name="name" label="Name" required defaultValue={p?.name} />
          <TextField name="slug" label="Slug" defaultValue={p?.slug} />
          <SelectField name="type" label="Type" defaultValue={p?.type ?? "featured_placement"} options={PRODUCT_TYPES} />
          <TextField name="price" type="number" step="0.01" min={0} label="Price (USD)" defaultValue={p ? (p.priceCents / 100).toFixed(2) : ""} />
          <TextField name="durationDays" type="number" min={1} label="Duration (days)" defaultValue={p?.durationDays ?? 30} />
          <TextField name="stripePriceId" label="Stripe price ID" defaultValue={p?.stripePriceId ?? ""} placeholder="price_…" />
        </FormGrid>
        <TextArea name="description" label="Description" defaultValue={p?.description ?? ""} rows={3} />
        <Checkbox name="isActive" label="Active (available for purchase)" defaultChecked={p?.isActive} help="Keep inactive until pricing is approved." />
        <Submit pendingText="Saving…">{p ? "Save product" : "Create product"}</Submit>
      </ActionForm>
    </Card>
  );
}
