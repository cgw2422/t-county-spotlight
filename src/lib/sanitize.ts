import sanitizeHtml from "sanitize-html";

const IFRAME_HOSTS = [
  "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com",
  "www.facebook.com", "www.google.com", "maps.google.com", "open.spotify.com", "w.soundcloud.com",
];

/**
 * Sanitizes rich-text HTML for public display. The allowlist is intentionally
 * broad enough to keep imported WordPress formatting (blocks, figures,
 * galleries, tables, embeds) intact while removing scripts and handlers.
 */
export function sanitizeRichText(html: string | null | undefined) {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del", "ins",
      "sub", "sup", "small", "mark", "a", "ul", "ol", "li", "blockquote", "cite", "q", "code", "pre",
      "figure", "figcaption", "img", "picture", "source", "video", "audio", "iframe",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "div", "span", "section", "dl", "dt", "dd", "abbr", "address", "time",
    ],
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "lang", "dir", "aria-label", "aria-hidden", "role"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
      source: ["src", "srcset", "type", "media", "sizes"],
      video: ["src", "controls", "poster", "width", "height", "preload", "muted", "loop", "playsinline"],
      audio: ["src", "controls", "preload"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title", "loading"],
      td: ["colspan", "rowspan", "align"], th: ["colspan", "rowspan", "align", "scope"],
      ol: ["start", "reversed", "type"], time: ["datetime"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
        "font-weight": [/^\d+$|^bold$/],
        "font-style": [/^italic$/],
        "text-decoration": [/^underline|line-through$/],
        width: [/^\d+(px|%)?$/], height: [/^\d+(px|%)?$/],
        "max-width": [/^\d+(px|%)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedIframeHostnames: IFRAME_HOSTS,
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || "";
        if (/^https?:\/\//i.test(href) && attribs.target === "_blank") {
          attribs.rel = "noopener noreferrer";
        }
        return { tagName, attribs };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { loading: "lazy", decoding: "async", ...attribs } }),
    },
  });
}

/** Plain text only (for titles, names, short fields). */
export function sanitizePlain(input: string | null | undefined, max = 500) {
  if (!input) return "";
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max);
}
