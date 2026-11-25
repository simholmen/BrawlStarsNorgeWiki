"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RequestState = { ok: boolean; message: string } | null;

const MAX = 500;

// Inserts only the message: the database trigger sets who sent it, the status and the Discord
// details, and RLS rejects anything that isn't the visitor's own request.
export async function sendAccessRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { ok: false, message: "Skriv en kort melding først." };
  if (message.length > MAX) return { ok: false, message: `Meldingen kan være maks ${MAX} tegn.` };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: "Du er ikke logget inn lenger. Logg inn på nytt." };

  const { error } = await supabase.from("access_requests").insert({ message });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Du har allerede en forespørsel som venter." };
    if (error.code === "P0001") return { ok: false, message: error.message };
    return { ok: false, message: "Kunne ikke sende forespørselen. Prøv igjen senere." };
  }

  revalidatePath("/konto/");
  return { ok: true, message: "Forespørselen er sendt." };
}
