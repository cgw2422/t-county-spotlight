import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNewsletterConfig, type NewsletterConfig } from "@/lib/newsletter/settings";
import { LEGACY_SIGNUP_HEADLINE, type SignupPlacement, type SignupSource } from "@/lib/newsletter/copy";
import { BuiltinNewsletterSignup } from "./builtin-signup";
import { NativeSignupForm } from "./native-signup";

type Props = {
  source: Exclude<SignupSource, "admin_invite">;
  /** card (homepage, /explore/, /newsletter/, account), compact (footer, token pages), inline (articles, events), hero (homepage hero aside). */
  variant?: "card" | "compact" | "inline" | "hero";
  tone?: "light" | "dark" | "green";
  /** Optional overrides (e.g. a homepage section title); default is the editable signup heading and supporting line. */
  title?: string | null;
  subtitle?: string | null;
  /** Wording that only fits the built-in double opt-in form (e.g. "Send a new confirmation link"); ignored in beehiiv mode. */
  builtinTitle?: string;
  builtinSubtitle?: string;
  /** beehiiv mode: utm_campaign sent to beehiiv (defaults from source + variant). */
  placement?: SignupPlacement;
  className?: string;
};

/** Whether any signup can be shown (beehiiv mode needs the server's beehiiv credentials; built-in always can). */
export function signupAvailable(c: Pick<NewsletterConfig, "isBeehiiv" | "beehiivConfigured">) {
  return !c.isBeehiiv || c.beehiivConfigured;
}

function placementFor(source: Props["source"], variant: NonNullable<Props["variant"]>): SignupPlacement {
  if (source === "homepage") return variant === "hero" ? "homepage_hero" : "homepage";
  if (source === "pwa") return "explore";
  if (source === "footer" || source === "article" || source === "event" || source === "account" || source === "newsletter_page") return source;
  return "newsletter_page";
}

/**
 * Every public newsletter signup goes through here. Provider "Built-in": the
 * double opt-in form (NewsletterSubscriber rows), unchanged. Provider "beehiiv":
 * our native form, submitted to beehiiv's API by our server (no local record).
 * Renders nothing in beehiiv mode while the server has no beehiiv credentials.
 */
export async function NewsletterSignup({ source, variant = "card", tone = "light", title: titleProp, subtitle: subtitleProp, builtinTitle, builtinSubtitle, placement, className }: Props) {
  const c = await getNewsletterConfig();
  if (!signupAvailable(c)) return null;
  const title = (!c.isBeehiiv && builtinTitle) || titleProp;
  const subtitle = (!c.isBeehiiv && builtinSubtitle) || subtitleProp;
  const headline = (title && title !== LEGACY_SIGNUP_HEADLINE ? title : "") || c.heading;
  const description = subtitle || c.tagline;

  if (c.isBeehiiv) {
    return (
      <NativeSignupForm
        placement={placement ?? placementFor(source, variant)}
        heading={headline}
        description={description}
        button={c.button}
        footnote={c.footnote}
        layout={variant === "card" ? "wide" : "stacked"}
        headingId={variant === "hero" ? "hero-newsletter-title" : undefined}
        className={cn(variant === "hero" && "mx-auto w-full max-w-md lg:mx-0", className)}
      />
    );
  }

  if (variant === "hero") {
    return (
      <section aria-labelledby="hero-newsletter-title" data-testid="hero-newsletter-card" data-provider={c.provider}
        className={cn("relative overflow-hidden rounded-2xl bg-navy-950/60 p-4 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl sm:p-6", className)}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hillside-500 via-hillside-500 to-sunset-500" />
        <p className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-sunset-400"><Mail className="h-3.5 w-3.5" aria-hidden /> Newsletter</p>
        <BuiltinNewsletterSignup source={source} variant="compact" tone="dark" headline={headline} description={description} name={c.navLabel} button={c.button} headingId="hero-newsletter-title" className="mt-2" />
      </section>
    );
  }

  return <BuiltinNewsletterSignup source={source} variant={variant} tone={tone} headline={headline} description={description} name={c.navLabel} button={c.button} className={className} />;
}
