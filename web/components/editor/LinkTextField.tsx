"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { filterEntities, findLinkQuery, insertLink, type WikiEntity } from "@/lib/linkPicker";

// A text input or textarea where typing "[[" opens a list of people/clubs; picking one inserts
// [[person:slug|Name]] (rendered as a normal link on the page).

type Props = {
  value: string;
  onChange: (value: string) => void;
  entities: WikiEntity[];
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  id?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  onPaste?: (e: ClipboardEvent<HTMLElement>) => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
  onDragOver?: (e: DragEvent<HTMLElement>) => void;
};

export type LinkTextFieldHandle = {
  /** Insert text at the caret (or replace the selection) and focus the field. */
  insert: (before: string, after?: string, placeholder?: string) => void;
  /** Prefix the current line(s) with a string (headings, lists). */
  prefixLines: (prefix: string) => void;
  focus: () => void;
};

type Picker = { start: number; query: string; index: number };

const LinkTextField = forwardRef<LinkTextFieldHandle, Props>(function LinkTextField(
  { value, onChange, entities, multiline = false, ...rest },
  ref,
) {
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const matches = picker ? filterEntities(entities, picker.query) : [];

  function setTextAndCaret(text: string, start: number, end = start) {
    onChange(text);
    requestAnimationFrame(() => {
      const el = fieldRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      refreshPicker(text, end);
    });
  }

  function refreshPicker(text: string, caret: number) {
    const q = findLinkQuery(text, caret);
    setPicker(q ? { ...q, index: 0 } : null);
  }

  useImperativeHandle(ref, () => ({
    insert(before, after = "", placeholder = "") {
      const el = fieldRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const selected = value.slice(start, end) || placeholder;
      const text = value.slice(0, start) + before + selected + after + value.slice(end);
      const selStart = start + before.length;
      setTextAndCaret(text, selStart, selStart + selected.length);
    },
    prefixLines(prefix) {
      const el = fieldRef.current;
      const start = el?.selectionStart ?? 0;
      const end = el?.selectionEnd ?? 0;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const block = value.slice(lineStart, end);
      const prefixed = block
        .split("\n")
        .map((line) => (line.startsWith(prefix) ? line : prefix + line))
        .join("\n");
      const text = value.slice(0, lineStart) + prefixed + value.slice(end);
      setTextAndCaret(text, lineStart + prefixed.length);
    },
    focus() {
      fieldRef.current?.focus();
    },
  }));

  function choose(entity: WikiEntity) {
    const el = fieldRef.current;
    if (!picker || !el) return;
    const caret = el.selectionStart ?? value.length;
    const r = insertLink(value, picker.start, caret, entity);
    setPicker(null);
    setTextAndCaret(r.text, r.caret);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!picker || matches.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setPicker({ ...picker, index: (picker.index + step + matches.length) % matches.length });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(matches[picker.index] ?? matches[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPicker(null);
    }
  }

  const common = {
    ...rest,
    ref: fieldRef,
    value,
    onKeyDown,
    onChange: (e: { target: { value: string; selectionStart: number | null } }) => {
      onChange(e.target.value);
      refreshPicker(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    onClick: () => refreshPicker(value, fieldRef.current?.selectionStart ?? 0),
    onBlur: () => setTimeout(() => setPicker(null), 150),
    autoComplete: "off",
  };

  return (
    <span className="link-field">
      {multiline ? <textarea {...common} /> : <input type="text" {...common} />}
      {picker && matches.length > 0 && (
        <ul className="link-picker" role="listbox">
          {matches.map((m, i) => (
            <li
              key={`${m.kind}:${m.slug}`}
              role="option"
              aria-selected={i === picker.index}
              className={i === picker.index ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(m);
              }}
            >
              {m.name} <span className="link-picker-kind">{m.kind === "person" ? "person" : "klubb"}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
});

export default LinkTextField;
