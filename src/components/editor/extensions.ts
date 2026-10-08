import { Node, mergeAttributes } from "@tiptap/core";

/** Image with alt text and optional caption, serialized as <figure><img><figcaption>. */
export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const img = node.querySelector("img");
          if (!img) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") ?? "",
            caption: node.querySelector("figcaption")?.textContent?.trim() ?? "",
            width: img.getAttribute("width"),
            height: img.getAttribute("height"),
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const img = el as HTMLElement;
          return { src: img.getAttribute("src"), alt: img.getAttribute("alt") ?? "", width: img.getAttribute("width"), height: img.getAttribute("height") };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption, width, height } = HTMLAttributes as Record<string, string | null>;
    const img = ["img", mergeAttributes({ src, alt: alt ?? "" }, width ? { width } : {}, height ? { height } : {})];
    return caption ? ["figure", {}, img, ["figcaption", {}, caption]] : ["figure", {}, img];
  },
});

const EMBED_HOSTS = /^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com)\//;

/** Converts a YouTube / Vimeo watch URL to a safe embed URL, or null. */
export function toEmbedUrl(input: string): string | null {
  const url = input.trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

/** YouTube / Vimeo iframe embed (only allowlisted hosts). */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "iframe[src]",
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute("src") ?? "";
          return EMBED_HOSTS.test(src) ? { src } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string;
    return [
      "figure",
      { class: "wp-block-embed is-type-video" },
      [
        "div",
        { class: "wp-block-embed__wrapper" },
        [
          "iframe",
          {
            src,
            width: "560",
            height: "315",
            title: "Embedded video",
            frameborder: "0",
            loading: "lazy",
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowfullscreen: "true",
          },
        ],
      ],
    ];
  },
});
