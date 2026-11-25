// Images uploaded from the Markdown editor into the Supabase Storage bucket `wiki-images`
// (supabase/migrations/019_wiki_images.sql). Shared by the browser (upload) and the pages
// (deciding which <img> sources to keep). The bucket and its RLS policy are what actually
// enforce these rules; the checks here exist for clear Norwegian messages.

export const WIKI_IMAGE_BUCKET = "wiki-images";
export const WIKI_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Same rule as the storage policy: <yyyy-mm>/<lowercase id>.<ext>. */
const NAME_RE = /^[0-9]{4}-[0-9]{2}\/[a-z0-9-]{8,64}\.(jpg|png|webp|gif)$/;

export const WIKI_IMAGE_ACCEPT = Object.keys(EXT_BY_TYPE).join(",");

/**
 * Shape of any wiki-images URL, without knowing the project URL (so it works in tests and in
 * validation). Same rule as public.valid_wiki_image_url() in migration 020. Pages additionally
 * check the project with isUploadedImage before rendering.
 */
const WIKI_IMAGE_URL_RE =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/wiki-images\/[0-9]{4}-[0-9]{2}\/[a-z0-9-]{8,64}\.(jpg|png|webp|gif)$/;

export function isWikiImageUrl(url: unknown): url is string {
  return typeof url === "string" && WIKI_IMAGE_URL_RE.test(url);
}

/** Public URL prefix of the bucket, e.g. https://x.supabase.co/storage/v1/object/public/wiki-images/ */
export function uploadedImagePrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${WIKI_IMAGE_BUCKET}/`;
}

/** True if `src` points at a well-formed file in this project's wiki-images bucket. */
export function isUploadedImage(src: string, supabaseUrl: string): boolean {
  const prefix = uploadedImagePrefix(supabaseUrl);
  return src.startsWith(prefix) && NAME_RE.test(src.slice(prefix.length));
}

/** Null if the file can be uploaded, otherwise a message for the editor. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!EXT_BY_TYPE[file.type]) return "Bare JPG, PNG, WebP og GIF kan lastes opp.";
  if (file.size > WIKI_IMAGE_MAX_BYTES) return "Bildet er større enn 5 MB.";
  return null;
}

/** Object name for a new upload: <yyyy-mm>/<uuid>.<ext> (month in UTC). */
export function newImageName(type: string, now = new Date(), id: string = crypto.randomUUID()): string {
  const ext = EXT_BY_TYPE[type];
  if (!ext) throw new Error(`Unsupported image type ${type}`);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${month}/${id.toLowerCase()}.${ext}`;
}

/** Default alt text from a file name: "mitt_bilde-2.png" -> "mitt bilde 2"; pasted images -> "bilde". */
export function altFromFileName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[_-]+/g, " ").replace(/[[\]]/g, "").trim();
  return !base || /^image$/i.test(base) ? "bilde" : base;
}
