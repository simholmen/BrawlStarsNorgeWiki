import type { Metadata } from "next";
import { SITE_TITLE } from "@/lib/slug";

// What the site collects and why. Keep in sync with docs/analytics.js (the PostHog setup) and the
// login flow (Supabase + Discord).

export const metadata: Metadata = { title: `Personvern - ${SITE_TITLE}` };

export default function PrivacyPage() {
  return (
    <div className="auth-panel">
      <h2>Personvern</h2>

      <h3>Besøksstatistikk</h3>
      <p>
        Vi bruker PostHog for å se hvordan siden brukes, så vi kan gjøre den bedre. Vi ser hvilke sider
        som besøkes, hvor lenge man blir på hver side, hva man klikker på, hvilken side man kom fra og
        hva slags nettleser og enhet som brukes.
      </p>
      <ul>
        <li>
          <strong>Ingen informasjonskapsler (cookies).</strong> Statistikken lagrer ingenting i
          nettleseren din, så den kan ikke kjenne deg igjen fra dag til dag eller på andre nettsider.
        </li>
        <li>
          <strong>Ingen opptak.</strong> Vi tar ikke opp skjermen din og lagrer ikke hva du skriver.
        </li>
        <li>
          <strong>IP-adressen lagres ikke.</strong> Den brukes bare til å telle unike besøk og fjernes
          før noe lagres.
        </li>
        <li>
          <strong>Lagres i EU.</strong> Dataene ligger hos PostHog i Frankfurt, og sendes via vår egen
          server.
        </li>
      </ul>

      <h3>Innlogging</h3>
      <p>
        Logger du inn med Discord, får vi Discord-brukernavnet, visningsnavnet og profilbildet ditt,
        ikke e-post eller meldinger. Da lagres en informasjonskapsel som holder deg innlogget. Endringer
        du gjør på wikien lagres i sidehistorikken sammen med navnet ditt.
      </p>
      <p>
        Statistikken vet bare om du er innlogget, redaktør eller admin, ikke hvem du er. Slik kan vi
        holde redaktørenes egne besøk utenfor tallene.
      </p>

      <h3>Spørsmål</h3>
      <p>Lurer du på noe, eller vil du ha slettet kontoen din? Ta kontakt med <strong>Zimma2832</strong> på Discord.</p>
    </div>
  );
}
