// Which fields of a person/club can be edited, their labels and limits. Used by the edit form
// (client) and re-checked by the save actions (server). The database enforces the same limits
// (migration 014), so this is about giving a clear message before it gets that far.

import type { Fact } from "./types";

export type EntityKind = "person" | "club";

export const PROFILE_YEARS = [2024, 2025, 2026] as const;
export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"] as const;

type TextField = { key: string; label: string; max: number; required?: boolean; hint?: string };

/** Infobox text fields, in the order the page shows them. */
export const TEXT_FIELDS: Record<EntityKind, TextField[]> = {
  person: [
    { key: "name", label: "Navn", max: 200, required: true },
    { key: "subtitle", label: "Undertittel", max: 200, hint: "Vises etter navnet, f.eks. ekte fornavn" },
    { key: "hjemsted", label: "Hjemsted", max: 200 },
    { key: "born", label: "Født", max: 200 },
    { key: "favorittbrus", label: "Favorittbrus", max: 200 },
    { key: "favoritt_brawler", label: "Favoritt Brawler", max: 200 },
    { key: "quote", label: "Quote", max: 300 },
    { key: "fiende", label: "Ærkefiende", max: 200 },
    { key: "bsid", label: "Brawl Stars ID", max: 20, hint: "Uten #" },
  ],
  club: [
    { key: "name", label: "Navn", max: 200, required: true },
    { key: "aktiv", label: "Aktiv", max: 200 },
    { key: "stiftet", label: "Stiftet", max: 200 },
    { key: "leder", label: "Leder", max: 200 },
    { key: "medlemmer", label: "Medlemmer", max: 200 },
  ],
};

export const BODY_MAX = 50_000;
export const FACTS_MAX = 30;
export const FACT_LABEL_MAX = 100;
export const FACT_VALUE_MAX = 500;
export const LIST_MAX = 30;

/** Human labels for every field, for history and messages. */
export const FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries([...TEXT_FIELDS.person, ...TEXT_FIELDS.club].map((f) => [f.key, f.label])),
  facts: "Fakta",
  body_md: "Tekst",
  underklubber: "Underklubber",
  hidden_profile_years: "Skjulte profilbilder",
  image_ext: "Bildeformat",
  "*": "Side opprettet",
  "-": "Side slettet",
};

export type Changes = Record<string, unknown>;
export type Validated = { ok: true; values: Changes } | { ok: false; message: string };

const textKeys = (kind: EntityKind) => new Set(TEXT_FIELDS[kind].map((f) => f.key));

function allowedKeys(kind: EntityKind): Set<string> {
  const keys = textKeys(kind);
  keys.add("facts");
  keys.add("body_md");
  keys.add("image_ext");
  if (kind === "person") keys.add("hidden_profile_years");
  if (kind === "club") keys.add("underklubber");
  return keys;
}

/** Bsid like the .md files: uppercase, no leading '#'. */
function cleanBsid(v: string): string {
  return v.replace(/^#/, "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Validate and normalize the changed fields of one save. Unknown keys are rejected (so the
 * client can't touch slug/id/image_key through this path); text is trimmed, empty becomes null.
 */
export function validateChanges(kind: EntityKind, changes: Changes): Validated {
  const allowed = allowedKeys(kind);
  const specs = new Map(TEXT_FIELDS[kind].map((f) => [f.key, f]));
  const values: Changes = {};

  for (const [key, raw] of Object.entries(changes)) {
    if (!allowed.has(key)) return { ok: false, message: `Feltet «${key}» kan ikke endres.` };
    const label = FIELD_LABELS[key] ?? key;

    const spec = specs.get(key);
    if (spec) {
      if (raw !== null && typeof raw !== "string") return { ok: false, message: `Ugyldig verdi for ${label}.` };
      let text = (raw ?? "").trim();
      if (key === "bsid") text = cleanBsid(text);
      if (text.length > spec.max) return { ok: false, message: `${label} kan være maks ${spec.max} tegn.` };
      if (spec.required && !text) return { ok: false, message: `${label} kan ikke være tomt.` };
      if (key === "bsid" && text && !/^[0-9A-Z]{3,15}$/.test(text)) {
        return { ok: false, message: "Brawl Stars ID skal bare ha tall og bokstaver (uten #)." };
      }
      values[key] = text || null;
      continue;
    }

    switch (key) {
      case "body_md": {
        if (typeof raw !== "string") return { ok: false, message: "Ugyldig tekst." };
        if (raw.length > BODY_MAX) return { ok: false, message: `Teksten kan være maks ${BODY_MAX} tegn.` };
        values[key] = raw.replace(/\r\n/g, "\n");
        break;
      }
      case "facts": {
        if (!Array.isArray(raw) || raw.length > FACTS_MAX) {
          return { ok: false, message: `Fakta kan ha maks ${FACTS_MAX} rader.` };
        }
        const facts: Fact[] = [];
        for (const row of raw) {
          const label = typeof row?.label === "string" ? row.label.trim() : null;
          const value = typeof row?.value === "string" ? row.value.trim() : null;
          if (label === null || value === null) return { ok: false, message: "Ugyldig fakta-rad." };
          if (!label && !value) continue; // empty rows are dropped
          if (!label) return { ok: false, message: "Hver fakta-rad trenger en tittel." };
          if (label.length > FACT_LABEL_MAX || value.length > FACT_VALUE_MAX) {
            return { ok: false, message: `Fakta: tittel maks ${FACT_LABEL_MAX}, verdi maks ${FACT_VALUE_MAX} tegn.` };
          }
          facts.push({ label, value });
        }
        values[key] = facts;
        break;
      }
      case "underklubber": {
        if (!Array.isArray(raw) || raw.length > LIST_MAX || raw.some((v) => typeof v !== "string")) {
          return { ok: false, message: `Underklubber kan ha maks ${LIST_MAX} navn.` };
        }
        const list = (raw as string[]).map((v) => v.trim()).filter(Boolean);
        if (list.some((v) => v.length > 200)) return { ok: false, message: "Underklubb-navn maks 200 tegn." };
        values[key] = list;
        break;
      }
      case "hidden_profile_years": {
        if (!Array.isArray(raw) || raw.some((y) => !(PROFILE_YEARS as readonly unknown[]).includes(y))) {
          return { ok: false, message: "Ugyldige profilår." };
        }
        values[key] = [...new Set(raw as number[])].sort();
        break;
      }
      case "image_ext": {
        if (!(IMAGE_EXTS as readonly unknown[]).includes(raw)) return { ok: false, message: "Ugyldig bildeformat." };
        values[key] = raw;
        break;
      }
    }
  }
  return { ok: true, values };
}
