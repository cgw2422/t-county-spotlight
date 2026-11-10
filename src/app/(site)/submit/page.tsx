import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, ChevronRight, Compass, HandHelping, HeartHandshake, Megaphone, ShieldCheck, Sparkles, Store, Tag, Users } from "lucide-react";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata } from "@/components/public/seo";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Share Something with T County",
    description: "Suggest an event, list a garage sale, share a new business opening, community update, local attraction or volunteer opportunity, add your business or register a nonprofit or church on T County Connect. Free, and reviewed by our local team.",
    path: "/submit/",
  });
}

const CARDS = [
  { href: "/events/submit/", title: "Suggest an event", text: "Festivals, concerts, classes, fundraisers, markets and more for the community calendar.", icon: CalendarPlus, color: "bg-hillside-50 text-hillside-700", cta: "Submit an event" },
  { href: "/garage-sales/submit/", title: "List a garage sale", text: "Garage, yard, estate and rummage sales. No account needed, and your address can stay private.", icon: Tag, color: "bg-orange-50 text-sunset-600", cta: "List a sale" },
  { href: "/submit/suggest/?kind=BUSINESS_OPENING", title: "Tell us about a new business opening", text: "A business coming soon, just opened, moving or expanding? Let us know and we'll verify it for New & Coming Soon.", icon: Sparkles, color: "bg-brand-50 text-navy-900", cta: "Share an opening" },
  { href: "/submit/suggest/?kind=COMMUNITY_UPDATE", title: "Share a community update", text: "Road work, a closure, a new park feature or a milestone neighbors should know about.", icon: Megaphone, color: "bg-orange-50 text-sunset-600", cta: "Share an update" },
  { href: "/submit/suggest/?kind=ATTRACTION", title: "Suggest a local attraction or thing to do", text: "A trail, park, museum or family outing in Tuscarawas County worth exploring.", icon: Compass, color: "bg-hillside-50 text-hillside-700", cta: "Suggest a place" },
  { href: "/submit/suggest/?kind=VOLUNTEER", title: "Share a volunteer opportunity", text: "Organizations can register for a free T County Gives page to post opportunities. Not registered? Suggest one here.", icon: Users, color: "bg-hillside-50 text-hillside-700", cta: "Share an opportunity" },
  { href: "/list-your-business/", title: "List your business", text: "Add your Tuscarawas County business to the free local directory.", icon: Store, color: "bg-brand-50 text-navy-900", cta: "Add your business" },
  { href: "/gives/register/", title: "Register a nonprofit or church", text: "Get a free T County Gives page to share needs, volunteer opportunities and events.", icon: HeartHandshake, color: "bg-hillside-50 text-hillside-700", cta: "Register your organization" },
  { href: "/gives/", title: "Share a community need", text: "Needs are posted by registered nonprofits, churches and community groups. Register your organization first, then post needs from its dashboard — or browse current needs to help.", icon: HandHelping, color: "bg-orange-50 text-sunset-600", cta: "See T County Gives" },
];

export default function SubmitHubPage() {
  return (
    <>
      <PageHeader eyebrow="Get involved" title="Share something with T County" subtitle="Help neighbors find what's happening. Everything here is free to share." crumbs={[{ label: "Share something" }]} />
      <div className="container-page py-8 sm:py-10">
        <p className="mb-6 flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-navy-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
          <span>Every submission is reviewed by our local team before it&apos;s published. We&apos;ll email you once it&apos;s live.</span>
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ href, title, text, icon: Icon, color, cta }) => (
            <li key={href}>
              <Link href={href} className="card card-hover flex h-full flex-col p-5">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color}`}><Icon className="h-6 w-6" aria-hidden /></span>
                <h2 className="mt-4 font-display text-lg font-semibold text-navy-900">{title}</h2>
                <p className="mt-1 flex-1 text-sm text-slate-600">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">{cta} <ChevronRight className="h-4 w-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
