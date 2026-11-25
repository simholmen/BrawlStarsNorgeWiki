import { Fragment } from "react";
import { FIELD_LABELS } from "@/lib/fields";
import { diffLines } from "@/lib/diff";
import { formatDate } from "@/components/AuthBits";
import RevertButton from "./RevertButton";

// Renders revisions grouped per save (same transaction), newest first, with old -> new per field
// and a "Tilbakestill" button per field.

export type Revision = {
  id: number;
  entity: "person" | "club";
  entity_slug: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  user_name: string | null;
  user_id: string | null;
  tx_id: number;
  created_at: string;
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v && typeof v === "object" && "label" in v ? `${(v as { label: string }).label}: ${(v as { value: string }).value}` : String(v),
      )
      .join("\n");
  }
  return JSON.stringify(value);
}

function pageHref(r: Revision) {
  return `${r.entity === "person" ? "/personer/" : "/klubber/"}${r.entity_slug}/`;
}

function FieldChange({ r }: { r: Revision }) {
  if (r.field === "*") {
    return <p className="auth-small">Siden ble opprettet.</p>;
  }
  const oldText = asText(r.old_value);
  const newText = asText(r.new_value);
  const multiline = oldText.includes("\n") || newText.includes("\n") || oldText.length + newText.length > 160;

  return (
    <div className="rev-field">
      <div className="rev-field-head">
        <strong>{FIELD_LABELS[r.field] ?? r.field}</strong>
        <RevertButton id={r.id} />
      </div>
      {multiline ? (
        <pre className="rev-diff">
          {diffLines(oldText, newText).map((line, i) =>
            line.type === "gap" ? (
              <span key={i} className="gap">
                … {line.count} uendrede linjer …{"\n"}
              </span>
            ) : (
              <span key={i} className={line.type}>
                {line.type === "add" ? "+ " : line.type === "del" ? "− " : "  "}
                {line.text}
                {"\n"}
              </span>
            ),
          )}
        </pre>
      ) : (
        <p className="rev-inline">
          <del>{oldText || "(tom)"}</del> → <ins>{newText || "(tom)"}</ins>
        </p>
      )}
    </div>
  );
}

export default function RevisionList({ revisions, showPage }: { revisions: Revision[]; showPage: boolean }) {
  if (revisions.length === 0) return <p className="auth-small">Ingen endringer ennå.</p>;

  // Group consecutive rows of the same save.
  const groups: Revision[][] = [];
  for (const r of revisions) {
    const last = groups[groups.length - 1];
    if (last && last[0].tx_id === r.tx_id && last[0].entity_slug === r.entity_slug) last.push(r);
    else groups.push([r]);
  }

  return (
    <ul className="auth-list rev-list">
      {groups.map((g) => (
        <li key={g[0].id}>
          <div className="rev-head">
            <strong>{g[0].user_id ? (g[0].user_name ?? "Ukjent") : "Import fra Markdown"}</strong>{" "}
            <span className="auth-small">{formatDate(g[0].created_at)}</span>
            {showPage && (
              <>
                {" · "}
                <a href={pageHref(g[0])}>{g[0].entity_slug}</a>
              </>
            )}
          </div>
          {g.map((r) => (
            <Fragment key={r.id}>
              <FieldChange r={r} />
            </Fragment>
          ))}
        </li>
      ))}
    </ul>
  );
}
