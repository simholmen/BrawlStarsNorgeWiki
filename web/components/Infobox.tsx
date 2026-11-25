import type { ReactNode } from "react";
import type { Fact } from "@/lib/types";
import { renderInline } from "@/lib/markdown";

// The infobox table shared by the person and club layouts (docs/_layouts/{person,klubb}.html).

export type InfoRow = { label: string; value: ReactNode };

export function Infobox({
  title,
  image,
  rows,
  facts,
}: {
  title: ReactNode;
  image: { src: string; alt: string } | null;
  rows: InfoRow[];
  facts: Fact[];
}) {
  return (
    <div className="infobox">
      <div className="infobox-title">{title}</div>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy
        <img src={image.src} alt={image.alt} />
      )}
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
          {facts.map((fact, i) => (
            <tr key={`fact-${i}`}>
              <th>{fact.label}</th>
              <td dangerouslySetInnerHTML={{ __html: renderInline(fact.value) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toc({ items }: { items: Array<[href: string, label: string]> }) {
  return (
    <div id="toc">
      <h2>Innhold</h2>
      <ul>
        {items.map(([href, label]) => (
          <li key={href}>
            <a href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProfileFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="bsprofil-container">
      {/* eslint-disable-next-line @next/next/no-img-element -- static file served by Caddy */}
      <img src={src} alt={alt} className="bsprofil" />
      <figcaption className="bsprofil-caption">{caption}</figcaption>
    </figure>
  );
}
