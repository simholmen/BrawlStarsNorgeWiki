"use client";

import type { Fact } from "@/lib/types";
import type { WikiEntity } from "@/lib/linkPicker";
import { FACT_LABEL_MAX, FACT_VALUE_MAX, FACTS_MAX, LIST_MAX } from "@/lib/fields";
import LinkTextField from "./LinkTextField";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

function RowButtons({ index, length, onMove, onRemove }: {
  index: number;
  length: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <span className="row-buttons">
      <button type="button" title="Flytt opp" disabled={index === 0} onClick={() => onMove(index - 1)}>↑</button>
      <button type="button" title="Flytt ned" disabled={index === length - 1} onClick={() => onMove(index + 1)}>↓</button>
      <button type="button" title="Fjern" onClick={onRemove}>✕</button>
    </span>
  );
}

/** Extra infobox rows ("facts"): a title and a value; the value may contain [[links]]. */
export function FactsEditor({ facts, onChange, entities }: {
  facts: Fact[];
  onChange: (f: Fact[]) => void;
  entities: WikiEntity[];
}) {
  const set = (i: number, patch: Partial<Fact>) => onChange(facts.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="list-editor">
      {facts.map((fact, i) => (
        <div key={i} className="list-row facts-row">
          <input
            type="text"
            value={fact.label}
            maxLength={FACT_LABEL_MAX}
            placeholder="Tittel"
            aria-label={`Fakta ${i + 1} tittel`}
            onChange={(e) => set(i, { label: e.target.value })}
          />
          <LinkTextField
            value={fact.value}
            onChange={(v) => set(i, { value: v })}
            entities={entities}
            maxLength={FACT_VALUE_MAX}
            placeholder="Verdi (skriv [[ for lenke)"
            aria-label={`Fakta ${i + 1} verdi`}
          />
          <RowButtons
            index={i}
            length={facts.length}
            onMove={(to) => onChange(move(facts, i, to))}
            onRemove={() => onChange(facts.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {facts.length < FACTS_MAX && (
        <button type="button" className="list-add" onClick={() => onChange([...facts, { label: "", value: "" }])}>
          + Legg til rad
        </button>
      )}
    </div>
  );
}

/** A plain list of names (underklubber). */
export function StringListEditor({ items, onChange, placeholder }: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="list-editor">
      {items.map((item, i) => (
        <div key={i} className="list-row">
          <input
            type="text"
            value={item}
            maxLength={200}
            placeholder={placeholder}
            aria-label={`${placeholder} ${i + 1}`}
            onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <RowButtons
            index={i}
            length={items.length}
            onMove={(to) => onChange(move(items, i, to))}
            onRemove={() => onChange(items.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {items.length < LIST_MAX && (
        <button type="button" className="list-add" onClick={() => onChange([...items, ""])}>
          + Legg til
        </button>
      )}
    </div>
  );
}
