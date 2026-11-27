"use client";

import type { SortOrder } from "@/lib/playerDirectory";

// "Navn" / "Nyeste først" switch for the player list (components/players/PlayerManager.tsx).

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
