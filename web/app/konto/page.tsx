import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getLatestOwnRequest, getRole } from "@/lib/auth";
import { SITE_TITLE } from "@/lib/slug";
import { Avatar, LogoutButton, formatDate } from "@/components/AuthBits";
import RequestForm from "./RequestForm";

export const metadata: Metadata = { title: `Min konto - ${SITE_TITLE}`, robots: { index: false } };

export default function AccountPage() {
  return (
    <div className="auth-panel">
      <h2>Min konto</h2>
      <Suspense fallback={<p className="auth-small">Laster …</p>}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) redirect("/logg-inn/?next=/konto/");

  const [role, request] = await Promise.all([getRole(user.id), getLatestOwnRequest(user.id)]);

  return (
    <>
      <div className="auth-user">
        <Avatar url={user.avatarUrl} name={user.name} size={48} />
        <div>
          <strong>{user.name}</strong>
          {user.discordName && user.discordName !== user.name && (
            <div className="auth-small">@{user.discordName}</div>
          )}
        </div>
      </div>

      {role === "admin" && (
        <p className="auth-status ok">
          Du er <strong>administrator</strong>. <a href="/admin/tilgang/">Behandle forespørsler →</a>
        </p>
      )}
      {role === "editor" && (
        <p className="auth-status ok">
          Du er <strong>redaktør</strong>. Redigering kommer snart på selve sidene.
        </p>
      )}
      {!role && request?.status === "pending" && (
        <p className="auth-status">
          Forespørselen din ble sendt {formatDate(request.created_at)} og venter på godkjenning.
          <br />
          <span className="auth-small">«{request.message}»</span>
        </p>
      )}
      {!role && request?.status === "denied" && (
        <>
          <p className="auth-status bad">Forespørselen din fra {formatDate(request.created_at)} ble avslått.</p>
          <RequestForm again />
        </>
      )}
      {!role && (!request || request.status === "approved") && (
        <>
          <p>
            Du kan lese wikien, men ikke redigere. Vil du hjelpe til, send en forespørsel, så
            godkjenner en administrator den.
          </p>
          <RequestForm />
        </>
      )}

      <LogoutButton />
    </>
  );
}
