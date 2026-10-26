"use client";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { CitySelect } from "@/components/admin/city-select";
import { htmlToText } from "@/components/dashboard/text";
import {
  NEED_CATEGORIES, NEED_CATEGORY_LABEL, NEED_STATUSES, NEED_STATUS_LABEL, NEED_URGENCIES, URGENCY_LABEL,
  OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABEL, ORG_ROLES, ORG_ROLE_LABEL, ORG_ROLE_HELP,
} from "@/lib/gives/constants";
import {
  addMemberAction, saveNeedAction, saveOpportunityAction, saveOrgEventAction, saveOrgUpdateAction,
} from "@/app/organization/[orgId]/actions";
import { OrgImageUpload } from "./org-image-upload";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

// ───────── Needs ─────────

export type NeedValues = {
  id?: string; title: string; description: string | null; category: string; urgency: string; status: string; quantityNeeded: number | null;
  unit: string | null; deadline: string; instructions: string | null; dropoffLocation: string | null; isWishList: boolean;
};

export function NeedForm({ orgId, need }: { orgId: string; need: NeedValues }) {
  return (
    <ActionForm action={saveNeedAction} warnUnsaved className="space-y-6">
      <input type="hidden" name="orgId" value={orgId} />
      {need.id && <input type="hidden" name="needId" value={need.id} />}
      <Section title="What do you need?">
        <TextField name="title" label="Short title" required defaultValue={need.title} maxLength={140} placeholder="e.g. Canned vegetables for our Thanksgiving boxes" />
        <TextArea name="description" label="Details" defaultValue={htmlToText(need.description)} rows={5} maxLength={8000} help="Why you need it and how it helps. Plain text is fine." />
        <FormGrid>
          <SelectField name="category" label="Category" defaultValue={need.category} options={NEED_CATEGORIES.map((c) => ({ value: c, label: NEED_CATEGORY_LABEL[c] }))} />
          <SelectField name="urgency" label="How urgent?" defaultValue={need.urgency} options={NEED_URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))} />
          <TextField name="quantityNeeded" label="How many? (optional)" type="number" min={1} inputMode="numeric" defaultValue={need.quantityNeeded ?? ""} help="Leave blank if there's no set number." />
          <TextField name="unit" label="Unit (optional)" defaultValue={need.unit ?? ""} maxLength={40} placeholder="e.g. cans, coats, volunteers" />
          <TextField name="deadline" label="Needed by (optional)" type="date" defaultValue={need.deadline} />
          <SelectField name="status" label="Status" defaultValue={need.status} options={NEED_STATUSES.map((s) => ({ value: s, label: NEED_STATUS_LABEL[s] }))} help="Partly met and fulfilled update automatically when you confirm pledges." />
        </FormGrid>
        <Checkbox name="isWishList" label="Add to our wish list" defaultChecked={need.isWishList} help="Ongoing items you always welcome (shown in your wish list)." />
      </Section>
      <Section title="How to give" description="Tell people exactly where and how to drop things off.">
        <TextArea name="instructions" label="Instructions" defaultValue={need.instructions ?? ""} rows={3} maxLength={2000} placeholder="e.g. New items only, please. Drop off Mon–Thu, 9am–3pm." />
        <TextField name="dropoffLocation" label="Drop-off location" defaultValue={need.dropoffLocation ?? ""} maxLength={300} placeholder="e.g. 123 Main St, side door" />
      </Section>
      <Submit pendingText="Saving…" className="btn-primary min-h-12 w-full text-base sm:w-auto">{need.id ? "Save need" : "Post this need"}</Submit>
    </ActionForm>
  );
}

// ───────── Volunteer opportunities ─────────

export type OpportunityValues = {
  id?: string; title: string; description: string | null; startAt: string; endAt: string; isOngoing: boolean; locationName: string | null;
  address: string | null; city: string | null; minAge: number | null; ageNotes: string | null; spots: number | null; requirements: string | null;
  registrationOpen: boolean; externalSignupUrl: string | null; status: string;
};

export function OpportunityForm({ orgId, opp }: { orgId: string; opp: OpportunityValues }) {
  return (
    <ActionForm action={saveOpportunityAction} warnUnsaved className="space-y-6">
      <input type="hidden" name="orgId" value={orgId} />
      {opp.id && <input type="hidden" name="oppId" value={opp.id} />}
      <Section title="About the opportunity">
        <TextField name="title" label="Name" required defaultValue={opp.title} maxLength={140} placeholder="e.g. Saturday food pantry helpers" />
        <TextArea name="description" label="What will volunteers do?" defaultValue={htmlToText(opp.description)} rows={5} maxLength={8000} />
        <TextArea name="requirements" label="Requirements (optional)" defaultValue={opp.requirements ?? ""} rows={3} maxLength={2000} placeholder="e.g. Able to lift 25 lbs, closed-toe shoes, background check" />
      </Section>
      <Section title="When?">
        <Checkbox name="isOngoing" label="This is ongoing (no set date)" defaultChecked={opp.isOngoing} />
        <FormGrid>
          <TextField name="startAt" label="Starts" type="datetime-local" defaultValue={opp.startAt} />
          <TextField name="endAt" label="Ends (optional)" type="datetime-local" defaultValue={opp.endAt} />
        </FormGrid>
      </Section>
      <Section title="Where?">
        <TextField name="locationName" label="Place name" defaultValue={opp.locationName ?? ""} maxLength={160} />
        <FormGrid>
          <TextField name="address" label="Address" defaultValue={opp.address ?? ""} maxLength={200} />
          <CitySelect defaultValue={opp.city} />
        </FormGrid>
      </Section>
      <Section title="Who can sign up?">
        <FormGrid>
          <TextField name="spots" label="Number of spots (optional)" type="number" min={1} inputMode="numeric" defaultValue={opp.spots ?? ""} help="When full, new sign-ups join a waitlist." />
          <TextField name="minAge" label="Minimum age (optional)" type="number" min={1} max={99} inputMode="numeric" defaultValue={opp.minAge ?? ""} />
        </FormGrid>
        <TextField name="ageNotes" label="Age notes (optional)" defaultValue={opp.ageNotes ?? ""} maxLength={300} placeholder="e.g. Under 16 must come with an adult" />
        <Checkbox name="registrationOpen" label="Accept sign-ups on T-County Gives" defaultChecked={opp.registrationOpen} help="Turn off to stop new sign-ups." />
        <TextField name="externalSignupUrl" label="Or use your own sign-up page (optional)" defaultValue={opp.externalSignupUrl ?? ""} inputMode="url" placeholder="https://" help="If set, people are sent to this link instead of our form." />
        <SelectField name="status" label="Status" defaultValue={opp.status} options={OPPORTUNITY_STATUSES.map((s) => ({ value: s, label: OPPORTUNITY_STATUS_LABEL[s] }))} />
      </Section>
      <Submit pendingText="Saving…" className="btn-primary min-h-12 w-full text-base sm:w-auto">{opp.id ? "Save opportunity" : "Publish opportunity"}</Submit>
    </ActionForm>
  );
}

