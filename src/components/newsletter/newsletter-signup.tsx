import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNewsletterConfig, type NewsletterConfig } from "@/lib/newsletter/settings";
import { LEGACY_SIGNUP_HEADLINE, theName, type SignupSource } from "@/lib/newsletter/copy";
import { BuiltinNewsletterSignup } from "./builtin-signup";
import { BeehiivEmbed } from "./beehiiv-embed";

type Props = {
  source: Exclude<SignupSource, "admin_invite">;
  /** card (homepage, /explore/, /newsletter/, account), compact (footer, token pages), inline (articles, events), hero (homepage hero aside). */
  variant?: "card" | "compact" | "inline" | "hero";
  tone?: "light" | "dark" | "green";
  /** Optional overrides (e.g. a homepage section title); default is "Get <name>" and the editable supporting line. */
  title?: string | null;
  subtitle?: string | null;
  /** Wording that only fits the built-in double opt-in form (e.g. "Send a new confirmation link"); ignored in beehiiv mode. */
  builtinTitle?: string;
  builtinSubtitle?: string;
  /** Load the beehiiv iframe immediately (hero, /newsletter/); others lazy-load. */
  eager?: boolean;
  className?: string;
};

/** Whether any signup can be shown (beehiiv mode needs an embed URL; built-in always can). */
export function signupAvailable(c: Pick<NewsletterConfig, "isBeehiiv" | "beehiivEmbedUrl">) {
  return !c.isBeehiiv || !!c.beehiivEmbedUrl;
}

/**
 * Every public newsletter signup goes through here. Provider "Built-in": the
 * double opt-in form (NewsletterSubscriber rows). Provider "beehiiv": beehiiv's
 * embedded form, no local record. Renders nothing in beehiiv mode without an embed URL.
 */
export async function NewsletterSignup({ source, variant = "card", tone = "light", title: titleProp, subtitle: subtitleProp, builtinTitle, builtinSubtitle, eager, className }: Props) {
  const c = await getNewsletterConfig();
  if (!signupAvailable(c)) return null;
  const title = (!c.isBeehiiv && builtinTitle) || titleProp;
  const subtitle = (!c.isBeehiiv && builtinSubtitle) || subtitleProp;
  const headline = (title && title !== LEGACY_SIGNUP_HEADLINE ? title : "") || c.heading;
  const description = subtitle || c.tagline;
  const dark = tone === "dark" || tone === "green" || variant === "hero";

  if (variant === "hero") {
    return (
      <section aria-labelledby="hero-newsletter-title" data-testid="hero-newsletter-card" data-provider={c.provider}
        className={cn("relative overflow-hidden rounded-2xl bg-navy-950/60 p-4 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl sm:p-6", className)}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hillside-500 via-hillside-500 to-sunset-500" />
        <p className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-sunset-400"><Mail className="h-3.5 w-3.5" aria-hidden /> Newsletter</p>
        {c.isBeehiiv ? (
          <>
            <h2 id="hero-newsletter-title" className="mt-2 font-display text-xl font-bold leading-snug text-white">{headline}</h2>
            <p className="mt-1 text-sm text-white/80">{description}</p>
            <div className="mt-4 overflow-hidden rounded-xl bg-white"><BeehiivEmbed url={c.beehiivEmbedUrl} name={theName(c.name)} eager /></div>
          </>
        ) : (
          <BuiltinNewsletterSignup source={source} variant="compact" tone="dark" headline={headline} description={description} name={c.navLabel} button={c.button} headingId="hero-newsletter-title" className="mt-2" />
        )}
      </section>
    );
  }

  if (!c.isBeehiiv) {
    return <BuiltinNewsletterSignup source={source} variant={variant} tone={tone} headline={headline} description={description} name={c.navLabel} button={c.button} className={className} />;
  }

  const embed = <BeehiivEmbed url={c.beehiivEmbedUrl} name={theName(c.name)} eager={eager} />;
  if (variant === "compact") {
    return (
      <div className={cn(className)} data-provider="beehiiv">
        <h2 className={cn("font-display text-xl font-semibold", dark ? "text-white" : "text-navy-900")}>{headline}</h2>
        <p className={cn("mt-1 text-sm", tone === "green" ? "text-hillside-50" : dark ? "text-slate-300" : "text-slate-600")}>{description}</p>
        <div className={cn("mt-4 overflow-hidden rounded-xl", dark && "bg-white")}>{embed}</div>
      </div>
    );
  }
  if (variant === "inline") {
    return (
      <aside aria-label={headline} data-provider="beehiiv" className={cn("rounded-2xl border border-brand-100 bg-brand-50/60 p-5 sm:p-6", className)}>
        <h2 className="font-display text-xl font-semibold text-navy-900">{headline}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <div className="mt-4 overflow-hidden rounded-xl bg-white">{embed}</div>
      </aside>
    );
  }
  return (
    <div data-provider="beehiiv" className={cn("overflow-hidden rounded-3xl bg-cream ring-1 ring-amber-200/70", className)}>
      <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="eyebrow">{c.navLabel}</p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-navy-900 text-balance sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-slate-700 sm:text-lg">{description}</p>
        </div>
        <div className="min-w-0 overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">{embed}</div>
      </div>
    </div>
  );
}
