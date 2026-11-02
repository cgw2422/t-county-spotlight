"use client";
import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import { MediaField } from "@/components/admin/media-picker";
import { OrgImageUpload } from "@/components/gives/org-image-upload";
import { COVER_HELP } from "@/lib/cover";
import { CoverFocusControls, CoverFocusHidden } from "./cover-focus";

type Focus = { defaultValue?: string | null; focusX?: number | null; focusY?: number | null; label?: string };

function Focus({ url, focusX, focusY }: { url: string; focusX?: number | null; focusY?: number | null }) {
  // Remount when the photo changes so a new photo starts centered.
  return url ? <CoverFocusControls key={url} imageUrl={url} defaultX={url ? focusX : 50} defaultY={url ? focusY : 50} /> : <CoverFocusHidden x={50} y={50} />;
}

/** Cover photo field for the business owner dashboard. */
export function BusinessCoverField({ businessId, defaultValue, focusX, focusY, label = "Cover photo" }: Focus & { businessId: string }) {
  const [url, setUrl] = useState(defaultValue || "");
  const [initial] = useState(defaultValue || "");
  return (
    <div>
      <ImageUpload name="coverUrl" label={label} defaultValue={defaultValue} businessId={businessId} aspect="aspect-[16/5]" onChange={setUrl} help={COVER_HELP} />
      <Focus url={url} focusX={url === initial ? focusX : 50} focusY={url === initial ? focusY : 50} />
    </div>
  );
}

/** Cover photo field for admin forms (media library picker). */
export function AdminCoverField({ defaultValue, focusX, focusY, label = "Cover photo" }: Focus) {
  const [url, setUrl] = useState(defaultValue || "");
  const [initial] = useState(defaultValue || "");
  return (
    <div>
      <MediaField name="coverUrl" label={label} defaultValue={defaultValue} aspect="aspect-[16/5]" onChange={setUrl} help={COVER_HELP} />
      <Focus url={url} focusX={url === initial ? focusX : 50} focusY={url === initial ? focusY : 50} />
    </div>
  );
}

/** Cover photo field for nonprofit / church forms. */
export function OrgCoverField({ orgId, defaultValue, focusX, focusY, label = "Cover photo" }: Focus & { orgId: string }) {
  const [url, setUrl] = useState(defaultValue || "");
  const [initial] = useState(defaultValue || "");
  return (
    <div>
      <OrgImageUpload name="coverUrl" orgId={orgId} defaultValue={defaultValue} label={label} aspect="aspect-[16/5]" onChange={setUrl} help={COVER_HELP} />
      <Focus url={url} focusX={url === initial ? focusX : 50} focusY={url === initial ? focusY : 50} />
    </div>
  );
}
