"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { WikiEntity } from "@/lib/linkPicker";
import LinkTextField, { type LinkTextFieldHandle } from "./LinkTextField";

// The body editor: Markdown in a textarea with a small toolbar, and a live preview rendered by
// the same code as the real page (lib/markdown.ts), so what you see is what gets published.

type Mode = "both" | "write" | "preview";
type Tool = "bold" | "italic" | "heading" | "list" | "link" | "wiki";

const TOOLS: Array<[Tool, string, string]> = [
  ["bold", "F", "Fet"],
  ["italic", "K", "Kursiv"],
  ["heading", "H", "Overskrift"],
  ["list", "•", "Liste"],
  ["link", "🔗", "Lenke"],
  ["wiki", "[[ ]]", "Wiki-lenke (eller skriv [[)"],
];

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
  const [mode, setMode] = useState<Mode>("both");
  const deferred = useDeferredValue(value);
  const preview = useMemo(() => renderMarkdown(deferred), [deferred]);

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
    }
  }

  return (
    <div className={`md-editor mode-${mode}`}>
      <div className="md-toolbar">
        {TOOLS.map(([tool, icon, title]) => (
          <button key={tool} type="button" title={title} aria-label={title} onClick={() => runTool(tool)}>
            {icon}
          </button>
        ))}
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
          />
          <div className="md-help">
            <code>## Overskrift</code> · <code>**fet**</code> · <code>- liste</code> · skriv{" "}
            <code>[[</code> for å lenke til en person eller klubb · {value.length}/{maxLength}
          </div>
        </div>
        <div className="md-preview wiki-html" dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    </div>
  );
}
