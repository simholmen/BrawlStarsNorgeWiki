"use client";

import { useDeferredValue, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { supabaseEnv } from "@/lib/env";
import { altFromFileName, isUploadedImage, WIKI_IMAGE_ACCEPT } from "@/lib/uploads";
import type { WikiEntity } from "@/lib/linkPicker";
import LinkTextField, { type LinkTextFieldHandle } from "./LinkTextField";
import { uploadImage } from "./uploadImage";

// The body editor: Markdown in a textarea with a small toolbar, and a live preview rendered by
// the same code as the real page (lib/markdown.ts), so what you see is what gets published.
// Images can be added with the toolbar button, by pasting, or by dropping files on the text:
// they're uploaded to Supabase Storage and inserted as ![alt](url).

type Mode = "both" | "write" | "preview";
type Tool = "bold" | "italic" | "heading" | "list" | "link" | "wiki" | "image";

const TOOLS: Array<[Tool, string, string]> = [
  ["bold", "F", "Fet"],
  ["italic", "K", "Kursiv"],
  ["heading", "H", "Overskrift"],
  ["list", "•", "Liste"],
  ["link", "🔗", "Lenke"],
  ["wiki", "[[ ]]", "Wiki-lenke (eller skriv [[)"],
  ["image", "🖼", "Bilde (eller lim inn / dra inn et bilde)"],
];

/**
 * Same images as the published page keeps: files under /images/ (the page also checks they
 * exist on disk, which the browser can't) and uploads in the wiki-images bucket.
 */
function previewKeepImage(src: string): boolean {
  return src.startsWith("/images/") || isUploadedImage(src, supabaseEnv().url);
}

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

export default function MarkdownEditor({
  value,
  onChange,
  entities,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  entities: WikiEntity[];
  maxLength: number;
}) {
  const field = useRef<LinkTextFieldHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("both");
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const deferred = useDeferredValue(value);
  const preview = useMemo(() => renderMarkdown(deferred, { keepImage: previewKeepImage }), [deferred]);

  function runTool(tool: Tool) {
    const f = field.current;
    if (!f) return;
    switch (tool) {
      case "bold": return f.insert("**", "**", "fet tekst");
      case "italic": return f.insert("*", "*", "kursiv tekst");
      case "heading": return f.prefixLines("## ");
      case "list": return f.prefixLines("- ");
      case "link": return f.insert("[", "](https://)", "tekst");
      case "wiki": return f.insert("[[");
      case "image": return fileInput.current?.click();
    }
  }

  async function addImages(files: File[]) {
    if (files.length === 0) return;
    setUploadError(null);
    setUploading((n) => n + files.length);
    // One at a time: each insert reads the text as it is after the previous one was inserted.
    for (const file of files) {
      const result = await uploadImage(file);
      setUploading((n) => n - 1);
      if (!result.ok) {
        setUploadError(`${file.name}: ${result.message}`);
        continue;
      }
      // Alt text is selected after inserting, so it can be typed over right away.
      field.current?.insert("![", `](${result.url})\n`, altFromFileName(file.name));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLElement>) {
    const files = imageFiles(e.clipboardData?.files);
    if (files.length === 0) return; // ordinary text paste
    e.preventDefault();
    void addImages(files);
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    const files = imageFiles(e.dataTransfer?.files);
    if (files.length === 0) return;
    e.preventDefault();
    void addImages(files);
  }

  return (
    <div className={`md-editor mode-${mode}`}>
      <div className="md-toolbar">
        {TOOLS.map(([tool, icon, title]) => (
          <button key={tool} type="button" title={title} aria-label={title} onClick={() => runTool(tool)}>
            {icon}
          </button>
        ))}
        <input
          ref={fileInput}
          type="file"
          accept={WIKI_IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void addImages(imageFiles(e.target.files));
            e.target.value = ""; // so picking the same file again still fires onChange
          }}
        />
        <span className="md-toolbar-spacer" />
        {(["write", "both", "preview"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {m === "write" ? "Skriv" : m === "both" ? "Begge" : "Forhåndsvis"}
          </button>
        ))}
      </div>
      <div className="md-panes">
        <div className="md-write">
          <LinkTextField
            ref={field}
            multiline
            rows={22}
            value={value}
            onChange={onChange}
            entities={entities}
            maxLength={maxLength}
            aria-label="Tekst (Markdown)"
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
          {uploading > 0 && (
            <div className="md-upload-status" role="status">
              Laster opp {uploading === 1 ? "bilde" : `${uploading} bilder`}…
            </div>
          )}
          {uploadError && (
            <div className="md-upload-error" role="alert">
              {uploadError}
            </div>
          )}
          <div className="md-help">
            <code>## Overskrift</code> · <code>**fet**</code> · <code>- liste</code> · skriv{" "}
            <code>[[</code> for å lenke til en person eller klubb · lim inn eller dra inn bilder (maks 5 MB) ·{" "}
            {value.length}/{maxLength}
          </div>
        </div>
        <div className="md-preview wiki-html" dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    </div>
  );
}
