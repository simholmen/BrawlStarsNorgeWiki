"use client";

// "Navn" / "Nyeste først" switch for editor lists (Ranked-profiler, the Topplister add box).

export type SortOrder = "name" | "newest";

const collator = new Intl.Collator("nb", { sensitivity: "base" });

/** Sorted copy: by name (A-Å), or by when it was added, newest first. */
export function sortByOrder<T extends { name: string; created_at: string }>(list: T[], order: SortOrder): T[] {
  return [...list].sort((a, b) =>
    order === "newest" ? b.created_at.localeCompare(a.created_at) : collator.compare(a.name, b.name),
  );
}

export default function SortToggle({ value, onChange }: { value: SortOrder; onChange: (v: SortOrder) => void }) {
  return (
    <div className="sort-toggle" role="group" aria-label="Sorter">
      {(
        [
          ["name", "Navn"],
          ["newest", "Nyeste først"],
        ] as Array<[SortOrder, string]>
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={value === v ? "active" : ""}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