// ───────── Events ─────────

export function OrgEventForm({ orgId, categories, defaults, needsApproval }: {
  orgId: string; categories: { id: string; name: string }[]; defaults: { locationName: string; address: string; city: string | null }; needsApproval: boolean;
}) {
  return (
    <ActionForm action={saveOrgEventAction} className="space-y-6">
      <input type="hidden" name="orgId" value={orgId} />
      <Section title="What's happening?">
        <TextField name="title" label="Event name" required maxLength={150} placeholder="e.g. Fall Pancake Breakfast" />
        <TextArea name="description" label="Description" rows={5} maxLength={8000} />
        {categories.length > 0 && <SelectField name="categoryId" label="Type of event" placeholder="Choose one…" options={categories.map((c) => ({ value: c.id, label: c.name }))} />}
        <OrgImageUpload name="imageUrl" orgId={orgId} label="Photo or flyer (optional)" />
      </Section>
      <Section title="When?">
        <FormGrid>
          <TextField name="startAt" label="Starts" type="datetime-local" required />
          <TextField name="endAt" label="Ends (optional)" type="datetime-local" />
        </FormGrid>
        <Checkbox name="allDay" label="All-day event" />
      </Section>
      <Section title="Where?" description="Leave blank to use your organization's address.">
        <TextField name="locationName" label="Place name" maxLength={160} placeholder={defaults.locationName} />
        <FormGrid>
          <TextField name="address" label="Address" maxLength={200} placeholder={defaults.address} />
          <CitySelect defaultValue={defaults.city} />
        </FormGrid>
      </Section>
      <Section title="Cost">
        <Checkbox name="isFree" label="Free to attend" defaultChecked />
        <FormGrid>
          <TextField name="price" label="Price (if not free)" maxLength={80} />
          <TextField name="ticketUrl" label="Tickets or more info link" inputMode="url" />
        </FormGrid>
      </Section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Submit pendingText="Sending…" className="btn-primary min-h-12 w-full text-base sm:w-auto">{needsApproval ? "Submit for review" : "Publish event"}</Submit>
        {needsApproval && <p className="text-sm text-slate-500">Our team reviews events before they appear on the calendar.</p>}
      </div>
    </ActionForm>
  );
}

// ───────── Updates ─────────

export function OrgUpdateForm({ orgId, update }: { orgId: string; update?: { id: string; title: string; body: string; imageUrl: string | null; status: string } }) {
  return (
    <ActionForm action={saveOrgUpdateAction} resetOnSuccess={!update} className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      {update && <input type="hidden" name="updateId" value={update.id} />}
      <TextField name="title" label="Headline" required maxLength={140} defaultValue={update?.title} placeholder="e.g. Thank you for 500 coats!" />
      <TextArea name="body" label="Your update" required rows={5} maxLength={4000} defaultValue={htmlToText(update?.body)} />
      <OrgImageUpload name="imageUrl" orgId={orgId} label="Photo (optional)" defaultValue={update?.imageUrl} />
      <Checkbox name="draft" label="Save as a draft (don't show it yet)" defaultChecked={update?.status === "DRAFT"} />
      <Submit pendingText="Posting…" className="btn-primary w-full sm:w-auto">{update ? "Save update" : "Post update"}</Submit>
    </ActionForm>
  );
}

// ───────── Team ─────────

export function AddMemberForm({ orgId, canAddOwner }: { orgId: string; canAddOwner: boolean }) {
  const roles = ORG_ROLES.filter((r) => canAddOwner || r !== "OWNER");
  return (
    <ActionForm action={addMemberAction} resetOnSuccess className="space-y-4">
      <input type="hidden" name="orgId" value={orgId} />
      <TextField name="email" type="email" label="Email address" required placeholder="name@example.com" autoComplete="off" />
      <SelectField name="role" label="Role" defaultValue="EDITOR" options={roles.map((r) => ({ value: r, label: `${ORG_ROLE_LABEL[r]} — ${ORG_ROLE_HELP[r]}` }))} />
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">We&apos;ll email them. If they don&apos;t have an account yet, one is created without a password — they set it with “Forgot password” on the sign-in page.</p>
      <Submit pendingText="Adding…">Add to team</Submit>
    </ActionForm>
  );
}
