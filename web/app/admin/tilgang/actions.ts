"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Each action just calls the database function as the logged-in user. The functions check
// is_admin() themselves, so a non-admin calling these (e.g. by crafting a request) gets refused
// by Postgres, whatever this file does.

export type AdminState = { ok: boolean; message: string } | null;

async function call(fn: string, args: Record<string, string>, done: string): Promise<AdminState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  revalidatePath("/admin/tilgang/");
  if (error) return { ok: false, message: error.message || "Noe gikk galt." };
  return { ok: true, message: done };
}

function id(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Ugyldig id");
  return value;
}

export async function approveRequest(_prev: AdminState, formData: FormData) {
  return call("approve_access_request", { request_id: id(formData, "id") }, "Godkjent.");
}

export async function denyRequest(_prev: AdminState, formData: FormData) {
  return call("deny_access_request", { request_id: id(formData, "id") }, "Avslått.");
}

export async function revokeEditor(_prev: AdminState, formData: FormData) {
  return call("revoke_editor", { target: id(formData, "user_id") }, "Tilgangen er fjernet.");
}
