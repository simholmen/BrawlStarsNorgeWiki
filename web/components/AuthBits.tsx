// Small shared pieces for the account/admin pages (server-renderable).

const dateFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Oslo",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Discord avatars come from cdn.discordapp.com; fall back to the first letter. */
export function Avatar({ url, name, size = 32 }: { url: string | null; name: string; size?: number }) {
  if (!url) {
    return (
      <span className="auth-avatar fallback" style={{ width: size, height: size }} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external avatar, tiny, no optimization needed
    <img className="auth-avatar" src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  );
}

export function LogoutButton() {
  return (
    <form method="post" action="/auth/logg-ut/" className="auth-logout">
      <button type="submit" className="auth-button secondary">
        Logg ut
      </button>
    </form>
  );
}
