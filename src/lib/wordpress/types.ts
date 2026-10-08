/**
 * Normalized intermediate format shared by the REST client and the WXR parser.
 * The importer only ever sees this shape, so both sources behave identically.
 */

export type WpTerm = {
  id: number;
  taxonomy: string; // category | post_tag | business_category | ...
  name: string; // decoded plain text
  slug: string;
  description?: string;
  parent?: number;
  link?: string; // absolute archive URL when known
  count?: number;
};

export type WpAuthor = {
  id: number;
  name: string;
  slug?: string;
  email?: string;
  link?: string;
};

export type WpMedia = {
  id: number;
  url: string; // full-size source_url
  alt?: string;
  caption?: string; // HTML
  title?: string;
  mimeType?: string;
  /** Every known URL of this file (sizes, original_image, the -scaled version). */
  variants: string[];
  parentId?: number;
};

export type WpSeo = {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
};

export type WpItem = {
  id: number;
  type: string; // post | page | business | <custom>
  status: string; // publish | future | draft | pending | private | auto-draft | inherit
  title: string; // decoded plain text
  slug: string;
  link?: string; // absolute permalink
  content: string; // HTML as WordPress renders it (REST) or raw post_content (WXR)
  contentIsRaw?: boolean; // true for WXR (no wpautop / shortcodes expanded)
  excerpt?: string;
  dateGmt?: string; // ISO
  modifiedGmt?: string; // ISO
  authorId?: number;
  authorName?: string;
  featuredMediaId?: number;
  featuredImageUrl?: string;
  /** taxonomy → term ids */
  terms: Record<string, number[]>;
  /** ACF fields, registered meta, postmeta and unknown REST fields (raw). */
  meta: Record<string, unknown>;
  seo?: WpSeo;
  parentId?: number;
  menuOrder?: number;
};

export type WpTypeInfo = {
  name: string;
  label?: string;
  restBase?: string;
  restNamespace?: string;
  hierarchical?: boolean;
  taxonomies?: string[];
  count?: number;
};

export type WpTaxonomyInfo = {
  name: string;
  label?: string;
  restBase?: string;
  restNamespace?: string;
  types: string[];
  hierarchical?: boolean;
};

export type WpMenu = {
  id?: number | string;
  name: string;
  slug?: string;
  locations?: string[];
  items: { id?: number | string; title: string; url: string; parent?: number | string; order?: number }[];
};

export type EndpointResult = {
  endpoint: string;
  status: number | "error";
  note?: string;
};

export type WpSnapshot = {
  source: "rest" | "wxr";
  baseUrl: string;
  site: {
    name?: string;
    description?: string;
    url?: string;
    logoId?: number;
    logoUrl?: string;
    iconId?: number;
    iconUrl?: string;
    namespaces?: string[];
  };
  authenticated: boolean;
  types: WpTypeInfo[];
  taxonomies: WpTaxonomyInfo[];
  terms: WpTerm[];
  authors: WpAuthor[];
  media: WpMedia[];
  items: WpItem[];
  menus: WpMenu[];
  endpoints: EndpointResult[];
  /** Endpoints answering 401/403 — data that needs an Application Password. */
  requiresCredentials: string[];
  warnings: string[];
  /** Counts the source reports (X-WP-Total) per post type / taxonomy. */
  totals: Record<string, number>;
};

export type Logger = (msg: string) => void;
