"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, Italic, Heading2, Heading3, Heading4, List, ListOrdered, Quote, Link as LinkIcon, Unlink, ImagePlus, Video,
  Undo2, Redo2, Pilcrow, Minus, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PROSE_CLASSES } from "@/lib/prose";
import { MediaLibraryDialog } from "@/components/admin/media-picker";
import { Embed, Figure, toEmbedUrl } from "./extensions";

type Props = {
  /** Hidden input name that receives the HTML. */
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  onChange?: (html: string) => void;
  minHeight?: string;
  /** Compact toolbar for short fields (business description etc.). */
  compact?: boolean;
  label?: string;
  help?: string;
  /** Tailwind `top-*` class for the sticky toolbar. */
  stickyClass?: string;
};

function Btn({ onClick, active, disabled, label, children }: { onClick: () => void; active?: boolean; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-30", active && "bg-brand-50 text-brand-700")}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-slate-200" aria-hidden />;
}

export function RichTextEditor({ name, defaultValue, placeholder = "Start writing…", onChange, minHeight = "min-h-[320px]", compact, label, help, stickyClass = "top-16" }: Props) {
  const [html, setHtml] = useState(defaultValue ?? "");
  const [bar, setBar] = useState<null | "link" | "embed">(null);
  const [barValue, setBarValue] = useState("");
  const [barError, setBarError] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        strike: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      Figure,
      Embed,
    ],
    content: defaultValue || "",
    editorProps: {
      attributes: {
        class: cn(PROSE_CLASSES, "lg:prose-base focus:outline-none px-4 py-4 sm:px-6", minHeight),
        "aria-label": label ?? "Content editor",
      },
    },
    onUpdate: ({ editor }) => {
      const out = editor.isEmpty ? "" : editor.getHTML().replace(/(<p><\/p>)+$/, "");
      setHtml(out);
      onChangeRef.current?.(out);
    },
  });

  // Notify the surrounding form that content changed (dirty tracking).
  const lastHtml = useRef(html);
  useEffect(() => {
    if (lastHtml.current === html) return;
    lastHtml.current = html;
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [html]);

  const openBar = useCallback((kind: "link" | "embed", ed: Editor) => {
    setBarError(null);
    setBarValue(kind === "link" ? (ed.getAttributes("link").href ?? "") : "");
    setBar(kind);
  }, []);

  function applyBar() {
    if (!editor) return;
    const v = barValue.trim();
    if (bar === "link") {
      if (!v) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setBar(null); return; }
      if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(v)) { setBarError("Use a full URL (https://…), mailto:, tel: or a /path"); return; }
      const external = /^https?:\/\//i.test(v) && typeof window !== "undefined" && !v.includes(window.location.host);
      editor.chain().focus().extendMarkRange("link").setLink({ href: v, target: external ? "_blank" : null }).run();
    } else if (bar === "embed") {
      const src = toEmbedUrl(v);
      if (!src) { setBarError("Paste a YouTube or Vimeo link"); return; }
      editor.chain().focus().insertContent({ type: "embed", attrs: { src } }).run();
    }
    setBar(null);
  }

  const figureActive = editor?.isActive("figure");
  const figAttrs = figureActive ? editor!.getAttributes("figure") : null;

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <input ref={hidden} type="hidden" name={name} value={html} />
      <div className="rounded-xl border border-slate-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
        <div className={cn("sticky z-10 flex items-center gap-0.5 overflow-x-auto rounded-t-xl border-b border-slate-200 bg-slate-50/95 px-1.5 py-1 scrollbar-none", stickyClass)} role="toolbar" aria-label="Formatting">
          {editor && (
            <>
              <Btn label="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow className="h-4 w-4" /></Btn>
              <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Btn>
              <Btn label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Btn>
              {!compact && <Btn label="Heading 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}><Heading4 className="h-4 w-4" /></Btn>}
              <Sep />
              <Btn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
              <Btn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
              <Btn label="Link" active={editor.isActive("link")} onClick={() => openBar("link", editor)}><LinkIcon className="h-4 w-4" /></Btn>
              {editor.isActive("link") && <Btn label="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}><Unlink className="h-4 w-4" /></Btn>}
              <Sep />
              <Btn label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
              <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
              <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
              {!compact && <Btn label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Btn>}
              <Sep />
              <Btn label="Insert image" onClick={() => setMediaOpen(true)}><ImagePlus className="h-4 w-4" /></Btn>
              {!compact && <Btn label="Embed YouTube or Vimeo video" onClick={() => openBar("embed", editor)}><Video className="h-4 w-4" /></Btn>}
              <Sep />
              <Btn label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
              <Btn label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
            </>
          )}
        </div>
        {bar && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <input
              autoFocus
              className="input min-w-0 flex-1"
              placeholder={bar === "link" ? "https://example.com" : "https://www.youtube.com/watch?v=…"}
              value={barValue}
              aria-label={bar === "link" ? "Link URL" : "Video URL"}
              onChange={(e) => { e.stopPropagation(); setBarValue(e.target.value); }}
              onInput={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyBar(); } if (e.key === "Escape") setBar(null); }}
            />
            <button type="button" className="btn-primary btn-sm" onClick={applyBar}><Check className="h-4 w-4" /> {bar === "link" ? "Apply" : "Embed"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setBar(null)} aria-label="Cancel"><X className="h-4 w-4" /></button>
            {barError && <p className="w-full text-xs font-medium text-red-600">{barError}</p>}
          </div>
        )}
        {figAttrs && editor && (
          <div className="grid gap-2 border-b border-slate-200 bg-brand-50/50 px-3 py-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Alt text
              <input className="input mt-1" value={figAttrs.alt ?? ""} placeholder="Describe the image"
                onInput={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); editor.chain().updateAttributes("figure", { alt: e.target.value }).run(); }} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Caption
              <input className="input mt-1" value={figAttrs.caption ?? ""} placeholder="Optional caption"
                onInput={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); editor.chain().updateAttributes("figure", { caption: e.target.value }).run(); }} />
            </label>
          </div>
        )}
        <div className="relative">
          {!editor && <div className={cn("px-6 py-4 text-slate-400", minHeight)}>Loading editor…</div>}
          {editor?.isEmpty && <p className="pointer-events-none absolute left-4 top-4 text-slate-400 sm:left-6" aria-hidden>{placeholder}</p>}
          <EditorContent editor={editor} />
        </div>
      </div>
      {help && <p className="help">{help}</p>}
      <MediaLibraryDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        title="Insert image"
        onSelect={(m) => editor?.chain().focus().insertContent({ type: "figure", attrs: { src: m.url, alt: m.alt ?? "", caption: m.caption ?? "", width: m.width, height: m.height } }).run()}
      />
    </div>
  );
}
