"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import { checkImageFile, newImageName, WIKI_IMAGE_BUCKET } from "@/lib/uploads";
import { track } from "@/lib/analytics";

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Upload one image straight from the browser to the wiki-images bucket, as the logged-in editor
 * (the storage policy only lets editors insert). Returns the file's public URL.
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const problem = checkImageFile(file);
  if (problem) return { ok: false, message: problem };

  const storage = getBrowserClient().storage.from(WIKI_IMAGE_BUCKET);
  const name = newImageName(file.type);
  const { error } = await storage.upload(name, file, {
    contentType: file.type,
    cacheControl: "31536000", // names are random and never reused, so cache for a year
    upsert: false,
  });
  if (error) return { ok: false, message: uploadMessage(error.message) };
  track("image_uploaded", { type: file.type, kb: Math.round(file.size / 1024) });
  return { ok: true, url: storage.getPublicUrl(name).data.publicUrl };
}

function uploadMessage(raw: string): string {
  if (/row-level security|unauthorized|jwt/i.test(raw)) {
    return "Du har ikke tilgang til å laste opp bilder (er du logget inn som redaktør?).";
  }
  if (/size|too large|payload/i.test(raw)) return "Bildet er for stort (maks 5 MB).";
  if (/mime|type/i.test(raw)) return "Bare JPG, PNG, WebP og GIF kan lastes opp.";
  return `Opplastingen feilet: ${raw}`;
}
