/**
 * Where to send someone after login. Only same-site absolute paths are allowed ("/konto/"), never
 * "//evil.example" or "https://..." — otherwise the login link could be abused as an open
 * redirect.
 */
export function safeNext(next: string | null | undefined, fallback = "/konto/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  return next;
}
