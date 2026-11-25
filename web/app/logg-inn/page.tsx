import type { Metadata } from "next";
import { SITE_TITLE } from "@/lib/slug";
import LoginButton from "./LoginButton";

export const metadata: Metadata = { title: `Logg inn - ${SITE_TITLE}`, robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="auth-panel">
      <h2>Logg inn</h2>
      <p>
        Logg inn med Discord for å be om redigeringstilgang til wikien. Innlogging alene gir ingen
        tilgang; en administrator godkjenner hver forespørsel.
      </p>
      <LoginButton />
      <p className="auth-small">
        Vi får bare Discord-brukernavnet og profilbildet ditt, ikke e-post eller meldinger.
      </p>
    </div>
  );
}
