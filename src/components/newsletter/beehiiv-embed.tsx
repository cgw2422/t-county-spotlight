import { cn } from "@/lib/utils";
import { isSlimEmbed, normalizeBeehiivEmbedUrl } from "@/lib/beehiiv/embed";

/**
 * beehiiv's official embedded subscribe form, as an iframe (the same markup
 * beehiiv's "Embed" code uses, without its optional resize script). Signups go
 * straight to beehiiv; nothing is stored here. The URL is re-validated on every
 * render, so only https://embeds.beehiiv.com/… or subscribe-forms.beehiiv.com/…
 * can ever be framed. `name` is the prose form, e.g. "the T County Connect newsletter".
 */
export function BeehiivEmbed({ url, name, eager = false, className }: { url: string; name: string; eager?: boolean; className?: string }) {
  const src = normalizeBeehiivEmbedUrl(url);
  if (!src) return null;
  const slim = isSlimEmbed(src);
  return (
    <iframe
      src={src}
      title={`Subscribe to ${name}`}
      data-testid="beehiiv-embed"
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="strict-origin-when-cross-origin"
      frameBorder={0}
      scrolling="no"
      className={cn("block w-full max-w-full rounded-xl border-0 bg-transparent", slim ? "h-[56px]" : "h-[340px] sm:h-[300px]", className)}
    />
  );
}
