import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, getRole, type AccessRequest } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SITE_TITLE } from "@/lib/slug";
import { Avatar, formatDate } from "@/components/AuthBits";
import ActionButton from "./ActionButton";
import { approveRequest, denyRequest, revokeEditor } from "./actions";

export const metadata: Metadata = { title: `Tilgang - ${SITE_TITLE}`, robots: { index: false } };

type Editor = { user_id: string; role: "admin" | "editor"; display_name: string | null; added_at: string };

export default function AccessAdminPage() {
  return (
    <div className="auth-panel wide">
      <h2>Redigeringstilgang</h2>
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <AccessAdmin />
      </Suspense>
    </div>
  );
}

async function AccessAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/logg-inn/?next=/admin/tilgang/");
  // Non-admins get the ordinary not-found page; the data below would be empty for them anyway
  // (RLS), and the actions would be refused by the database.
  if ((await getRole(user.id)) !== "admin") notFound();

  const supabase = await createClient();
  const [pendingRes, recentRes, editorsRes] = await Promise.all([
    supabase.from("access_requests").select("*").eq("status", "pending").order("created_at"),
    supabase
      .from("access_requests")
      .select("*")
      .neq("status", "pending")
      .order("reviewed_at", { ascending: false })
      .limit(20),
    supabase.from("editors").select("user_id,role,display_name,added_at").order("added_at"),
  ]);
  const pending = (pendingRes.data ?? []) as AccessRequest[];
  const recent = (recentRes.data ?? []) as AccessRequest[];
  const editors = (editorsRes.data ?? []) as Editor[];

  return (
    <>
      <h3>Ventende forespørsler ({pending.length})</h3>
      {pending.length === 0 && <p className="auth-small">Ingen forespørsler venter.</p>}
      <ul className="auth-list">
        {pending.map((r) => (
          <li key={r.id}>
            <div className="auth-user">
              <Avatar url={r.avatar_url} name={r.display_name ?? "?"} />
              <div>
                <strong>{r.display_name ?? "Ukjent"}</strong>
                {r.discord_username && <span className="auth-small"> @{r.discord_username}</span>}
                <div className="auth-small">{formatDate(r.created_at)}</div>
              </div>
            </div>
            <p className="auth-message">{r.message}</p>
            <div className="auth-actions">
              <ActionButton action={approveRequest} fields={{ id: r.id }} label="Godkjenn" />
              <ActionButton action={denyRequest} fields={{ id: r.id }} label="Avslå" variant="secondary" />
            </div>
          </li>
        ))}
      </ul>

      <h3>Redaktører ({editors.length})</h3>
      <ul className="auth-list">
        {editors.map((e) => (
          <li key={e.user_id} className="auth-row">
            <div>
              <strong>{e.display_name ?? "Ukjent"}</strong>{" "}
              <span className="auth-small">
                {e.role === "admin" ? "administrator" : "redaktør"} · siden {formatDate(e.added_at)}
              </span>
            </div>
            {e.user_id !== user.id && (
              <ActionButton
                action={revokeEditor}
                fields={{ user_id: e.user_id }}
                label="Fjern"
                confirm={`Ja, fjern ${e.display_name ?? "tilgangen"}`}
                variant="danger"
              />
            )}
          </li>
        ))}
      </ul>

      {recent.length > 0 && (
        <>
          <h3>Siste avgjørelser</h3>
          <ul className="auth-list compact">
            {recent.map((r) => (
              <li key={r.id}>
                <strong>{r.display_name ?? "Ukjent"}</strong>{" "}
                <span className={r.status === "approved" ? "auth-ok" : "auth-error"}>
                  {r.status === "approved" ? "godkjent" : "avslått"}
                </span>{" "}
                <span className="auth-small">{r.reviewed_at && formatDate(r.reviewed_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
