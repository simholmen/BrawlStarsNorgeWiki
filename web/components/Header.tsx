import UserMenu from "./UserMenu";

// Port of the old Jekyll docs/_includes/header.html (removed), plus the login menu (renders nothing for logged-out
// visitors until it has checked, so the static page matches the old header).

export default function Header() {
  return (
    <div className="header-container">
      <a href="/wiki/">
        {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
        <img src="/images/bsnorge.jpg" className="responsive-bsnorge" alt="Logo" />
      </a>
      <h1>Brawl Stars Norge Wiki</h1>
      <UserMenu />
    </div>
  );
}
