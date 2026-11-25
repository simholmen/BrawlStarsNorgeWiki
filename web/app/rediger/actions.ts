"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateChanges, FIELD_LABELS, type Changes, type EntityKind } from "@/lib/fields";
import { imageKeyFor, slugify } from "@/lib/slugify";

// Writes for people/clubs. Every call runs as the logged-in visitor (publishable key + their
// session), so the database decides: RLS lets only editors insert/update, a trigger locks
// slug/id/image_key and records every changed field in `revisions`. The checks here exist to give
// clear Norwegian messages, not for security.

const TABLE = { person: "people", club: "clubs" } as const;
const TAG = { person: "people", club: "clubs" } as const;
const PATH = { person: "/personer/", club: "/klubber/" } as const;

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; message: string; conflict?: { by: string | null; at: string } };

export type CreateResult = { ok: true; url: string } | { ok: false; message: string };

export type RevertResult = { ok: boolean; message: string };

async function requireEditor() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, error: "Du er ikke logget inn lenger. Logg inn på nytt." };
  const { data: editor } = await supabase.from("editors").select("role").eq("user_id", userId).maybeSingle();
  if (!editor) return { supabase, error: "Du har ikke redigeringstilgang." };
  return { supabase, error: null };
}

/**
 * Save the changed fields of one page. `expectedUpdatedAt` is the row's updated_at when the
 * editor opened it; if someone saved in between, nothing is written and the result says who.
 */
export async function saveEntity(
  kind: EntityKind,
  slug: string,
  expectedUpdatedAt: string,
  changes: Changes,
): Promise<SaveResult> {
  if (kind !== "person" && kind !== "club") return { ok: false, message: "Ukjent sidetype." };
  const checked = validateChanges(kind, changes);
  if (!checked.ok) return checked;
  if (Object.keys(checked.values).length === 0) return { ok: false, message: "Ingen endringer å lagre." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data, error: dbError } = await supabase
    .from(TABLE[kind])
    .update(checked.values)
    .eq("slug", slug)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (dbError) return { ok: false, message: dbMessage(dbError) };

  if (!data || data.length === 0) {
    // Either the page changed since it was opened, or it doesn't exist.
    const { data: row } = await supabase.from(TABLE[kind]).select("id, updated_at").eq("slug", slug).maybeSingle();
    if (!row) return { ok: false, message: "Siden finnes ikke lenger." };
    const { data: last } = await supabase
      .from("revisions")
      .select("user_name, created_at")
      .eq("entity_id", row.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      ok: false,
      message: "Siden ble endret av noen andre mens du redigerte.",
      conflict: { by: last?.user_name ?? null, at: last?.created_at ?? row.updated_at },
    };
  }

  updateTag(TAG[kind]);
  return { ok: true, updatedAt: data[0].updated_at as string };
}

/** Create a person/club page. The URL is derived from the name and can't change later. */
export async function createEntity(kind: EntityKind, changes: Changes): Promise<CreateResult> {
  if (kind !== "person" && kind !== "club") return { ok: false, message: "Ukjent sidetype." };
  const checked = validateChanges(kind, changes);
  if (!checked.ok) return checked;
  const name = checked.values.name;
  if (typeof name !== "string" || !name) return { ok: false, message: "Navn kan ikke være tomt." };

  const slug = slugify(name);
  if (!slug) return { ok: false, message: "Navnet må inneholde minst én bokstav eller ett tall." };

  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: existing } = await supabase.from(TABLE[kind]).select("slug").eq("slug", slug).maybeSingle();
  if (existing) return { ok: false, message: `Det finnes allerede en side på ${PATH[kind]}${slug}/.` };

  const body =
    kind === "person"
      ? "## Bakgrunn\n\n\n## Karriere\n\n\n## Prestasjoner\n\n"
      : "## Bakgrunn {#bakgrunn}\n\n\n## Klubben {#karriere}\n\n\n## Prestasjoner {#prestasjoner}\n\n";

  const { error: dbError } = await supabase
    .from(TABLE[kind])
    .insert({ ...checked.values, slug, image_key: imageKeyFor(name), body_md: checked.values.body_md ?? body });
  if (dbError) {
    if (dbError.code === "23505") return { ok: false, message: `Det finnes allerede en side på ${PATH[kind]}${slug}/.` };
    return { ok: false, message: dbMessage(dbError) };
  }

  updateTag(TAG[kind]);
  return { ok: true, url: `${PATH[kind]}${encodeURIComponent(slug)}/` };
}

/** Put one field back to the value it had before a recorded change (itself recorded as an edit). */
export async function revertRevision(revisionId: number): Promise<RevertResult> {
  if (!Number.isSafeInteger(revisionId)) return { ok: false, message: "Ugyldig endring." };
  const { supabase, error } = await requireEditor();
  if (error) return { ok: false, message: error };

  const { data: rev } = await supabase
    .from("revisions")
    .select("entity, entity_id, field, old_value")
    .eq("id", revisionId)
    .maybeSingle();
  if (!rev) return { ok: false, message: "Fant ikke endringen." };
  if (rev.field === "*") return { ok: false, message: "Opprettelsen av en side kan ikke tilbakestilles her." };

  const kind = rev.entity as EntityKind;
  const checked = validateChanges(kind, { [rev.field]: rev.old_value });
  if (!checked.ok) return { ok: false, message: checked.message };

  const { data, error: dbError } = await supabase
    .from(TABLE[kind])
    .update(checked.values)
    .eq("id", rev.entity_id)
    .select("slug");
  if (dbError) return { ok: false, message: dbMessage(dbError) };
  if (!data?.length) return { ok: false, message: "Siden finnes ikke lenger." };

  updateTag(TAG[kind]);
  return { ok: true, message: `${FIELD_LABELS[rev.field] ?? rev.field} er tilbakestilt.` };
}

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "23514") return "Verdien er ugyldig eller for lang.";
  if (error.code === "42501") return "Du har ikke tilgang til å gjøre dette.";
  return "Kunne ikke lagre. Prøv igjen.";
}
