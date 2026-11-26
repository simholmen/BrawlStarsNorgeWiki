"use client";

import { useDeferredValue, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { supabaseEnv } from "@/lib/env";
import { checkImageFile, isUploadedImage, WIKI_IMAGE_ACCEPT } from "@/lib/uploads";
import type { WikiEntity } from "@/lib/linkPicker";
import LinkTextField, { type LinkTextFieldHandle } from "./LinkTextField";
import ImageInsertDialog from "./ImageInsertDialog";

// The body editor: Markdown in a textarea with a small toolbar, and a live preview rendered by
// the same code as the real page (lib/markdown.ts), so what you see is what gets published.
// Images can be added with the toolbar button, by pasting, or by dropping files on the text: each
// opens ImageInsertDialog (crop, size, placement, frame, caption), which uploads it to Supabase
// Storage and inserts a <figure> block (lib/imageLayout.ts).

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
  // Images waiting for the dialog, first one shown.
  const [queue, setQueue] = useState<Array<{ id: number; file: File }>>([]);
  const nextId = useRef(0);
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

  function addImages(files: File[]) {
    if (files.length === 0) return;
    setUploadError(null);
    // Wrong type / too big (before cropping) is reported right away instead of opening the dialog.
    // Large photos are fine: cropping scales them down before upload.
    const ok: File[] = [];
    for (const file of files) {
      const problem = checkImageFile({ type: file.type, size: 0 });
      if (problem) setUploadError(`${file.name}: ${problem}`);
      else ok.push(file);
    }
    setQueue((q) => [...q, ...ok.map((file) => ({ id: nextId.current++, file }))]);
  }

  const nextImage = () => setQueue((q) => q.slice(1));

  function onPaste(e: ClipboardEvent<HTMLElement>) {
    const files = imageFiles(e.clipboardData?.files);
    if (files.length === 0) return; // ordinary text paste
    e.preventDefault();
    addImages(files);
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    const files = imageFiles(e.dataTransfer?.files);
    if (files.length === 0) return;
    e.preventDefault();
    addImages(files);
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
            addImages(imageFiles(e.target.files));
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
          {uploadError && (
            <div className="md-upload-error" role="alert">
              {uploadError}
            </div>
          )}
          <div className="md-help">
            <code>## Overskrift</code> · <code>**fet**</code> · <code>- liste</code> · skriv{" "}
            <code>[[</code> for å lenke til en person eller klubb · lim inn eller dra inn bilder ·{" "}
            {value.length}/{maxLength}
          </div>
        </div>
        <div className="md-preview wiki-html" dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
      {queue.length > 0 && (
        <ImageInsertDialog
          key={queue[0].id}
          file={queue[0].file}
          remaining={queue.length - 1}
          onInsert={(markup) => {
            field.current?.insert(markup);
            nextImage();
          }}
          onCancel={nextImage}
        />
      )}
    </div>
  );
}
