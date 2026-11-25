// Port of docs/_includes/header.html.

export default function Header() {
  return (
    <div className="header-container">
      <a href="/wiki/">
        {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
        <img src="/images/bsnorge.jpg" className="responsive-bsnorge" alt="Logo" />
      </a>
      <h1>Brawl Stars Norge Wiki</h1>
    </div>
  );
}
