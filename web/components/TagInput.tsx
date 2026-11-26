"use client";

// A Brawl Stars tag field: the "#" is always shown in front (not part of the text), letters turn
// into capitals as you type, and a "#" typed or pasted in is dropped. The value handed back is
// the bare tag ("2GY22JUR"); lib/rankedTag.ts normalizeTag and lib/fields.ts both accept that.

/** What the field keeps of what was typed: capitals, no "#", no spaces. */
export function cleanTagInput(raw: string): string {
  return raw.toUpperCase().replace(/[#\s]/g, "");
}

export default function TagInput({
  value,
  onChange,
  id,
  placeholder = "2GY22JUR",
  required,
  maxLength = 20,
}: {
  value: string;
  onChange: (bare: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <span className="tag-input">
      <span className="tag-input-hash" aria-hidden="true">
        #
      </span>
      <input
        id={id}
        type="text"
        value={cleanTagInput(value)}
        onChange={(e) => onChange(cleanTagInput(e.target.value))}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
    </span>
  );
}
