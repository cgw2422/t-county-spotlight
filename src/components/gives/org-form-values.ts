import type { Organization } from "@/generated/prisma/client";
import type { OrgFormValues } from "./org-profile-form";

/** Picks the serializable fields the profile form needs. */
export function toOrgFormValues(o: Organization): OrgFormValues {
  return {
    id: o.id, name: o.name, kind: o.kind, orgType: o.orgType, tagline: o.tagline, mission: o.mission, description: o.description, impact: o.impact,
    logoUrl: o.logoUrl, coverUrl: o.coverUrl, email: o.email, emailPublic: o.emailPublic, phone: o.phone, website: o.website, socials: o.socials,
    address: o.address, city: o.city, zip: o.zip, serviceArea: o.serviceArea, donationUrl: o.donationUrl, wishlistUrl: o.wishlistUrl, ein: o.ein,
    denomination: o.denomination, leadership: o.leadership, serviceTimes: o.serviceTimes, ministries: o.ministries, livestreamUrl: o.livestreamUrl,
    accessibility: o.accessibility, planYourVisit: o.planYourVisit,
  };
}
