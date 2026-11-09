"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, RotateCcw, Undo2 } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Card } from "@/components/admin/page-header";
import { MediaField } from "@/components/admin/media-picker";
import { HERO_DEFAULTS, HERO_IMAGE_HELP, type HeroAppearance } from "@/components/home/hero-background";
import { discardHeroDraftAction, restoreDefaultHeroAction, saveHeroAppearanceAction } from "./actions";
import { FocusPicker } from "./focus-picker";
import { PreviewFrames } from "./preview-frames";

type Look = {
  imageUrl: string | null; imageAlt: string; mobileImageUrl: string | null;
  desktopFocusX: number; desktopFocusY: number; mobileFocusX: number; mobileFocusY: number; overlay: number;
};
type Status = {
  published: { at: string | null; by: string | null; hasImage: boolean } | null;
  draft: { at: string; by: string | null } | null;
  hasUnpublishedChanges: boolean;
  isLegacy: boolean;
};

export function AppearanceEditor({ initial, status }: { initial: Look; status: Status }) {
  const [look, setLook] = useState<Look>(initial);
  const [showAside, setShowAside] = useState(false);
  const patch = (p: Partial<Look>) => setLook((l) => ({ ...l, ...p }));
  const edited = useMemo(() => (Object.keys(initial) as (keyof Look)[]).some((k) => initial[k] !== look[k]), [initial, look]);
  const appearance: HeroAppearance = look;
  const mobileSrc = look.mobileImageUrl || look.imageUrl;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="min-w-0 space-y-6">
        <StatusLine status={status} edited={edited} />

        <ActionForm action={saveHeroAppearanceAction} warnUnsaved className="space-y-6">
          {(["imageUrl", "imageAlt", "mobileImageUrl", "desktopFocusX", "desktopFocusY", "mobileFocusX", "mobileFocusY", "overlay"] as const).map((k) =>
            k === "imageAlt" ? null : <input key={k} type="hidden" name={k} value={look[k] ?? ""} />,
          )}

          <Card title="Background image" description="Upload a new photo or choose one from the media library.">
            <div className="space-y-5">
              <MediaField name="_heroImage" label="Desktop image" defaultValue={initial.imageUrl} aspect="aspect-[2/1]" help={HERO_IMAGE_HELP.desktop} onChange={(url) => patch({ imageUrl: url || null, ...(url ? {} : { mobileImageUrl: null }) })} />
              {look.imageUrl ? (
                <>
                  <div>
                    <label className="label" htmlFor="hero-alt">Alt text <span className="font-normal text-slate-500">(optional)</span></label>
                    <input id="hero-alt" name="imageAlt" className="input" maxLength={300} value={look.imageAlt} onChange={(e) => patch({ imageAlt: e.target.value })} placeholder="Leave blank — the photo is decorative" />
                    <p className="help">Background photos are usually decorative, so screen readers skip them. Only describe it if the photo carries meaning.</p>
                  </div>
                  <MediaField name="_heroMobileImage" label="Mobile image (optional)" defaultValue={look.mobileImageUrl} aspect="aspect-[4/5] max-w-56" help={HERO_IMAGE_HELP.mobile} onChange={(url) => patch({ mobileImageUrl: url || null })} />
                </>
              ) : (
                <input type="hidden" name="imageAlt" value="" />
              )}
            </div>
          </Card>

          {look.imageUrl && (
            <Card title="Focal points" description="Pick the part of the photo that must stay visible when the hero is cropped.">
              <div className="space-y-4">
                <FocusPicker id="focus-desktop" label="Desktop focal point" help="Used on screens 1024px and wider." imageUrl={look.imageUrl} x={look.desktopFocusX} y={look.desktopFocusY} onChange={(x, y) => patch({ desktopFocusX: x, desktopFocusY: y })} />
                {mobileSrc && <FocusPicker id="focus-mobile" label="Mobile focal point" help={look.mobileImageUrl ? "Applies to the mobile image on phones and tablets." : "Phones and tablets show a tall crop of the desktop image — choose what stays in view."} imageUrl={mobileSrc} x={look.mobileFocusX} y={look.mobileFocusY} onChange={(x, y) => patch({ mobileFocusX: x, mobileFocusY: y })} />}
              </div>
            </Card>
          )}

          {look.imageUrl && (
            <Card title="Overlay">
              <label className="block text-sm text-slate-700" htmlFor="hero-overlay">
                <span className="flex justify-between font-medium"><span>Navy overlay strength</span><span className="tabular-nums text-slate-500">{look.overlay}%</span></span>
              </label>
              <input id="hero-overlay" type="range" min={0} max={100} value={look.overlay} onChange={(e) => patch({ overlay: Number(e.target.value) })} className="mt-2 w-full accent-brand-600" />
              <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Photo shows through</span><span>Deep navy</span></div>
              <p className="help mt-2">A soft left-to-right shade is always added so the headline stays readable. Around {HERO_DEFAULTS.overlay}% works for most photos; go higher for bright or busy images.</p>
              {look.overlay !== HERO_DEFAULTS.overlay && <button type="button" onClick={() => patch({ overlay: HERO_DEFAULTS.overlay })} className="mt-1 min-h-9 text-sm font-medium text-brand-700 hover:underline">Reset to {HERO_DEFAULTS.overlay}%</button>}
            </Card>
          )}

          {!look.imageUrl && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No image selected — the homepage uses the default T County Connect gradient.</p>}

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <Submit name="intent" value="draft" className="btn-secondary" pendingText="Saving…">Save draft</Submit>
            <Submit name="intent" value="publish" className="btn-primary" pendingText="Publishing…">Publish</Submit>
            <DirtyIndicator />
          </div>
        </ActionForm>

        <Card title="Other actions">
          <div className="flex flex-wrap gap-2">
            <ActionButton
              action={discardHeroDraftAction}
              className="btn-secondary"
              confirm={{ title: "Discard the draft?", body: "Your unpublished changes are thrown away and the editor goes back to what's live on the homepage.", confirmLabel: "Discard draft" }}
            >
              <Undo2 className="h-4 w-4" /> Discard draft (revert to published)
            </ActionButton>
            <ActionButton
              action={restoreDefaultHeroAction}
              className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
              confirm={{ title: "Restore the default gradient?", body: "This removes the background photo from the live homepage right away and shows the standard T County Connect gradient. The photo stays in the media library.", confirmLabel: "Restore default", danger: true }}
            >
              <RotateCcw className="h-4 w-4" /> Restore default gradient
            </ActionButton>
          </div>
        </Card>
      </div>

      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <Card
          title="Live preview"
          description="The real homepage hero with your current (unsaved) settings."
          actions={<label className="flex min-h-9 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showAside} onChange={(e) => setShowAside(e.target.checked)} className="h-4 w-4 accent-brand-600" /> With Community Pulse card</label>}
        >
          <PreviewFrames appearance={appearance} showAside={showAside} />
        </Card>
      </div>
    </div>
  );
}

function StatusLine({ status, edited }: { status: Status; edited: boolean }) {
  const p = status.published;
  return (
    <div className="card space-y-1.5 p-4 text-sm" role="status" aria-live="polite" data-testid="hero-status">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        <span className="font-semibold text-slate-900">Live:</span>
        <span className="text-slate-700">
          {p?.hasImage ? "Background photo" : "Default gradient"}
          {p?.at ? ` · published ${p.at}${p.by ? ` by ${p.by}` : ""}` : status.isLegacy ? " · set in the previous homepage settings" : ""}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CircleDot className={status.hasUnpublishedChanges ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-slate-400"} aria-hidden />
        <span className="font-semibold text-slate-900">Draft:</span>
        <span className="text-slate-700">{status.draft ? `saved ${status.draft.at}${status.draft.by ? ` by ${status.draft.by}` : ""}` : "none yet"}</span>
        {status.hasUnpublishedChanges ? <span className="badge-amber">Unpublished changes</span> : <span className="badge-gray">Same as live</span>}
        {edited && <span className="badge-blue">Unsaved edits</span>}
      </p>
    </div>
  );
}
