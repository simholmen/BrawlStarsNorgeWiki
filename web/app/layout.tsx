import type { Metadata } from "next";
import Script from "next/script";
import Header from "@/components/Header";
import PageNav from "@/components/PageNav";
import "./wiki.css";
import "./auth.css";
import "./editor.css";
import "./content.css";

// Port of docs/_layouts/default.html. wiki.css is an unchanged copy of docs/style.css.

export const metadata: Metadata = {
  title: "Brawl Stars Norge Wiki",
  description: "Norsk Brawl Stars wiki",
  icons: { icon: { url: "/images/bsnorge.jpg", type: "image/jpg" } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="no">
      <body>
        <div id="content">
          <Header />
          <PageNav />
          {children}
        </div>
        {/* Table sorting used by /wiki/ and /diverse/mz-turneringer/ (served by Caddy from docs/). */}
        <Script src="/script.js" strategy="afterInteractive" />
        {/* Visitor analytics (PostHog, cookieless); see docs/analytics.js. */}
        <Script src="/analytics.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
